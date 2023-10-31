// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");

const Helpers = require("../../../helpers");

const PercentageFeeHandlerContract = artifacts.require("PercentageERC20FeeHandlerEVM");
const FeeHandlerRouterContract = artifacts.require("FeeHandlerRouter");
const ERC20MintableContract = artifacts.require("ERC20PresetMinterPauser");


contract("PercentageFeeHandler - [admin]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const initialRelayers = accounts.slice(0, 3);
  const currentFeeHandlerAdmin = accounts[0];

  const assertOnlyAdmin = (method, ...params) => {
    return TruffleAssert.reverts(
      method(...params, {from: initialRelayers[1]}),
      "sender doesn't have admin role"
    );
  };

  let BridgeInstance;
  let PercentageFeeHandlerInstance;
  let ERC20MintableInstance;
  let ADMIN_ROLE;
  let resourceID;

  beforeEach(async () => {
    await Promise.all([
      (BridgeInstance = await Helpers.deployBridge(
        originDomainID,
        accounts[0]
      )),
      ERC20MintableContract.new("token", "TOK").then(
        (instance) => (ERC20MintableInstance = instance)
      ),
    ]);

    FeeHandlerRouterInstance = await FeeHandlerRouterContract.new(
      BridgeInstance.address
    );
    PercentageFeeHandlerInstance = await PercentageFeeHandlerContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );

    ADMIN_ROLE = await PercentageFeeHandlerInstance.DEFAULT_ADMIN_ROLE();

    resourceID = Helpers.createResourceID(ERC20MintableInstance.address, originDomainID);
  });

  it("should set fee property", async () => {
    const fee = 60000;
    assert.equal(await PercentageFeeHandlerInstance._domainResourceIDToFee(destinationDomainID, resourceID), "0");
    await PercentageFeeHandlerInstance.changeFee(destinationDomainID, resourceID, fee);
    assert.equal(await PercentageFeeHandlerInstance._domainResourceIDToFee(destinationDomainID, resourceID), fee);
  });

  it("should require admin role to change fee property", async () => {
    const fee = 600;
    await assertOnlyAdmin(PercentageFeeHandlerInstance.changeFee, destinationDomainID, resourceID, fee);
  });

  it("should set fee bounds", async () => {
    const newLowerBound = "100";
    const newUpperBound = "300";
    assert.equal((await PercentageFeeHandlerInstance._resourceIDToFeeBounds.call(resourceID)).lowerBound, "0");
    assert.equal((await PercentageFeeHandlerInstance._resourceIDToFeeBounds.call(resourceID)).upperBound, "0");
    await PercentageFeeHandlerInstance.changeFeeBounds(resourceID, newLowerBound, newUpperBound);
    assert.equal(
      (await PercentageFeeHandlerInstance._resourceIDToFeeBounds.call(resourceID)).lowerBound.toString(),
      newLowerBound
    );
    assert.equal(
      (await PercentageFeeHandlerInstance._resourceIDToFeeBounds.call(resourceID)).upperBound.toString(),
      newUpperBound
    );
  });

  it("should require admin role to change fee bounds", async () => {
    const lowerBound = 100;
    const upperBound = 300;
    await assertOnlyAdmin(PercentageFeeHandlerInstance.changeFeeBounds, resourceID, lowerBound, upperBound);
  });

  it("PercentageFeeHandler admin should be changed to expectedPercentageFeeHandlerAdmin", async () => {
    const expectedPercentageFeeHandlerAdmin = accounts[1];

    // check current admin
    assert.isTrue(
      await PercentageFeeHandlerInstance.hasRole(ADMIN_ROLE, currentFeeHandlerAdmin)
    );

    await TruffleAssert.passes(
      PercentageFeeHandlerInstance.renounceAdmin(expectedPercentageFeeHandlerAdmin)
    );
    assert.isTrue(
      await PercentageFeeHandlerInstance.hasRole(
        ADMIN_ROLE,
        expectedPercentageFeeHandlerAdmin
      )
    );

    // check that former admin is no longer admin
    assert.isFalse(
      await PercentageFeeHandlerInstance.hasRole(ADMIN_ROLE, currentFeeHandlerAdmin)
    );
  });
});
