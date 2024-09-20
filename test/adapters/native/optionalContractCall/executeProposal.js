// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");

const Helpers = require("../../../helpers");

const DefaultMessageReceiverContract = artifacts.require("DefaultMessageReceiver");
const NativeTokenHandlerContract = artifacts.require("NativeTokenHandler");
const NativeTokenAdapterContract = artifacts.require("NativeTokenAdapter");
const BasicFeeHandlerContract = artifacts.require("BasicFeeHandler");
const FeeHandlerRouterContract = artifacts.require("FeeHandlerRouter");
const ERC20MintableContract = artifacts.require("ERC20PresetMinterPauser");

contract("Bridge - [execute proposal - native token]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const adminAddress = accounts[0];
  const depositorAddress = accounts[1];
  const evmRecipientAddress = accounts[2];
  const relayer1Address = accounts[3];

  const expectedDepositNonce = 1;
  const emptySetResourceData = "0x";
  const resourceID = "0x0000000000000000000000000000000000000000000000000000000000000650";
  const depositAmount = Ethers.utils.parseEther("1");
  const fee = Ethers.utils.parseEther("0.1");
  const transferredAmount = depositAmount.sub(fee);
  const transactionId = "0x0000000000000000000000000000000000000000000000000000000000000001";
  const executionGasAmount = 30000000;
  const amountToMint = 20;

  let BridgeInstance;
  let DefaultMessageReceiverInstance;
  let NativeTokenHandlerInstance;
  let BasicFeeHandlerInstance;
  let FeeHandlerRouterInstance;
  let NativeTokenAdapterInstance;
  let ERC20MintableInstance;
  let proposal;
  let depositProposalData;
  let dataHash;
  let message;

  beforeEach(async () => {
    await Promise.all([
      (BridgeInstance = await Helpers.deployBridge(
        destinationDomainID,
        adminAddress
      )),
    ]);


    FeeHandlerRouterInstance = await FeeHandlerRouterContract.new(
      BridgeInstance.address
    );
    BasicFeeHandlerInstance = await BasicFeeHandlerContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );
    NativeTokenAdapterInstance = await NativeTokenAdapterContract.new(
      BridgeInstance.address,
      resourceID
    );
    DefaultMessageReceiverInstance = await DefaultMessageReceiverContract.new([], 100000);
    NativeTokenHandlerInstance = await NativeTokenHandlerContract.new(
      BridgeInstance.address,
      NativeTokenAdapterInstance.address,
      DefaultMessageReceiverInstance.address,
    );
    await DefaultMessageReceiverInstance.grantRole(
      await DefaultMessageReceiverInstance.SYGMA_HANDLER_ROLE(),
      NativeTokenHandlerInstance.address
    );
    ERC20MintableInstance = await ERC20MintableContract.new(
      "token",
      "TOK"
    );

    await BridgeInstance.adminSetResource(
        NativeTokenHandlerInstance.address,
        resourceID,
        Ethers.constants.AddressZero,
        emptySetResourceData
      );
    await BasicFeeHandlerInstance.changeFee(destinationDomainID, resourceID, fee);
    await BridgeInstance.adminChangeFeeHandler(FeeHandlerRouterInstance.address),
    await FeeHandlerRouterInstance.adminSetResourceHandler(
      originDomainID,
      resourceID,
      BasicFeeHandlerInstance.address
    ),

    await ERC20MintableInstance.grantRole(
      await ERC20MintableInstance.MINTER_ROLE(),
      DefaultMessageReceiverInstance.address
    );

    const mintableERC20Iface = new Ethers.utils.Interface(["function mint(address to, uint256 amount)"]);
    const actions = [{
      nativeValue: 0,
      callTo: ERC20MintableInstance.address,
      approveTo: Ethers.constants.AddressZero,
      tokenSend: Ethers.constants.AddressZero,
      tokenReceive: Ethers.constants.AddressZero,
      data: mintableERC20Iface.encodeFunctionData("mint", [evmRecipientAddress, "20"]),
    }]
    message = Helpers.createMessageCallData(
      transactionId,
      actions,
      evmRecipientAddress
    );

    depositProposalData = Helpers.createOptionalContractCallDepositData(
      transferredAmount,
      Ethers.constants.AddressZero,
      executionGasAmount,
      message
    );

    proposal = {
      originDomainID: originDomainID,
      depositNonce: expectedDepositNonce,
      resourceID: resourceID,
      data: depositProposalData
    };

    dataHash = Ethers.utils.keccak256(
      NativeTokenHandlerInstance.address + depositProposalData.substr(2)
    );

    // set MPC address to unpause the Bridge
    await BridgeInstance.endKeygen(Helpers.mpcAddress);
  });

  it("isProposalExecuted returns false if depositNonce is not used", async () => {
    const destinationDomainID = await BridgeInstance._domainID();

    assert.isFalse(
      await BridgeInstance.isProposalExecuted(
        destinationDomainID,
        expectedDepositNonce
      )
    );
  });

  it("should create and execute executeProposal with contract call successfully", async () => {
    const proposalSignedData = await Helpers.signTypedProposal(
      BridgeInstance.address,
      [proposal]
    );

    // depositorAddress makes initial deposit of depositAmount
    assert.isFalse(await BridgeInstance.paused());
    await TruffleAssert.passes(
      NativeTokenAdapterInstance.depositToEVMWithMessage(
        originDomainID,
        Ethers.constants.AddressZero,
        executionGasAmount,
        message,
        {
          from: depositorAddress,
          value: depositAmount
      })
    );

    const recipientNativeBalanceBefore = await web3.eth.getBalance(evmRecipientAddress);
    const recipientERC20BalanceBefore = await ERC20MintableInstance.balanceOf(evmRecipientAddress);
    const defaultReceiverBalanceBefore = await web3.eth.getBalance(DefaultMessageReceiverInstance.address);

    await TruffleAssert.passes(
      BridgeInstance.executeProposal(proposal, proposalSignedData, {
        from: relayer1Address,
        gas: executionGasAmount
      })
    );

    // check that deposit nonce has been marked as used in bitmap
    assert.isTrue(
      await BridgeInstance.isProposalExecuted(
        originDomainID,
        expectedDepositNonce
      )
    );

    // check that tokens are transferred to recipient address
    const recipientNativeBalanceAfter = await web3.eth.getBalance(evmRecipientAddress);
    const recipientERC20BalanceAfter = await ERC20MintableInstance.balanceOf(evmRecipientAddress);
    const defaultReceiverBalanceAfter = await web3.eth.getBalance(DefaultMessageReceiverInstance.address);

    assert.strictEqual(
      transferredAmount.add(recipientNativeBalanceBefore).toString(),
      recipientNativeBalanceAfter
    );
    assert.strictEqual(new Ethers.BigNumber.from(amountToMint).add(
      recipientERC20BalanceBefore.toString()).toString(), recipientERC20BalanceAfter.toString()
    );
    assert.strictEqual(defaultReceiverBalanceBefore.toString(), defaultReceiverBalanceAfter.toString());
  });

  it("should skip executing proposal if deposit nonce is already used", async () => {
    const proposalSignedData = await Helpers.signTypedProposal(
      BridgeInstance.address,
      [proposal]
    );

    // depositorAddress makes initial deposit of depositAmount
    assert.isFalse(await BridgeInstance.paused());
    await TruffleAssert.passes(
      NativeTokenAdapterInstance.depositToEVMWithMessage(
        originDomainID,
        Ethers.constants.AddressZero,
        executionGasAmount,
        message,
      {
        from: depositorAddress,
        value: depositAmount
      })
    );

    await TruffleAssert.passes(
      BridgeInstance.executeProposal(proposal, proposalSignedData, {
        from: relayer1Address,
        gas: executionGasAmount
      })
    );

    const skipExecuteTx = await BridgeInstance.executeProposal(
      proposal,
      proposalSignedData,
      {
        from: relayer1Address,
        gas: executionGasAmount
      }
    );

    // check that no ProposalExecution events are emitted
    assert.equal(skipExecuteTx.logs.length, 0);
  });

  it("executeProposal event should be emitted with expected values", async () => {
    const proposalSignedData = await Helpers.signTypedProposal(
      BridgeInstance.address,
      [proposal]
    );

    // depositorAddress makes initial deposit of depositAmount
    assert.isFalse(await BridgeInstance.paused());
    await TruffleAssert.passes(
      NativeTokenAdapterInstance.depositToEVMWithMessage(
        originDomainID,
        Ethers.constants.AddressZero,
        executionGasAmount,
        message,
      {
        from: depositorAddress,
        value: depositAmount
      })
    );

    const recipientBalanceBefore = await web3.eth.getBalance(evmRecipientAddress);

    const proposalTx = await BridgeInstance.executeProposal(
      proposal,
      proposalSignedData,
      {
        from: relayer1Address,
        gas: executionGasAmount
      }
    );

    TruffleAssert.eventEmitted(proposalTx, "ProposalExecution", (event) => {
      return (
        event.originDomainID.toNumber() === originDomainID &&
        event.depositNonce.toNumber() === expectedDepositNonce &&
        event.dataHash === dataHash &&
        event.handlerResponse === Ethers.utils.defaultAbiCoder.encode(
          ["address", "address", "uint256"],
          [Ethers.constants.AddressZero, DefaultMessageReceiverInstance.address, transferredAmount]
        )
      );
    });

    // check that deposit nonce has been marked as used in bitmap
    assert.isTrue(
      await BridgeInstance.isProposalExecuted(
        originDomainID,
        expectedDepositNonce
      )
    );


    // check that tokens are transferred to recipient address
    const recipientBalanceAfter = await web3.eth.getBalance(evmRecipientAddress);
    assert.strictEqual(transferredAmount.add(recipientBalanceBefore).toString(), recipientBalanceAfter);
  });

  it(`should fail to executeProposal if signed Proposal has different
    chainID than the one on which it should be executed`, async () => {
    const proposalSignedData =
      await Helpers.mockSignTypedProposalWithInvalidChainID(
        BridgeInstance.address,
        [proposal]
      );

    // depositorAddress makes initial deposit of depositAmount
    assert.isFalse(await BridgeInstance.paused());
    await TruffleAssert.passes(
      NativeTokenAdapterInstance.depositToEVMWithMessage(
        originDomainID,
        Ethers.constants.AddressZero,
        executionGasAmount,
        message,
      {
        from: depositorAddress,
        value: depositAmount
      })
    );

    await Helpers.expectToRevertWithCustomError(
      BridgeInstance.executeProposal(proposal, proposalSignedData, {
        from: relayer1Address,
      }),
      "InvalidProposalSigner()"
    );
  });

  it("should revert if handler does not have SYGMA_HANDLER_ROLE", async () => {
    await DefaultMessageReceiverInstance.revokeRole(
      await DefaultMessageReceiverInstance.SYGMA_HANDLER_ROLE(),
      NativeTokenHandlerInstance.address
    );
    const proposalSignedData = await Helpers.signTypedProposal(
      BridgeInstance.address,
      [proposal]
    );

    // depositorAddress makes initial deposit of depositAmount
    assert.isFalse(await BridgeInstance.paused());
    await TruffleAssert.passes(
      NativeTokenAdapterInstance.depositToEVMWithMessage(
        originDomainID,
        Ethers.constants.AddressZero,
        executionGasAmount,
        message,
      {
        from: depositorAddress,
        value: depositAmount
      })
    );

      const executeTx = await BridgeInstance.executeProposal(
        proposal,
        proposalSignedData,
        {
          from: relayer1Address,
          gas: executionGasAmount
        }
      );

    TruffleAssert.eventEmitted(executeTx, "FailedHandlerExecution", (event) => {
      return (
        event.originDomainID.toNumber() === originDomainID &&
        event.depositNonce.toNumber() === expectedDepositNonce &&
        event.lowLevelData === "0xdeda9030" // InsufficientPermission()
      );
    });
  });

  it("should revert if insufficient gas limit left for executing action", async () => {
    const insufficientExecutionGasAmount = 100000;
    const proposalSignedData = await Helpers.signTypedProposal(
      BridgeInstance.address,
      [proposal]
    );

    // depositorAddress makes initial deposit of depositAmount
    assert.isFalse(await BridgeInstance.paused());
    await TruffleAssert.passes(
      NativeTokenAdapterInstance.depositToEVMWithMessage(
        originDomainID,
        Ethers.constants.AddressZero,
        insufficientExecutionGasAmount,
        message,
      {
        from: depositorAddress,
        value: depositAmount
      })
    );

      const executeTx = await BridgeInstance.executeProposal(
        proposal,
        proposalSignedData,
        {
          from: relayer1Address,
          gas: insufficientExecutionGasAmount
        }
      );

    TruffleAssert.eventEmitted(executeTx, "FailedHandlerExecution", (event) => {
      return (
        event.originDomainID.toNumber() === originDomainID &&
        event.depositNonce.toNumber() === expectedDepositNonce &&
        event.lowLevelData === "0x60ee1247" // InsufficientGasLimit()
      );
    });
  });
});
