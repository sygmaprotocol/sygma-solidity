// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");
const Helpers = require("../../helpers");

const DestinationAdapterContract = artifacts.require("DestinationAdapter");
const GmpHandlerContract = artifacts.require(
  "GmpHandler"
);
const OriginAdapterContract = artifacts.require("OriginAdapter");
const BasicFeeHandlerContract = artifacts.require("BasicFeeHandler");
const FeeHandlerRouterContract = artifacts.require("FeeHandlerRouter");

contract("Native token adapter - Gmp handler - [Execute Proposal]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const expectedDepositNonce = 1;

  const depositorAddress = accounts[1];
  const relayer1Address = accounts[2];
  const recipientAddress = accounts[3];

  const resourceID = "0x0000000000000000000000000000000000000000000000000000000000000500";
  const destinationMaxFee = 900000;
  const depositAmount = Ethers.utils.parseEther("1");
  const fee = Ethers.utils.parseEther("0.1");
  const transferredAmount = depositAmount.sub(fee);


  let BridgeInstance;
  let DestinationAdapterInstance;
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

    OriginAdapterInstance = await OriginAdapterContract.new(
      BridgeInstance.address,
      BasicFeeHandlerInstance.address,
      resourceID
    );
    GmpHandlerInstance = await GmpHandlerContract.new(BridgeInstance.address);
    DestinationAdapterInstance = await DestinationAdapterContract.new(GmpHandlerInstance.address);

    await BridgeInstance.adminChangeFeeHandler(FeeHandlerRouterInstance.address),
    await FeeHandlerRouterInstance.adminSetResourceHandler(
      originDomainID,
      resourceID,
      BasicFeeHandlerInstance.address
    ),
    await BasicFeeHandlerInstance.changeFee(originDomainID, resourceID, fee);
    await DestinationAdapterInstance.setOriginAdapter(OriginAdapterInstance.address);

    depositFunctionSignature = Helpers.getFunctionSignature(
      DestinationAdapterInstance,
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
      to: DestinationAdapterInstance.address,
      value: "1000000000000000000"
    })
  });

  it("should successfully transfer native tokens to recipient", async () => {
    // const executionData = Helpers.abiEncode(
    //   ["address", "uint256"],
    //   [recipientAddress, transferredAmount]
    // );

    const preparedExecutionData = await OriginAdapterInstance.prepareDepositData(recipientAddress, transferredAmount);
    const depositData = Helpers.createGmpDepositData(
      depositFunctionSignature,
      DestinationAdapterInstance.address,
      destinationMaxFee,
      OriginAdapterInstance.address,
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
      OriginAdapterInstance.deposit(
        originDomainID,
        DestinationAdapterInstance.address,
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
      DestinationAdapterInstance,
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
});
