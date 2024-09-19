// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");

const Helpers = require("../helpers");

const DefaultMessageReceiverContract = artifacts.require("DefaultMessageReceiver");
const ERC20MintableContract = artifacts.require("ERC20PresetMinterPauser");
const TestForwarderContract = artifacts.require("TestForwarder");

contract("DefaultMessageReceiver - direct interaction", async (accounts) => {
  const adminAddress = accounts[0];
  const handlerAddress = accounts[1];
  const evmRecipientAddress = accounts[2];
  const relayer1Address = accounts[3];

  const transactionId = "0x0000000000000000000000000000000000000000000000000000000000000111";
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  let DefaultMessageReceiverInstance;
  let ERC20MintableInstance;
  let TestForwarderInstance;
  let TestForwarderInstance2;
  let SYGMA_HANDLER_ROLE;

  beforeEach(async () => {
    DefaultMessageReceiverInstance = await DefaultMessageReceiverContract.new([handlerAddress], 100000);
    SYGMA_HANDLER_ROLE = await DefaultMessageReceiverInstance.SYGMA_HANDLER_ROLE();

    ERC20MintableInstance = await ERC20MintableContract.new(
      "token",
      "TOK"
    );
    TestForwarderInstance = await TestForwarderContract.new();
    TestForwarderInstance2 = await TestForwarderContract.new();

    await ERC20MintableInstance.grantRole(
      await ERC20MintableInstance.MINTER_ROLE(),
      adminAddress
    );
  });

  it("should have valid defaults", async () => {
    assert.equal(await DefaultMessageReceiverInstance._recoverGas(), 100000);
    assert.isTrue(await DefaultMessageReceiverInstance.hasRole(SYGMA_HANDLER_ROLE, handlerAddress));
  });

  it("should revert if caller doesn't have sygma handler role", async () => {
    await Helpers.expectToRevertWithCustomError(
      DefaultMessageReceiverInstance.handleSygmaMessage.call(ZERO_ADDRESS, 0, "0x", {
        from: adminAddress,
      }),
      "InsufficientPermission()"
    );
  });

  it("should revert on performActions if caller is not itself", async () => {
    await Helpers.expectToRevertWithCustomError(
      DefaultMessageReceiverInstance.performActions.call(ZERO_ADDRESS, ZERO_ADDRESS, 0, [], {
        from: adminAddress,
      }),
      "InsufficientPermission()"
    );
  });

  it("should revert on transferBalanceAction if caller is not itself", async () => {
    await Helpers.expectToRevertWithCustomError(
      DefaultMessageReceiverInstance.transferBalanceAction.call(ZERO_ADDRESS, ZERO_ADDRESS, {
        from: adminAddress,
      }),
      "InsufficientPermission()"
    );
  });

  it("should revert if message encoding is invalid", async () => {
    await Helpers.reverts(
      DefaultMessageReceiverInstance.handleSygmaMessage(ZERO_ADDRESS, 0, "0x11", {
        from: handlerAddress,
      })
    );
  });

  it("should revert if insufficient gas limit left for executing action", async () => {
    const actions = [];
    const message = Helpers.createMessageCallData(
      transactionId,
      actions,
      evmRecipientAddress
    );
    await Helpers.expectToRevertWithCustomError(
      DefaultMessageReceiverInstance.handleSygmaMessage.call(ZERO_ADDRESS, 0, message, {
        from: handlerAddress,
        gas: 100000,
      }),
      "InsufficientGasLimit()"
    );
  });

  it("should pass without actions", async () => {
    const actions = [];
    const message = Helpers.createMessageCallData(
      transactionId,
      actions,
      evmRecipientAddress
    );
    await DefaultMessageReceiverInstance.handleSygmaMessage(ZERO_ADDRESS, 0, message, {
      from: handlerAddress,
      gas: 200000,
    });
  });

  it("should not return native token if not received during handling", async () => {
    const actions = [];
    await web3.eth.sendTransaction({
      from: adminAddress,
      to: DefaultMessageReceiverInstance.address,
      value: 100,
    });
    const message = Helpers.createMessageCallData(
      transactionId,
      actions,
      TestForwarderInstance.address // will revert if received native
    );
    await DefaultMessageReceiverInstance.handleSygmaMessage(ZERO_ADDRESS, 0, message, {
      from: handlerAddress,
      gas: 200000,
    });
    assert.equal(await web3.eth.getBalance(DefaultMessageReceiverInstance.address), 100);
  });

  it("should return full native token balance if contract balance increased during handling", async () => {
    const actions = [];
    await web3.eth.sendTransaction({
      from: adminAddress,
      to: DefaultMessageReceiverInstance.address,
      value: 100,
    });
    const message = Helpers.createMessageCallData(
      transactionId,
      actions,
      evmRecipientAddress
    );
    const balanceBefore = await Helpers.getBalance(evmRecipientAddress);
    await DefaultMessageReceiverInstance.handleSygmaMessage(ZERO_ADDRESS, 0, message, {
      from: handlerAddress,
      gas: 200000,
      value: 100,
    });
    const balanceAfter = await Helpers.getBalance(evmRecipientAddress);
    assert.equal(balanceAfter, balanceBefore + 200n);
    assert.equal(await Helpers.getBalance(DefaultMessageReceiverInstance.address), 0n);
  });

  it("should return full original token sent balance", async () => {
    const actions = [];
    await ERC20MintableInstance.mint(DefaultMessageReceiverInstance.address, 333);
    const message = Helpers.createMessageCallData(
      transactionId,
      actions,
      evmRecipientAddress
    );
    await DefaultMessageReceiverInstance.handleSygmaMessage(
      ERC20MintableInstance.address,
      333,
      message,
      {
        from: handlerAddress,
        gas: 200000,
      }
    );
    const balanceAfter = await Helpers.getTokenBalance(ERC20MintableInstance, evmRecipientAddress);
    assert.equal(balanceAfter, 333n);
    assert.equal(await Helpers.getTokenBalance(ERC20MintableInstance, DefaultMessageReceiverInstance.address), 0n);
  });

  it("should return full native token balance if contract balance increased during handling and actions reverted", async () => {
    const actions = [{
      nativeValue: 100,
      callTo: TestForwarderInstance.address,
      approveTo: ZERO_ADDRESS,
      tokenSend: ZERO_ADDRESS,
      tokenReceive: ZERO_ADDRESS,
      data: "0x",
    }];
    await web3.eth.sendTransaction({
      from: adminAddress,
      to: DefaultMessageReceiverInstance.address,
      value: 100,
    });
    const message = Helpers.createMessageCallData(
      transactionId,
      actions,
      evmRecipientAddress
    );
    const balanceBefore = await Helpers.getBalance(evmRecipientAddress);
    const tx = await DefaultMessageReceiverInstance.handleSygmaMessage(ZERO_ADDRESS, 0, message, {
      from: handlerAddress,
      gas: 200000,
      value: 100,
    });
    const balanceAfter = await Helpers.getBalance(evmRecipientAddress);
    assert.equal(balanceAfter, balanceBefore + 200n);
    assert.equal(await Helpers.getBalance(DefaultMessageReceiverInstance.address), 0n);
    TruffleAssert.eventEmitted(tx, "TransferRecovered", (event) => {
      return (
        event.transactionId === transactionId &&
        event.tokenSend === ZERO_ADDRESS &&
        event.receiver === evmRecipientAddress &&
        event.amount.toNumber() === 0
      );
    });
  });

  it("should return full original token sent balance if actions reverted", async () => {
    const actions = [{
      nativeValue: 0,
      callTo: TestForwarderInstance.address,
      approveTo: ZERO_ADDRESS,
      tokenSend: ERC20MintableInstance.address,
      tokenReceive: ZERO_ADDRESS,
      data: "0x",
    }];
    await ERC20MintableInstance.mint(DefaultMessageReceiverInstance.address, 333);
    const message = Helpers.createMessageCallData(
      transactionId,
      actions,
      evmRecipientAddress
    );
    const tx = await DefaultMessageReceiverInstance.handleSygmaMessage(
      ERC20MintableInstance.address,
      333,
      message,
      {
        from: handlerAddress,
        gas: 200000,
      }
    );
    const balanceAfter = await Helpers.getTokenBalance(ERC20MintableInstance, evmRecipientAddress);
    assert.equal(balanceAfter, 333n);
    assert.equal(await Helpers.getTokenBalance(ERC20MintableInstance, DefaultMessageReceiverInstance.address), 0n);
    TruffleAssert.eventEmitted(tx, "TransferRecovered", (event) => {
      return (
        event.transactionId === transactionId &&
        event.tokenSend === ERC20MintableInstance.address &&
        event.receiver === evmRecipientAddress &&
        event.amount.toNumber() === 333
      );
    });
  });

  it("should return action tokens leftovers", async () => {
    const actions = [{
      nativeValue: 0,
      callTo: ERC20MintableInstance.address,
      approveTo: ZERO_ADDRESS,
      tokenSend: ZERO_ADDRESS,
      tokenReceive: ERC20MintableInstance.address,
      data: (await ERC20MintableInstance.transfer.request(adminAddress, 33)).data,
    }];
    await ERC20MintableInstance.mint(DefaultMessageReceiverInstance.address, 333);
    const message = Helpers.createMessageCallData(
      transactionId,
      actions,
      evmRecipientAddress
    );
    const tx = await DefaultMessageReceiverInstance.handleSygmaMessage(
      ZERO_ADDRESS,
      0,
      message,
      {
        from: handlerAddress,
        gas: 200000,
      }
    );
    const balanceAfter = await Helpers.getTokenBalance(ERC20MintableInstance, evmRecipientAddress);
    assert.equal(balanceAfter, 300n);
    assert.equal(await Helpers.getTokenBalance(ERC20MintableInstance, DefaultMessageReceiverInstance.address), 0n);
    assert.equal(await Helpers.getTokenBalance(ERC20MintableInstance, adminAddress), 33n);
    TruffleAssert.eventEmitted(tx, "Executed", (event) => {
      return (
        event.transactionId === transactionId &&
        event.tokenSend === ZERO_ADDRESS &&
        event.receiver === evmRecipientAddress &&
        event.amount.toNumber() === 0
      );
    });
  });

  it("should give approval to the approveTo then revoke it", async () => {
    // DMR -> TestForwarder.execute -> TestForwarder2.execute -> Token.transferFrom(DMR, admin)
    const transferFrom = (await ERC20MintableInstance.transferFrom.request(DefaultMessageReceiverInstance.address, adminAddress, 33)).data;
    const transferFromExecute = (await TestForwarderInstance2.execute.request(transferFrom, ERC20MintableInstance.address, ZERO_ADDRESS)).data;
    const actions = [{
      nativeValue: 0,
      callTo: TestForwarderInstance.address,
      approveTo: TestForwarderInstance2.address,
      tokenSend: ERC20MintableInstance.address,
      tokenReceive: ZERO_ADDRESS,
      data: (await TestForwarderInstance.execute.request(transferFromExecute, TestForwarderInstance2.address, ZERO_ADDRESS)).data,
    }];
    await ERC20MintableInstance.mint(DefaultMessageReceiverInstance.address, 333);
    const message = Helpers.createMessageCallData(
      transactionId,
      actions,
      evmRecipientAddress
    );
    const tx = await DefaultMessageReceiverInstance.handleSygmaMessage(
      ERC20MintableInstance.address,
      333,
      message,
      {
        from: handlerAddress,
        gas: 500000,
      }
    );
    const balanceAfter = await Helpers.getTokenBalance(ERC20MintableInstance, evmRecipientAddress);
    assert.equal(balanceAfter, 300n);
    assert.equal(await Helpers.getTokenBalance(ERC20MintableInstance, DefaultMessageReceiverInstance.address), 0n);
    assert.equal(await Helpers.getTokenBalance(ERC20MintableInstance, adminAddress), 33n);
    TruffleAssert.eventEmitted(tx, "Executed", (event) => {
      return (
        event.transactionId === transactionId &&
        event.tokenSend === ERC20MintableInstance.address &&
        event.receiver === evmRecipientAddress &&
        event.amount.toNumber() === 333
      );
    });
    assert.equal(await ERC20MintableInstance.allowance(DefaultMessageReceiverInstance.address, TestForwarderInstance2.address), 0n);
    assert.equal(await ERC20MintableInstance.allowance(DefaultMessageReceiverInstance.address, TestForwarderInstance.address), 0n);
  });

  it("should revert if callTo is EOA and data is not empty", async () => {
    const actions = [{
      nativeValue: 0,
      callTo: adminAddress,
      approveTo: ZERO_ADDRESS,
      tokenSend: ZERO_ADDRESS,
      tokenReceive: ZERO_ADDRESS,
      data: "0x11",
    }];
    const message = Helpers.createMessageCallData(
      transactionId,
      actions,
      evmRecipientAddress
    );
    const tx = await DefaultMessageReceiverInstance.handleSygmaMessage(
      ZERO_ADDRESS,
      0,
      message,
      {
        from: handlerAddress,
        gas: 200000,
      }
    );
    TruffleAssert.eventEmitted(tx, "TransferRecovered", (event) => {
      return (
        event.transactionId === transactionId &&
        event.tokenSend === ZERO_ADDRESS &&
        event.receiver === evmRecipientAddress &&
        event.amount.toNumber() === 0
      );
    });
  });

  it("should succeed if callTo is EOA and data is empty", async () => {
    const actions = [{
      nativeValue: 0,
      callTo: adminAddress,
      approveTo: ZERO_ADDRESS,
      tokenSend: ZERO_ADDRESS,
      tokenReceive: ZERO_ADDRESS,
      data: "0x",
    }];
    const message = Helpers.createMessageCallData(
      transactionId,
      actions,
      evmRecipientAddress
    );
    const tx = await DefaultMessageReceiverInstance.handleSygmaMessage(
      ZERO_ADDRESS,
      0,
      message,
      {
        from: handlerAddress,
        gas: 200000,
      }
    );
    TruffleAssert.eventEmitted(tx, "Executed", (event) => {
      return (
        event.transactionId === transactionId &&
        event.tokenSend === ZERO_ADDRESS &&
        event.receiver === evmRecipientAddress &&
        event.amount.toNumber() === 0
      );
    });
  });

  it("should send native token as part of the action", async () => {
    const actions = [{
      nativeValue: 100,
      callTo: relayer1Address,
      approveTo: ZERO_ADDRESS,
      tokenSend: ZERO_ADDRESS,
      tokenReceive: ZERO_ADDRESS,
      data: "0x",
    }];
    const message = Helpers.createMessageCallData(
      transactionId,
      actions,
      evmRecipientAddress
    );
    const balanceBefore = await Helpers.getBalance(relayer1Address);
    const tx = await DefaultMessageReceiverInstance.handleSygmaMessage(
      ZERO_ADDRESS,
      0,
      message,
      {
        from: handlerAddress,
        gas: 200000,
        value: 300,
      }
    );
    const balanceAfter = await Helpers.getBalance(relayer1Address);
    assert.equal(balanceAfter, balanceBefore + 100n);
    assert.equal(await Helpers.getBalance(DefaultMessageReceiverInstance.address), 0n);
    TruffleAssert.eventEmitted(tx, "Executed", (event) => {
      return (
        event.transactionId === transactionId &&
        event.tokenSend === ZERO_ADDRESS &&
        event.receiver === evmRecipientAddress &&
        event.amount.toNumber() === 0
      );
    });
  });

  it("should revert if has too little gas after actions", async () => {
    // DMR -> TestForwarder.execute -> TestForwarder2.execute -> Token.transferFrom(DMR, admin)
    const transferFrom = (await ERC20MintableInstance.transferFrom.request(DefaultMessageReceiverInstance.address, adminAddress, 33)).data;
    const transferFromExecute = (await TestForwarderInstance2.execute.request(transferFrom, ERC20MintableInstance.address, ZERO_ADDRESS)).data;
    const actions = [{
      nativeValue: 0,
      callTo: TestForwarderInstance.address,
      approveTo: TestForwarderInstance2.address,
      tokenSend: ERC20MintableInstance.address,
      tokenReceive: ZERO_ADDRESS,
      data: (await TestForwarderInstance.execute.request(transferFromExecute, TestForwarderInstance2.address, ZERO_ADDRESS)).data,
    }];
    await ERC20MintableInstance.mint(DefaultMessageReceiverInstance.address, 333);
    const message = Helpers.createMessageCallData(
      transactionId,
      actions,
      evmRecipientAddress
    );
    await Helpers.expectToRevertWithCustomError(
      DefaultMessageReceiverInstance.handleSygmaMessage.call(
        ERC20MintableInstance.address,
        333,
        message,
        {
          from: handlerAddress,
          gas: 200000,
        }
      ),
      "InsufficientGasLimit()"
    );
  });

  it("should execute transferBalanceAction", async () => {
    const actions = [{
      nativeValue: 0,
      callTo: DefaultMessageReceiverInstance.address,
      approveTo: ZERO_ADDRESS,
      tokenSend: ZERO_ADDRESS,
      tokenReceive: ZERO_ADDRESS,
      data: (await DefaultMessageReceiverInstance.transferBalanceAction.request(ZERO_ADDRESS, relayer1Address)).data,
    }, {
      nativeValue: 0,
      callTo: DefaultMessageReceiverInstance.address,
      approveTo: ZERO_ADDRESS,
      tokenSend: ZERO_ADDRESS,
      tokenReceive: ZERO_ADDRESS,
      data: (await DefaultMessageReceiverInstance.transferBalanceAction.request(ERC20MintableInstance.address, relayer1Address)).data,
    }];
    const message = Helpers.createMessageCallData(
      transactionId,
      actions,
      evmRecipientAddress
    );
    await ERC20MintableInstance.mint(DefaultMessageReceiverInstance.address, 333);
    const balanceBefore = await Helpers.getBalance(relayer1Address);
    const tx = await DefaultMessageReceiverInstance.handleSygmaMessage(
      ZERO_ADDRESS,
      0,
      message,
      {
        from: handlerAddress,
        gas: 200000,
        value: 300,
      }
    );
    const balanceAfter = await Helpers.getBalance(relayer1Address);
    assert.equal(balanceAfter, balanceBefore + 300n);
    assert.equal(await Helpers.getBalance(DefaultMessageReceiverInstance.address), 0n);
    assert.equal(await Helpers.getTokenBalance(ERC20MintableInstance, DefaultMessageReceiverInstance.address), 0n);
    assert.equal(await Helpers.getTokenBalance(ERC20MintableInstance, relayer1Address), 333n);
    TruffleAssert.eventEmitted(tx, "Executed", (event) => {
      return (
        event.transactionId === transactionId &&
        event.tokenSend === ZERO_ADDRESS &&
        event.receiver === evmRecipientAddress &&
        event.amount.toNumber() === 0
      );
    });
  });
});
