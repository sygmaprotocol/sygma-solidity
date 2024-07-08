// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");
const Helpers = require("../../helpers");

const NativeTokenGmpAdapterContract = artifacts.require("NativeTokenGmpAdapter");
const GmpHandlerContract = artifacts.require(
  "GmpHandler"
);
const BasicFeeHandlerContract = artifacts.require("BasicFeeHandler");
const FeeHandlerRouterContract = artifacts.require("FeeHandlerRouter");

contract("Native token adapter - Gmp handler - [Execute Proposal]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const expectedDepositNonce = 1;

  const depositorAddress = accounts[1];
  const relayer1Address = accounts[2];
  const invalidDepositorAddress = accounts[2];
  const recipientAddress = accounts[3];

  const resourceID = "0x0000000000000000000000000000000000000000000000000000000000000500";
  const destinationMaxFee = 900000;
  const depositAmount = Ethers.utils.parseEther("1");
  const fee = Ethers.utils.parseEther("0.1");
  const transferredAmount = depositAmount.sub(fee);


  let BridgeInstance;
  let NativeTokenGmpAdapterInstance;
  let BasicFeeHandlerInstance;
  let FeeHandlerRouterInstance;
  let depositFunctionSignature;
  let GmpHandlerInstance;
  let depositData;

  beforeEach(async () => {
    await Promise.all([
      (BridgeInstance = await Helpers.deployBridge(
        destinationDomainID,
        accounts[0]
      ))
    ]);


    FeeHandlerRouterInstance = await FeeHandlerRouterContract.new(
      BridgeInstance.address
    );
    BasicFeeHandlerInstance = await BasicFeeHandlerContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );

    GmpHandlerInstance = await GmpHandlerContract.new(BridgeInstance.address);
    NativeTokenGmpAdapterInstance = await NativeTokenGmpAdapterContract.new(
      BridgeInstance.address,
      GmpHandlerInstance.address,
      resourceID
    );

    await BridgeInstance.adminChangeFeeHandler(FeeHandlerRouterInstance.address),
    await FeeHandlerRouterInstance.adminSetResourceHandler(
      originDomainID,
      resourceID,
      BasicFeeHandlerInstance.address
    ),
    await BasicFeeHandlerInstance.changeFee(originDomainID, resourceID, fee);

    depositFunctionSignature = Helpers.getFunctionSignature(
      NativeTokenGmpAdapterInstance,
      "transferFunds"
    );

    const GmpHandlerSetResourceData =
      Helpers.constructGenericHandlerSetResourceData(
        depositFunctionSignature,
        Helpers.blankFunctionDepositorOffset,
        Helpers.blankFunctionSig
      );
    await BridgeInstance.adminSetResource(
      GmpHandlerInstance.address,
      resourceID,
      GmpHandlerInstance.address,
      GmpHandlerSetResourceData
    );

    proposal = {
      originDomainID: originDomainID,
      depositNonce: expectedDepositNonce,
      data: depositData,
      resourceID: resourceID,
    };

    // set MPC address to unpause the Bridge
    await BridgeInstance.endKeygen(Helpers.mpcAddress);

    // send ETH to destination adapter for transfers
    await web3.eth.sendTransaction({
      from: depositorAddress,
      to: NativeTokenGmpAdapterInstance.address,
      value: "1000000000000000000"
    })
  });

  it("should successfully transfer native tokens to recipient", async () => {
    const preparedExecutionData = await NativeTokenGmpAdapterInstance.prepareDepositData(
      recipientAddress,
      transferredAmount
    );
    const depositData = Helpers.createGmpDepositData(
      depositFunctionSignature,
      NativeTokenGmpAdapterInstance.address,
      destinationMaxFee,
      NativeTokenGmpAdapterInstance.address,
      preparedExecutionData
    );

    const proposal = {
      originDomainID: originDomainID,
      depositNonce: expectedDepositNonce,
      data: depositData,
      resourceID: resourceID,
    };
    const proposalSignedData = await Helpers.signTypedProposal(
      BridgeInstance.address,
      [proposal]
    );
    await TruffleAssert.passes(
      NativeTokenGmpAdapterInstance.deposit(
        originDomainID,
        recipientAddress,
        {
          from: depositorAddress,
          value: depositAmount,
        }
      )
    );

    const recipientBalanceBefore = await web3.eth.getBalance(recipientAddress);

    // relayer1 executes the proposal
    const executeTx = await BridgeInstance.executeProposal(proposal, proposalSignedData, {
      from: relayer1Address,
    });

    const internalTx = await TruffleAssert.createTransactionResult(
      NativeTokenGmpAdapterInstance,
      executeTx.tx
    );

    // check that ProposalExecution event is emitted
    TruffleAssert.eventEmitted(executeTx, "ProposalExecution", (event) => {
      return (
        event.originDomainID.toNumber() === originDomainID &&
        event.depositNonce.toNumber() === expectedDepositNonce
      );
    });

    TruffleAssert.eventEmitted(internalTx, "FundsTransferred", (event) => {
      return (
        event.recipient === recipientAddress &&
        event.amount.toString() === transferredAmount.toString()
      );
    });

    const recipientBalanceAfter = await web3.eth.getBalance(recipientAddress);
    expect(transferredAmount.add(recipientBalanceBefore).toString()).to.be.equal(recipientBalanceAfter);
  });

  it(`should not revert if encoded depositor is not origin adapter address and
      return InvalidOriginAdapter error in handler response`, async () => {
    const preparedExecutionData = await NativeTokenGmpAdapterInstance.prepareDepositData(
      recipientAddress,
      transferredAmount
    );
    const depositData = Helpers.createGmpDepositData(
      depositFunctionSignature,
      NativeTokenGmpAdapterInstance.address,
      destinationMaxFee,
      invalidDepositorAddress,
      preparedExecutionData
    );

    const proposal = {
      originDomainID: originDomainID,
      depositNonce: expectedDepositNonce,
      data: depositData,
      resourceID: resourceID,
    };
    const proposalSignedData = await Helpers.signTypedProposal(
      BridgeInstance.address,
      [proposal]
    );

    await TruffleAssert.passes(
      NativeTokenGmpAdapterInstance.deposit(
        originDomainID,
        recipientAddress,
        {
          from: depositorAddress,
          value: depositAmount,
        }
      )
    );

    // relayer1 executes the proposal
    const executeTx = await BridgeInstance.executeProposal(proposal, proposalSignedData, {
      from: relayer1Address,
    });

    const iface = new Ethers.utils.Interface(["function InvalidOriginAdapter(address)"])
    const expectedError = iface.encodeFunctionData("InvalidOriginAdapter", [invalidDepositorAddress])
    const expectedHandlerResponse = Ethers.utils.defaultAbiCoder.encode(
      ["bool", "bytes"],
      [false, expectedError]
    );

    const dataHash = Ethers.utils.keccak256(
      GmpHandlerInstance.address + depositData.substr(2)
    );


    TruffleAssert.eventEmitted(executeTx, "ProposalExecution", (event) => {
      return (
        event.originDomainID.toNumber() === originDomainID &&
        event.depositNonce.toNumber() === expectedDepositNonce &&
        event.dataHash === dataHash &&
        event.handlerResponse === expectedHandlerResponse
      )
    })
  });
});
