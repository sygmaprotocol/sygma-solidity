// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");

const Helpers = require("../../../helpers");

const BasicFeeHandlerContract = artifacts.require("BasicFeeHandler");
const FeeHandlerRouterContract = artifacts.require("FeeHandlerRouter");
const ERC20MintableContract = artifacts.require("ERC20PresetMinterPauser");

contract("BasicFeeHandler - [admin]", async (accounts) => {
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
  let BasicFeeHandlerInstance;
  let OriginERC20MintableInstance;
  let ADMIN_ROLE;
  let resourceID;

  beforeEach(async () => {
    BridgeInstance = awaitBridgeInstance = await Helpers.deployBridge(
      originDomainID,
      accounts[0]
    );
    FeeHandlerRouterInstance = await FeeHandlerRouterContract.new(
      BridgeInstance.address
    );
    BasicFeeHandlerInstance = await BasicFeeHandlerContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );
    OriginERC20MintableInstance = await ERC20MintableContract.new("token", "TOK")

    ADMIN_ROLE = await BasicFeeHandlerInstance.DEFAULT_ADMIN_ROLE();
    resourceID = Helpers.createResourceID(
      OriginERC20MintableInstance.address,
      originDomainID
    )
  });

  it("should return fee handler type", async () => {
    assert.equal(await BasicFeeHandlerInstance.feeHandlerType.call(), "basic");
  });

  it("should set fee property", async () => {
    const fee = 3;
    assert.equal(await BasicFeeHandlerInstance._domainResourceIDToFee(destinationDomainID, resourceID), "0");
    await BasicFeeHandlerInstance.changeFee(destinationDomainID, resourceID, fee);
    assert.equal(await BasicFeeHandlerInstance._domainResourceIDToFee(destinationDomainID, resourceID), fee);
  });

  it("should require admin role to change fee property", async () => {
    const fee = 3;
    await assertOnlyAdmin(BasicFeeHandlerInstance.changeFee, destinationDomainID, resourceID, fee);
  });

  it("BasicFeeHandler admin should be changed to expectedBasicFeeHandlerAdmin", async () => {
    const expectedBasicFeeHandlerAdmin = accounts[1];

    // check current admin
    assert.isTrue(
      await BasicFeeHandlerInstance.hasRole(ADMIN_ROLE, currentFeeHandlerAdmin)
    );

    await TruffleAssert.passes(
      BasicFeeHandlerInstance.renounceAdmin(expectedBasicFeeHandlerAdmin)
    );
    assert.isTrue(
      await BasicFeeHandlerInstance.hasRole(
        ADMIN_ROLE,
        expectedBasicFeeHandlerAdmin
      )
    );

    // check that former admin is no longer admin
    assert.isFalse(
      await BasicFeeHandlerInstance.hasRole(ADMIN_ROLE, currentFeeHandlerAdmin)
    );
  });
});
