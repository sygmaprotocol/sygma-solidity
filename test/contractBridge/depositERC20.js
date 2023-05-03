/**
 * Copyright 2020 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */

const TruffleAssert = require("truffle-assertions");

const Helpers = require("../helpers");

const ERC20MintableContract = artifacts.require("ERC20PresetMinterPauser");
const ERC20MintableContractMock = artifacts.require("ERC20PresetMinterPauserMock");
const ERC20HandlerContract = artifacts.require("ERC20Handler");

contract("Bridge - [deposit - ERC20]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const adminAddress = accounts[0];
  const depositorAddress = accounts[1];
  const recipientAddress = accounts[2];

  const originChainInitialTokenAmount = 100;
  const depositAmount = 10;
  const expectedDepositNonce = 1;
  const feeData = "0x";
  const emptySetResourceData = "0x";

  let BridgeInstance;
  let OriginERC20MintableInstance;
  let OriginERC20MintableInstanceMock;
  let OriginERC20HandlerInstance;
  let depositData;
  let initialResourceIDs;

  beforeEach(async () => {
    await Promise.all([
      ERC20MintableContract.new("token", "TOK").then(
        (instance) => (OriginERC20MintableInstance = instance)
      ),
      ERC20MintableContractMock.new("token", "TOK").then(
        (instance) => (OriginERC20MintableInstanceMock = instance)
      ),
      (BridgeInstance = await Helpers.deployBridge(
        originDomainID,
        adminAddress
      )),
    ]);

    const resourceID1 = Helpers.createResourceID(
      OriginERC20MintableInstance.address,
      originDomainID
    );
    const resourceID2 = Helpers.createResourceID(
      OriginERC20MintableInstanceMock.address,
      originDomainID
    );

    initialResourceIDs = [resourceID1, resourceID2];

    OriginERC20HandlerInstance = await ERC20HandlerContract.new(
      BridgeInstance.address
    );

    await Promise.all([
      BridgeInstance.adminSetResource(
        OriginERC20HandlerInstance.address,
        initialResourceIDs[0],
        OriginERC20MintableInstance.address,
        emptySetResourceData
      ),
      BridgeInstance.adminSetResource(
        OriginERC20HandlerInstance.address,
        initialResourceIDs[1],
        OriginERC20MintableInstanceMock.address,
        emptySetResourceData
      ),
      OriginERC20MintableInstance.mint(
        depositorAddress,
        originChainInitialTokenAmount
      ),
      OriginERC20MintableInstanceMock.mint(
        depositorAddress,
        originChainInitialTokenAmount
      ),
    ]);
    await OriginERC20MintableInstance.approve(
      OriginERC20HandlerInstance.address,
      depositAmount * 2,
      {from: depositorAddress}
    );
    await OriginERC20MintableInstanceMock.approve(
      OriginERC20HandlerInstance.address,
      depositAmount,
      {from: depositorAddress}
    );

    depositData = Helpers.createERCDepositData(
      depositAmount,
      20,
      recipientAddress
    );

    // set MPC address to unpause the Bridge
    await BridgeInstance.endKeygen(Helpers.mpcAddress);
  });

  it("[sanity] test depositorAddress' balance", async () => {
    const originChainDepositorBalance =
      await OriginERC20MintableInstance.balanceOf(depositorAddress);
    assert.strictEqual(
      originChainDepositorBalance.toNumber(),
      originChainInitialTokenAmount
    );
  });

  it("[sanity] test OriginERC20HandlerInstance.address' allowance", async () => {
    const originChainHandlerAllowance =
      await OriginERC20MintableInstance.allowance(
        depositorAddress,
        OriginERC20HandlerInstance.address
      );
    assert.strictEqual(
      originChainHandlerAllowance.toNumber(),
      depositAmount * 2
    );
  });

  it("ERC20 deposit can be made", async () => {
    await TruffleAssert.passes(
      BridgeInstance.deposit(
        destinationDomainID,
        initialResourceIDs[0],
        depositData,
        feeData,
        {from: depositorAddress}
      )
    );
  });

  it("_depositCounts should be increments from 0 to 1", async () => {
    await BridgeInstance.deposit(
      destinationDomainID,
      initialResourceIDs[0],
      depositData,
      feeData,
      {from: depositorAddress}
    );

    const depositCount = await BridgeInstance._depositCounts.call(
      destinationDomainID
    );
    assert.strictEqual(depositCount.toNumber(), expectedDepositNonce);
  });

  it("ERC20 can be deposited with correct balances", async () => {
    await BridgeInstance.deposit(
      destinationDomainID,
      initialResourceIDs[0],
      depositData,
      feeData,
      {from: depositorAddress}
    );

    const originChainDepositorBalance =
      await OriginERC20MintableInstance.balanceOf(depositorAddress);
    assert.strictEqual(
      originChainDepositorBalance.toNumber(),
      originChainInitialTokenAmount - depositAmount
    );

    const originChainHandlerBalance =
      await OriginERC20MintableInstance.balanceOf(
        OriginERC20HandlerInstance.address
      );
    assert.strictEqual(originChainHandlerBalance.toNumber(), depositAmount);
  });

  it("Deposit event is fired with expected value", async () => {
    let depositTx = await BridgeInstance.deposit(
      destinationDomainID,
      initialResourceIDs[0],
      depositData,
      feeData,
      {from: depositorAddress}
    );

    TruffleAssert.eventEmitted(depositTx, "Deposit", (event) => {
      return (
        event.destinationDomainID.toNumber() === destinationDomainID &&
        event.resourceID === initialResourceIDs[0].toLowerCase() &&
        event.depositNonce.toNumber() === expectedDepositNonce
      );
    });

    depositTx = await BridgeInstance.deposit(
      destinationDomainID,
      initialResourceIDs[0],
      depositData,
      feeData,
      {from: depositorAddress}
    );

    TruffleAssert.eventEmitted(depositTx, "Deposit", (event) => {
      return (
        event.destinationDomainID.toNumber() === destinationDomainID &&
        event.resourceID === initialResourceIDs[0].toLowerCase() &&
        event.depositNonce.toNumber() === expectedDepositNonce + 1
      );
    });
  });

  it("deposit requires resourceID that is mapped to a handler", async () => {
    await Helpers.expectToRevertWithCustomError(
      BridgeInstance.deposit(destinationDomainID, "0x0", depositData, feeData, {
        from: depositorAddress,
      }),
      "ResourceIDNotMappedToHandler()"
    );
  });

  it("Deposit destination domain can not be current bridge domain ", async () => {
    await Helpers.expectToRevertWithCustomError(
      BridgeInstance.deposit(originDomainID, "0x0", depositData, feeData, {
        from: depositorAddress,
      }),
      "DepositToCurrentDomain()"
    );
  });

  it("should revert if ERC20Safe contract call fails", async () => {
    await TruffleAssert.reverts(
      BridgeInstance.deposit(
        destinationDomainID,
        initialResourceIDs[1],
        depositData,
        feeData,
        {from: depositorAddress}
      ),
      "ERC20: operation did not succeed"
    );
  });
});
