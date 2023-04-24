/**
 * Copyright 2020 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");
const Helpers = require("../../helpers");

const TestStoreContract = artifacts.require("TestStore");
const PermissionedGenericHandlerContract = artifacts.require(
  "PermissionedGenericHandler"
);
const NoArgumentContract = artifacts.require("NoArgument");
const OneArgumentContract = artifacts.require("OneArgument");
const TwoArgumentsContract = artifacts.require("TwoArguments");
const ThreeArgumentsContract = artifacts.require("ThreeArguments");
const WithDepositorContract = artifacts.require("WithDepositor");
const ReturnDataContract = artifacts.require("ReturnData");
contract("PermissionedGenericHandler - [deposit]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const expectedDepositNonce = 1;

  const depositorAddress = accounts[1];

  const feeData = "0x";

  let BridgeInstance;
  let TestStoreInstance;
  let NoArgumentInstance;
  let OneArgumentInstance;
  let TwoArgumentsInstance;
  let ThreeArgumentsInstance;
  let WithDepositorInstance;
  let ReturnDataInstance;

  let initialResourceIDs;
  let initialContractAddresses;
  let genericHandlerSetResourceData;
  let PermissionedGenericHandlerInstance;
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
      NoArgumentContract.new().then(
        (instance) => (NoArgumentInstance = instance)
      ),
      OneArgumentContract.new().then(
        (instance) => (OneArgumentInstance = instance)
      ),
      TwoArgumentsContract.new().then(
        (instance) => (TwoArgumentsInstance = instance)
      ),
      ThreeArgumentsContract.new().then(
        (instance) => (ThreeArgumentsInstance = instance)
      ),
      WithDepositorContract.new().then(
        (instance) => (WithDepositorInstance = instance)
      ),
      ReturnDataContract.new().then(
        (instance) => (ReturnDataInstance = instance)
      ),
    ]);

    initialResourceIDs = [
      Helpers.createResourceID(TestStoreInstance.address, originDomainID),
      Helpers.createResourceID(NoArgumentInstance.address, originDomainID),
      Helpers.createResourceID(OneArgumentInstance.address, originDomainID),
      Helpers.createResourceID(TwoArgumentsInstance.address, originDomainID),
      Helpers.createResourceID(ThreeArgumentsInstance.address, originDomainID),
      Helpers.createResourceID(WithDepositorInstance.address, originDomainID),
      Helpers.createResourceID(ReturnDataInstance.address, originDomainID),
    ];

    initialContractAddresses = [
      TestStoreInstance.address,
      NoArgumentInstance.address,
      OneArgumentInstance.address,
      TwoArgumentsInstance.address,
      ThreeArgumentsInstance.address,
      WithDepositorInstance.address,
      ReturnDataInstance.address,
    ];

    genericHandlerSetResourceData = [
      Helpers.constructGenericHandlerSetResourceData(
        Helpers.blankFunctionSig,
        Helpers.blankFunctionDepositorOffset,
        Helpers.getFunctionSignature(TestStoreInstance, "store")
      ),
      Helpers.constructGenericHandlerSetResourceData(
        Helpers.getFunctionSignature(NoArgumentInstance, "noArgument"),
        Helpers.blankFunctionDepositorOffset,
        Helpers.blankFunctionSig
      ),
      Helpers.constructGenericHandlerSetResourceData(
        Helpers.getFunctionSignature(OneArgumentInstance, "oneArgument"),
        Helpers.blankFunctionDepositorOffset,
        Helpers.blankFunctionSig
      ),
      Helpers.constructGenericHandlerSetResourceData(
        Helpers.getFunctionSignature(TwoArgumentsInstance, "twoArguments"),
        Helpers.blankFunctionDepositorOffset,
        Helpers.blankFunctionSig
      ),
      Helpers.constructGenericHandlerSetResourceData(
        Helpers.getFunctionSignature(ThreeArgumentsInstance, "threeArguments"),
        Helpers.blankFunctionDepositorOffset,
        Helpers.blankFunctionSig
      ),
      Helpers.constructGenericHandlerSetResourceData(
        Helpers.getFunctionSignature(WithDepositorInstance, "withDepositor"),
        12,
        Helpers.blankFunctionSig
      ),
      Helpers.constructGenericHandlerSetResourceData(
        Helpers.getFunctionSignature(ReturnDataInstance, "returnData"),
        Helpers.blankFunctionDepositorOffset,
        Helpers.blankFunctionSig
      ),
    ];

    PermissionedGenericHandlerInstance =
      await PermissionedGenericHandlerContract.new(BridgeInstance.address);

    await Promise.all([
      BridgeInstance.adminSetResource(
        PermissionedGenericHandlerInstance.address,
        initialResourceIDs[0],
        initialContractAddresses[0],
        genericHandlerSetResourceData[0]
      ),
      BridgeInstance.adminSetResource(
        PermissionedGenericHandlerInstance.address,
        initialResourceIDs[1],
        initialContractAddresses[1],
        genericHandlerSetResourceData[1]
      ),
      BridgeInstance.adminSetResource(
        PermissionedGenericHandlerInstance.address,
        initialResourceIDs[2],
        initialContractAddresses[2],
        genericHandlerSetResourceData[2]
      ),
      BridgeInstance.adminSetResource(
        PermissionedGenericHandlerInstance.address,
        initialResourceIDs[3],
        initialContractAddresses[3],
        genericHandlerSetResourceData[3]
      ),
      BridgeInstance.adminSetResource(
        PermissionedGenericHandlerInstance.address,
        initialResourceIDs[4],
        initialContractAddresses[4],
        genericHandlerSetResourceData[4]
      ),
      BridgeInstance.adminSetResource(
        PermissionedGenericHandlerInstance.address,
        initialResourceIDs[5],
        initialContractAddresses[5],
        genericHandlerSetResourceData[5]
      ),
      BridgeInstance.adminSetResource(
        PermissionedGenericHandlerInstance.address,
        initialResourceIDs[6],
        initialContractAddresses[6],
        genericHandlerSetResourceData[6]
      ),
    ]);

    depositData = Helpers.createPermissionedGenericDepositData("0xdeadbeef");

    // set MPC address to unpause the Bridge
    await BridgeInstance.endKeygen(Helpers.mpcAddress);
  });

  it("deposit can be made successfully", async () => {
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

  it("depositEvent is emitted with expected values", async () => {
    const depositTx = await BridgeInstance.deposit(
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
        event.depositNonce.toNumber() === expectedDepositNonce &&
        event.user === depositorAddress &&
        event.data === depositData &&
        event.handlerResponse === null
      );
    });
  });

  it("noArgument can be called successfully and deposit event is emitted with expected values", async () => {
    const depositTx = await BridgeInstance.deposit(
      destinationDomainID,
      initialResourceIDs[1],
      Helpers.createPermissionedGenericDepositData(null),
      feeData,
      {from: depositorAddress}
    );

    TruffleAssert.eventEmitted(depositTx, "Deposit", (event) => {
      return (
        event.destinationDomainID.toNumber() === destinationDomainID &&
        event.resourceID === initialResourceIDs[1].toLowerCase() &&
        event.depositNonce.toNumber() === expectedDepositNonce &&
        event.user === depositorAddress &&
        event.data === Helpers.createPermissionedGenericDepositData(null) &&
        event.handlerResponse === null
      );
    });

    const internalTx = await TruffleAssert.createTransactionResult(
      NoArgumentInstance,
      depositTx.tx
    );
    TruffleAssert.eventEmitted(internalTx, "NoArgumentCalled");
  });

  it("oneArgument can be called successfully and deposit event is emitted with expected values", async () => {
    const argumentOne = 42;

    const depositTx = await BridgeInstance.deposit(
      destinationDomainID,
      initialResourceIDs[2],
      Helpers.createPermissionedGenericDepositData(
        Helpers.toHex(argumentOne, 32)
      ),
      feeData,
      {from: depositorAddress}
    );

    TruffleAssert.eventEmitted(depositTx, "Deposit", (event) => {
      return (
        event.destinationDomainID.toNumber() === destinationDomainID &&
        event.resourceID === initialResourceIDs[2].toLowerCase() &&
        event.depositNonce.toNumber() === expectedDepositNonce &&
        event.user === depositorAddress &&
        event.data ===
          Helpers.createPermissionedGenericDepositData(
            Helpers.toHex(argumentOne, 32)
          ) &&
        event.handlerResponse === null
      );
    });

    const internalTx = await TruffleAssert.createTransactionResult(
      OneArgumentInstance,
      depositTx.tx
    );
    TruffleAssert.eventEmitted(
      internalTx,
      "OneArgumentCalled",
      (event) => event.argumentOne.toNumber() === argumentOne
    );
  });

  it("twoArguments can be called successfully and deposit event is created with expected values", async () => {
    const argumentOne = [
      NoArgumentInstance.address,
      OneArgumentInstance.address,
      TwoArgumentsInstance.address,
    ];
    const argumentTwo = Helpers.getFunctionSignature(
      TwoArgumentsInstance,
      "twoArguments"
    );
    const encodedMetaData = Helpers.abiEncode(
      ["address[]", "bytes4"],
      [argumentOne, argumentTwo]
    );

    const depositTx = await BridgeInstance.deposit(
      destinationDomainID,
      initialResourceIDs[3],
      Helpers.createPermissionedGenericDepositData(encodedMetaData),
      feeData,
      {from: depositorAddress}
    );

    TruffleAssert.eventEmitted(depositTx, "Deposit", (event) => {
      return (
        event.destinationDomainID.toNumber() === destinationDomainID &&
        event.resourceID === initialResourceIDs[3].toLowerCase() &&
        event.depositNonce.toNumber() === expectedDepositNonce &&
        event.user === depositorAddress &&
        event.data ===
          Helpers.createPermissionedGenericDepositData(encodedMetaData) &&
        event.handlerResponse === null
      );
    });

    const internalTx = await TruffleAssert.createTransactionResult(
      TwoArgumentsInstance,
      depositTx.tx
    );
    TruffleAssert.eventEmitted(internalTx, "TwoArgumentsCalled", (event) => {
      return (
        JSON.stringify(event.argumentOne),
        JSON.stringify(argumentOne) && event.argumentTwo === argumentTwo
      );
    });
  });

  it("threeArguments can be called successfully and deposit event is emitted with expected values", async () => {
    const argumentOne = "soylentGreenIsPeople";
    const argumentTwo = -42;
    const argumentThree = true;
    const encodedMetaData = Helpers.abiEncode(
      ["string", "int8", "bool"],
      [argumentOne, argumentTwo, argumentThree]
    );

    const depositTx = await BridgeInstance.deposit(
      destinationDomainID,
      initialResourceIDs[4],
      Helpers.createPermissionedGenericDepositData(encodedMetaData),
      feeData,
      {from: depositorAddress}
    );

    TruffleAssert.eventEmitted(depositTx, "Deposit", (event) => {
      return (
        event.destinationDomainID.toNumber() === destinationDomainID &&
        event.resourceID === initialResourceIDs[4].toLowerCase() &&
        event.depositNonce.toNumber() === expectedDepositNonce &&
        event.user === depositorAddress &&
        event.data ===
          Helpers.createPermissionedGenericDepositData(encodedMetaData) &&
        event.handlerResponse === null
      );
    });

    const internalTx = await TruffleAssert.createTransactionResult(
      ThreeArgumentsInstance,
      depositTx.tx
    );
    TruffleAssert.eventEmitted(
      internalTx,
      "ThreeArgumentsCalled",
      (event) =>
        event.argumentOne === argumentOne &&
        event.argumentTwo.toNumber() === argumentTwo &&
        event.argumentThree === argumentThree
    );
  });

  it("withDepositor can be called successfully and deposit event is emitted with expected values", async () => {
    const argumentOne = depositorAddress;
    const argumentTwo = 100;
    const encodedMetaData = Helpers.abiEncode(
      ["address", "uint256"],
      [argumentOne, argumentTwo]
    );

    const depositTx = await BridgeInstance.deposit(
      destinationDomainID,
      initialResourceIDs[5],
      Helpers.createPermissionedGenericDepositData(encodedMetaData),
      feeData,
      {from: depositorAddress}
    );

    TruffleAssert.eventEmitted(depositTx, "Deposit", (event) => {
      return (
        event.destinationDomainID.toNumber() === destinationDomainID &&
        event.resourceID === initialResourceIDs[5].toLowerCase() &&
        event.depositNonce.toNumber() === expectedDepositNonce &&
        event.user === depositorAddress &&
        event.data ===
          Helpers.createPermissionedGenericDepositData(encodedMetaData) &&
        event.handlerResponse === null
      );
    });

    const internalTx = await TruffleAssert.createTransactionResult(
      WithDepositorInstance,
      depositTx.tx
    );
    TruffleAssert.eventEmitted(
      internalTx,
      "WithDepositorCalled",
      (event) =>
        event.argumentOne === argumentOne &&
        event.argumentTwo.toNumber() === argumentTwo
    );
  });

  it("depositor is enforced in the metadata", async () => {
    const anotherDepositor = accounts[2];
    const argumentOne = anotherDepositor;
    const argumentTwo = 100;
    const encodedMetaData = Helpers.abiEncode(
      ["address", "uint256"],
      [argumentOne, argumentTwo]
    );

    await TruffleAssert.reverts(
      BridgeInstance.deposit(
        destinationDomainID,
        initialResourceIDs[5],
        Helpers.createPermissionedGenericDepositData(encodedMetaData),
        feeData,
        {from: depositorAddress}
      ),
      "incorrect depositor in the data"
    );
  });

  it("returnedData can be called successfully and deposit event is emitted with expect values", async () => {
    const argument = "soylentGreenIsPeople";
    const encodedMetaData = Helpers.abiEncode(["string"], [argument]);

    const depositTx = await BridgeInstance.deposit(
      destinationDomainID,
      initialResourceIDs[6],
      Helpers.createPermissionedGenericDepositData(encodedMetaData),
      feeData,
      {from: depositorAddress}
    );

    const expectedMetaData = Ethers.utils.formatBytes32String(argument);

    TruffleAssert.eventEmitted(depositTx, "Deposit", (event) => {
      return (
        event.destinationDomainID.toNumber() === destinationDomainID &&
        event.resourceID === initialResourceIDs[6].toLowerCase() &&
        event.depositNonce.toNumber() === expectedDepositNonce &&
        event.user === depositorAddress &&
        event.data ===
          Helpers.createPermissionedGenericDepositData(encodedMetaData) &&
        event.handlerResponse === expectedMetaData
      );
    });
  });

  it("Bridge should return correct data from deposit tx", async () => {
    const argument = "soylentGreenIsPeople";
    const encodedMetaData = Helpers.abiEncode(["string"], [argument]);

    const callResult = await BridgeInstance.deposit.call(
      destinationDomainID,
      initialResourceIDs[6],
      Helpers.createPermissionedGenericDepositData(encodedMetaData),
      feeData,
      {from: depositorAddress}
    );

    const expectedMetaData = Ethers.utils.formatBytes32String(argument);
    assert.equal(callResult.depositNonce.toNumber(), 1);
    assert.equal(callResult.handlerResponse, expectedMetaData);
  });
});
