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

contract("Native token adapter - Gmp handler - [Deposit]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const expectedDepositNonce = 1;

  const depositorAddress = accounts[1];
  const recipientAddress = accounts[3];

  const resourceID = "0x0000000000000000000000000000000000000000000000000000000000000500";
  const depositAmount = Ethers.utils.parseEther("1");
  const fee = Ethers.utils.parseEther("0.1");


  let BridgeInstance;
  let DestinationAdapterInstance;
  let BasicFeeHandlerInstance;
  let FeeHandlerRouterInstance;
  let depositFunctionSignature;
  let GmpHandlerInstance;

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

    // set MPC address to unpause the Bridge
    await BridgeInstance.endKeygen(Helpers.mpcAddress);

    // send ETH to destination adapter for transfers
    await web3.eth.sendTransaction({
      from: depositorAddress,
      to: DestinationAdapterInstance.address,
      value: "1000000000000000000"
    })
  });

  it("deposit can be made successfully", async () => {
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
  });

  it("depositEvent is emitted with expected values", async () => {
    const depositTx = await OriginAdapterInstance.deposit(
      originDomainID,
      DestinationAdapterInstance.address,
      recipientAddress,
      {
        from: depositorAddress,
        value: depositAmount,
      }
    );

    const internalTx = await TruffleAssert.createTransactionResult(
      BridgeInstance,
      depositTx.tx
    );

    TruffleAssert.eventEmitted(internalTx, "Deposit", (event) => {
      return (
        event.destinationDomainID.toNumber() === originDomainID &&
        event.resourceID === resourceID.toLowerCase() &&
        event.depositNonce.toNumber() === expectedDepositNonce &&
        event.user === OriginAdapterInstance.address
      );
    });
  });
});
