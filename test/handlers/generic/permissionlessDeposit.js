// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");
const Helpers = require("../../helpers");

const TestStoreContract = artifacts.require("TestStore");
const GmpHandlerContract = artifacts.require(
  "GmpHandler"
);
const WithDepositorContract = artifacts.require("WithDepositor");
const ReturnDataContract = artifacts.require("ReturnData");

contract("GmpHandler - [deposit]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const expectedDepositNonce = 1;

  const depositorAddress = accounts[1];

  const feeData = "0x";
  const destinationMaxFee = 900000;
  const hashOfTestStore = Ethers.utils.keccak256("0xc0ffee");
  const emptySetResourceData = "0x";

  let BridgeInstance;
  let TestStoreInstance;

  let resourceID;
  let depositFunctionSignature;
  let GmpHandlerInstance;
  let depositData;

  beforeEach(async () => {
    await Promise.all([
      (BridgeInstance = await Helpers.deployBridge(
        originDomainID,
        accounts[0]
      )),
      TestStoreContract.new().then(
        (instance) => (TestStoreInstance = instance)
      ),
      WithDepositorContract.new().then(
        (instance) => (WithDepositorInstance = instance)
      ),
      ReturnDataContract.new().then(
        (instance) => (ReturnDataInstance = instance)
      ),
    ]);

    resourceID = Helpers.createResourceID(
      TestStoreInstance.address,
      originDomainID
    );

    GmpHandlerInstance =
      await GmpHandlerContract.new(BridgeInstance.address);

    await BridgeInstance.adminSetResource(
      GmpHandlerInstance.address,
      resourceID,
      TestStoreInstance.address,
      emptySetResourceData
    );

    depositFunctionSignature = Helpers.getFunctionSignature(
      TestStoreInstance,
      "storeWithDepositor"
    );

    depositData = Helpers.createGmpDepositData(
      depositFunctionSignature,
      TestStoreInstance.address,
      destinationMaxFee,
      depositorAddress,
      hashOfTestStore
    );

    // set MPC address to unpause the Bridge
    await BridgeInstance.endKeygen(Helpers.mpcAddress);
  });

  it("deposit can be made successfully", async () => {
    await TruffleAssert.passes(
      BridgeInstance.deposit(
        destinationDomainID,
        resourceID,
        depositData,
        feeData,
        {from: depositorAddress}
      )
    );
  });

  it("depositEvent is emitted with expected values", async () => {
    const depositTx = await BridgeInstance.deposit(
      destinationDomainID,
      resourceID,
      depositData,
      feeData,
      {from: depositorAddress}
    );

    TruffleAssert.eventEmitted(depositTx, "Deposit", (event) => {
      return (
        event.destinationDomainID.toNumber() === destinationDomainID &&
        event.resourceID === resourceID.toLowerCase() &&
        event.depositNonce.toNumber() === expectedDepositNonce &&
        event.user === depositorAddress &&
        event.data === depositData &&
        event.handlerResponse === null
      );
    });
  });

  it("deposit data should be of required length", async () => {
    // Min length is 76 bytes
    const invalidDepositData = "0x" + "aa".repeat(75);

    await TruffleAssert.reverts(
      BridgeInstance.deposit(
        destinationDomainID,
        resourceID,
        invalidDepositData,
        feeData,
        {from: depositorAddress}
      ),
      "Incorrect data length"
    );
  });

  it("should revert if metadata encoded depositor does not match deposit depositor", async () => {
    const invalidDepositorAddress = accounts[2];

    const invalidDepositData = Helpers.createGmpDepositData(
      depositFunctionSignature,
      TestStoreInstance.address,
      destinationMaxFee,
      invalidDepositorAddress,
      hashOfTestStore
    );

    await TruffleAssert.reverts(
      BridgeInstance.deposit(
        destinationDomainID,
        resourceID,
        invalidDepositData,
        feeData,
        {from: depositorAddress}
      ),
      "incorrect depositor in deposit data"
    );
  });


  it("should revert if max fee exceeds 1000000", async () => {
    const invalidMaxFee = 1000001;
    const invalidDepositData = Helpers.createGmpDepositData(
      depositFunctionSignature,
      TestStoreInstance.address,
      invalidMaxFee ,
      depositorAddress,
      hashOfTestStore
    );

    await TruffleAssert.reverts(
      BridgeInstance.deposit(
        destinationDomainID,
        resourceID,
        invalidDepositData,
        feeData,
        {from: depositorAddress}
      ),
      "requested fee too large"
    );
  });
});
