// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");

const Helpers = require("../helpers");

const TestStoreContract = artifacts.require("TestStore");
const PermissionedGenericHandlerContract = artifacts.require(
  "PermissionedGenericHandler"
);

contract("Bridge - [deposit - Generic]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const expectedDepositNonce = 1;
  const feeData = "0x";
  const adminAddress = accounts[0];
  const depositorAddress = accounts[1];

  let BridgeInstance;
  let PermissionedGenericHandlerInstance;
  let depositData;
  let initialContractAddresses;
  let initialDepositFunctionSignatures;
  let initialDepositFunctionDepositorOffsets;
  let initialExecuteFunctionSignatures;
  let permissionedGenericHandlerSetResourceData;

  beforeEach(async () => {
    await Promise.all([
      TestStoreContract.new().then(
        (instance) => (TestStoreInstance = instance)
      ),
      (BridgeInstance = await Helpers.deployBridge(
        originDomainID,
        adminAddress
      )),
    ]);

    resourceID = Helpers.createResourceID(
      TestStoreInstance.address,
      originDomainID
    );
    initialResourceIDs = [resourceID];
    initialContractAddresses = [TestStoreInstance.address];
    initialDepositFunctionSignatures = [Helpers.blankFunctionSig];
    initialDepositFunctionDepositorOffsets = [
      Helpers.blankFunctionDepositorOffset,
    ];
    initialExecuteFunctionSignatures = [
      Helpers.getFunctionSignature(TestStoreInstance, "store"),
    ];

    PermissionedGenericHandlerInstance =
      await PermissionedGenericHandlerContract.new(BridgeInstance.address);

    permissionedGenericHandlerSetResourceData =
      Helpers.constructGenericHandlerSetResourceData(
        initialDepositFunctionSignatures[0],
        initialDepositFunctionDepositorOffsets[0],
        initialExecuteFunctionSignatures[0]
      );

    await BridgeInstance.adminSetResource(
      PermissionedGenericHandlerInstance.address,
      resourceID,
      initialContractAddresses[0],
      permissionedGenericHandlerSetResourceData
    );

    depositData = Helpers.createPermissionedGenericDepositData("0xdeadbeef");

    // set MPC address to unpause the Bridge
    await BridgeInstance.endKeygen(Helpers.mpcAddress);
  });

  it("Generic deposit can be made", async () => {
    await TruffleAssert.passes(
      BridgeInstance.deposit(
        destinationDomainID,
        resourceID,
        depositData,
        feeData
      )
    );
  });

  it("_depositCounts is incremented correctly after deposit", async () => {
    await BridgeInstance.deposit(
      destinationDomainID,
      resourceID,
      depositData,
      feeData
    );

    const depositCount = await BridgeInstance._depositCounts.call(
      destinationDomainID
    );
    assert.strictEqual(depositCount.toNumber(), expectedDepositNonce);
  });

  it("Deposit event is fired with expected value after Generic deposit", async () => {
    const depositTx = await BridgeInstance.deposit(
      destinationDomainID,
      resourceID,
      depositData,
      feeData
    );

    TruffleAssert.eventEmitted(depositTx, "Deposit", (event) => {
      return (
        event.destinationDomainID.toNumber() === destinationDomainID &&
        event.resourceID === resourceID.toLowerCase() &&
        event.depositNonce.toNumber() === expectedDepositNonce
      );
    });
  });

  it("Deposit destination domain can not be current bridge domain ", async () => {
    await Helpers.expectToRevertWithCustomError(
      BridgeInstance.deposit(originDomainID, "0x0", depositData, feeData, {
        from: depositorAddress,
      }),
      "DepositToCurrentDomain()"
    );
  });
});
