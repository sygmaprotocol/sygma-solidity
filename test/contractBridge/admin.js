/**
 * Copyright 2020 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */
const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");

const Helpers = require("../helpers");

const ERC20MintableContract = artifacts.require("ERC20PresetMinterPauser");
const ERC20HandlerContract = artifacts.require("ERC20Handler");
const PermissionedGenericHandlerContract = artifacts.require(
  "PermissionedGenericHandler"
);
const ERC1155HandlerContract = artifacts.require("ERC1155Handler");
const ERC1155MintableContract = artifacts.require("ERC1155PresetMinterPauser");
const ERC721MintableContract = artifacts.require("ERC721MinterBurnerPauser");
const TestStoreContract = artifacts.require("TestStore");

// This test does NOT include all getter methods, just
// getters that should work with only the constructor called
contract("Bridge - [admin]", async (accounts) => {
  const domainID = 1;
  const nonAdminAddress = accounts[1];

  const expectedBridgeAdmin = accounts[0];
  const someAddress = "0xcafecafecafecafecafecafecafecafecafecafe";
  const nullAddress = "0x0000000000000000000000000000000000000000";
  const topologyHash = "549f715f5b06809ada23145c2dc548db";
  const txHash =
    "0x59d881e01ca682130e550e3576b6de760951fb45b1d5dd81342132f57920bbfa";

  const bytes32 = "0x0";
  const emptySetResourceData = "0x";

  let BridgeInstance;
  let ERC1155HandlerInstance;
  let ERC1155MintableInstance;
  let ERC721MintableInstance;
  let TestStoreInstance;
  let genericHandlerSetResourceData;

  let withdrawData = "";

  const assertOnlyAdmin = (method) => {
    return Helpers.expectToRevertWithCustomError(
      method(),
      "AccessNotAllowed(address,bytes4)"
    );
  };

  beforeEach(async () => {
    await Promise.all([
      (BridgeInstance = await Helpers.deployBridge(
        domainID,
        expectedBridgeAdmin
      )),
      TestStoreContract.new().then(
        (instance) => (TestStoreInstance = instance)
      ),
      ERC721MintableContract.new("token", "TOK", "").then(
        (instance) => (ERC721MintableInstance = instance)
      ),
      ERC1155MintableContract.new("TOK").then(
        (instance) => (ERC1155MintableInstance = instance),
      ),
    ]);

    ERC1155HandlerInstance = await ERC1155HandlerContract.new(
      BridgeInstance.address
    );

    genericHandlerSetResourceData =
      Helpers.constructGenericHandlerSetResourceData(
        Helpers.blankFunctionSig,
        Helpers.blankFunctionDepositorOffset,
        Helpers.blankFunctionSig
      );
  });

  // Testing pauseable methods

  it("Bridge should not be paused after MPC address is set", async () => {
    await BridgeInstance.endKeygen(Helpers.mpcAddress);
    assert.isFalse(await BridgeInstance.paused());
  });

  it("Bridge should be paused after being paused by admin", async () => {
    // set MPC address to unpause the Bridge
    await BridgeInstance.endKeygen(Helpers.mpcAddress);

    await TruffleAssert.passes(BridgeInstance.adminPauseTransfers());
    assert.isTrue(await BridgeInstance.paused());
  });

  it("Bridge should be unpaused after being paused by admin", async () => {
    // set MPC address to unpause the Bridge
    await BridgeInstance.endKeygen(Helpers.mpcAddress);

    await TruffleAssert.passes(BridgeInstance.adminPauseTransfers());
    assert.isTrue(await BridgeInstance.paused());
    await TruffleAssert.passes(BridgeInstance.adminUnpauseTransfers());
    assert.isFalse(await BridgeInstance.paused());
  });

  // Testing starKeygen, endKeygen and refreshKey methods

  it("Should successfully emit \"StartKeygen\" event if called by admin", async () => {
    const startKeygenTx = await BridgeInstance.startKeygen();

    TruffleAssert.eventEmitted(startKeygenTx, "StartKeygen");
  });

  it("Should fail if \"StartKeygen\" is called by non admin", async () => {
    await assertOnlyAdmin(() =>
      BridgeInstance.startKeygen({from: nonAdminAddress})
    );
  });

  it("Should fail if \"StartKeygen\" is called after MPC address is set", async () => {
    await BridgeInstance.endKeygen(Helpers.mpcAddress);

    await Helpers.expectToRevertWithCustomError(
      BridgeInstance.startKeygen(),
      "MPCAddressAlreadySet()"
    );
  });

  it("Should successfully set MPC address and emit \"EndKeygen\" event if called by admin", async () => {
    const startKeygenTx = await BridgeInstance.endKeygen(Helpers.mpcAddress);

    assert.equal(await BridgeInstance._MPCAddress(), Helpers.mpcAddress);

    TruffleAssert.eventEmitted(startKeygenTx, "EndKeygen");
  });

  it("Should fail if \"endKeygen\" is called by non admin", async () => {
    await assertOnlyAdmin(() =>
      BridgeInstance.endKeygen(
        someAddress,
        {from: nonAdminAddress}
      )
    )
  });

  it("Should fail if null address is passed as MPC address", async () => {
    await Helpers.expectToRevertWithCustomError(
      BridgeInstance.endKeygen(nullAddress),
      "MPCAddressZeroAddress()"
    );
  });

  it("Should fail if admin tries to update MPC address", async () => {
    await BridgeInstance.endKeygen(Helpers.mpcAddress);

    await Helpers.expectToRevertWithCustomError(
      BridgeInstance.endKeygen(someAddress),
      "MPCAddressIsNotUpdatable()"
    );
  });

  it("Should successfully emit \"KeyRefresh\" event with expected hash value if called by admin", async () => {
    const startKeygenTx = await BridgeInstance.refreshKey(topologyHash);

    TruffleAssert.eventEmitted(startKeygenTx, "KeyRefresh", (event) => {
      return (event.hash = topologyHash);
    });
  });

  it("Should fail if \"refreshKey\" is called by non admin", async () => {
    await assertOnlyAdmin(() =>
      BridgeInstance.refreshKey(
        topologyHash,
        {from: nonAdminAddress}
      )
    )
  });

  // Set Handler Address

  it("Should set a Resource ID for handler address", async () => {
    const ERC20MintableInstance = await ERC20MintableContract.new(
      "token",
      "TOK"
    );
    const resourceID = Helpers.createResourceID(
      ERC20MintableInstance.address,
      domainID
    );
    const ERC20HandlerInstance = await ERC20HandlerContract.new(
      BridgeInstance.address
    );

    assert.equal(
      await BridgeInstance._resourceIDToHandlerAddress.call(resourceID),
      Ethers.constants.AddressZero
    );

    await TruffleAssert.passes(
      BridgeInstance.adminSetResource(
        ERC20HandlerInstance.address,
        resourceID,
        ERC20MintableInstance.address,
        genericHandlerSetResourceData
      )
    );
    assert.equal(
      await BridgeInstance._resourceIDToHandlerAddress.call(resourceID),
      ERC20HandlerInstance.address
    );
  });

  // Set resource ID

  it("Should set a ERC20 Resource ID and contract address", async () => {
    const ERC20MintableInstance = await ERC20MintableContract.new(
      "token",
      "TOK"
    );
    const resourceID = Helpers.createResourceID(
      ERC20MintableInstance.address,
      domainID
    );
    const ERC20HandlerInstance = await ERC20HandlerContract.new(
      BridgeInstance.address
    );

    await TruffleAssert.passes(
      BridgeInstance.adminSetResource(
        ERC20HandlerInstance.address,
        resourceID,
        ERC20MintableInstance.address,
        genericHandlerSetResourceData
      )
    );
    assert.equal(
      await ERC20HandlerInstance._resourceIDToTokenContractAddress.call(
        resourceID
      ),
      ERC20MintableInstance.address
    );

    const retrievedResourceID = (await ERC20HandlerInstance._tokenContractAddressToTokenProperties.call(
      ERC20MintableInstance.address
    )).resourceID

    assert.equal(
      retrievedResourceID.toLowerCase(),
      resourceID.toLowerCase()
    );
  });

  it("Should require admin role to set a ERC20 Resource ID and contract address", async () => {
    await assertOnlyAdmin(() =>
      BridgeInstance.adminSetResource(
        someAddress,
        bytes32,
        someAddress,
        genericHandlerSetResourceData,
        {from: nonAdminAddress}
      )
    );
  });

  it("should revert when setting resourceID if token doesn't support IERC1155", async () => {
    const invalidResourceID = Helpers.createResourceID(
      ERC1155MintableInstance.address,
      domainID
    );

    await TruffleAssert.reverts(
      BridgeInstance.adminSetResource(
        ERC1155HandlerInstance.address,
        invalidResourceID,
        ERC721MintableInstance.address,
        emptySetResourceData
      ),
      "token does not support IERC1155"
    );
  });

  it("should successfully set resourceID if token supports IERC1155", async () => {
    const resourceID = Helpers.createResourceID(
      ERC1155MintableInstance.address,
      domainID
    );

    await TruffleAssert.passes(
      BridgeInstance.adminSetResource(
        ERC1155HandlerInstance.address,
        resourceID,
        ERC1155MintableInstance.address,
        emptySetResourceData
      )
    )
  });

  // Set Generic Resource

  it("Should set a Generic Resource ID and contract address", async () => {
    const resourceID = Helpers.createResourceID(
      TestStoreInstance.address,
      domainID
    );
    const PermissionedGenericHandlerInstance =
      await PermissionedGenericHandlerContract.new(BridgeInstance.address);

    await TruffleAssert.passes(
      BridgeInstance.adminSetResource(
        PermissionedGenericHandlerInstance.address,
        resourceID,
        TestStoreInstance.address,
        genericHandlerSetResourceData
      )
    );
    assert.equal(
      await PermissionedGenericHandlerInstance._resourceIDToContractAddress.call(
        resourceID
      ),
      TestStoreInstance.address
    );
    const retrievedResourceID = (await PermissionedGenericHandlerInstance._tokenContractAddressToTokenProperties.call(
      TestStoreInstance.address
    )).resourceID;

    assert.equal(retrievedResourceID, resourceID.toLowerCase());
  });

  it("Should require admin role to set a Generic Resource ID and contract address", async () => {
    await assertOnlyAdmin(() =>
        BridgeInstance.adminSetResource(
        someAddress,
        bytes32,
        someAddress,
        genericHandlerSetResourceData,
        {from: nonAdminAddress}
      )
    );
  });

  // Set burnable

  it("Should set ERC20MintableInstance.address as burnable", async () => {
    const ERC20MintableInstance = await ERC20MintableContract.new(
      "token",
      "TOK"
    );
    const resourceID = Helpers.createResourceID(
      ERC20MintableInstance.address,
      domainID
    );
    const ERC20HandlerInstance = await ERC20HandlerContract.new(
      BridgeInstance.address
    );

    await TruffleAssert.passes(
      BridgeInstance.adminSetResource(
        ERC20HandlerInstance.address,
        resourceID,
        ERC20MintableInstance.address,
        genericHandlerSetResourceData
      )
    );
    await TruffleAssert.passes(
      BridgeInstance.adminSetBurnable(
        ERC20HandlerInstance.address,
        ERC20MintableInstance.address
      )
    );
    const isBurnable = (await ERC20HandlerInstance._tokenContractAddressToTokenProperties.call(
      ERC20MintableInstance.address
    )).isBurnable;

    assert.isTrue(isBurnable, "Contract wasn't successfully marked burnable");
  });

  it("Should require admin role to set ERC20MintableInstance.address as burnable", async () => {
    await assertOnlyAdmin(() =>
      BridgeInstance.adminSetBurnable(
        someAddress,
        someAddress,
        {from: nonAdminAddress}
      )
    );
  });

  // Withdraw

  it("Should withdraw funds", async () => {
    const numTokens = 10;
    const tokenOwner = accounts[0];

    let ownerBalance;

    const ERC20MintableInstance = await ERC20MintableContract.new(
      "token",
      "TOK"
    );
    const resourceID = Helpers.createResourceID(
      ERC20MintableInstance.address,
      domainID
    );
    const ERC20HandlerInstance = await ERC20HandlerContract.new(
      BridgeInstance.address
    );

    await TruffleAssert.passes(
      BridgeInstance.adminSetResource(
        ERC20HandlerInstance.address,
        resourceID,
        ERC20MintableInstance.address,
        genericHandlerSetResourceData
      )
    );

    await ERC20MintableInstance.mint(tokenOwner, numTokens);
    ownerBalance = await ERC20MintableInstance.balanceOf(tokenOwner);
    assert.equal(ownerBalance, numTokens);

    await ERC20MintableInstance.transfer(
      ERC20HandlerInstance.address,
      numTokens
    );

    ownerBalance = await ERC20MintableInstance.balanceOf(tokenOwner);
    assert.equal(ownerBalance, 0);
    const handlerBalance = await ERC20MintableInstance.balanceOf(
      ERC20HandlerInstance.address
    );
    assert.equal(handlerBalance, numTokens);

    withdrawData = Helpers.createERCWithdrawData(
      ERC20MintableInstance.address,
      tokenOwner,
      numTokens
    );

    await BridgeInstance.adminWithdraw(
      ERC20HandlerInstance.address,
      withdrawData
    );
    ownerBalance = await ERC20MintableInstance.balanceOf(tokenOwner);
    assert.equal(ownerBalance, numTokens);
  });

  it("Should require admin role to withdraw funds", async () => {
    await assertOnlyAdmin(() =>
      BridgeInstance.adminWithdraw(
        someAddress,
        "0x0",
        {from: nonAdminAddress}
      )
    )
  });

  // Set nonce

  it("Should set nonce", async () => {
    const nonce = 3;
    await BridgeInstance.adminSetDepositNonce(domainID, nonce);
    const nonceAfterSet = await BridgeInstance._depositCounts.call(domainID);
    assert.equal(nonceAfterSet, nonce);
  });

  it("Should require admin role to set nonce", async () => {
    await assertOnlyAdmin(() =>
      BridgeInstance.adminSetDepositNonce(
        1,
        3,
        {from: nonAdminAddress}
      )
    )
  });

  it("Should not allow for decrements of the nonce", async () => {
    const currentNonce = 3;
    await BridgeInstance.adminSetDepositNonce(domainID, currentNonce);
    const newNonce = 2;
    await TruffleAssert.reverts(
      BridgeInstance.adminSetDepositNonce(domainID, newNonce),
      "Does not allow decrements of the nonce"
    );
  });

  // Change access control contract

  it("Should require admin role to change access control contract", async () => {
    await assertOnlyAdmin(() =>
      BridgeInstance.adminChangeAccessControl(
        someAddress,
        {from: nonAdminAddress}
      )
    )
  });

  // Retry

  it("Should require admin role to retry deposit", async () => {
    await assertOnlyAdmin(() =>
      BridgeInstance.retry(
        txHash,
        {from: nonAdminAddress}
      )
    )
  });

  it("Should successfully emit Retry event", async () => {
    const eventTx = await BridgeInstance.retry(txHash);

    TruffleAssert.eventEmitted(eventTx, "Retry", (event) => {
      return event.txHash === txHash;
    });
  });
});
