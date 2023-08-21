// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");

const Helpers = require("../../../helpers");

const PercentageFeeHandlerContract = artifacts.require("PercentageFeeHandler");
const FeeHandlerRouterContract = artifacts.require("FeeHandlerRouter");

contract("PercentageFeeHandler - [admin]", async (accounts) => {
  const domainID = 1;
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
  let ADMIN_ROLE;

  beforeEach(async () => {
    BridgeInstance = awaitBridgeInstance = await Helpers.deployBridge(
      domainID,
      accounts[0]
    );
    FeeHandlerRouterInstance = await FeeHandlerRouterContract.new(
      BridgeInstance.address
    );
    PercentageFeeHandlerInstance = await PercentageFeeHandlerContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );

    ADMIN_ROLE = await PercentageFeeHandlerInstance.DEFAULT_ADMIN_ROLE();
  });

  it("should set fee property", async () => {
    const fee = 60000;
    assert.equal(await PercentageFeeHandlerInstance._fee.call(), "0");
    await PercentageFeeHandlerInstance.changeFee(fee);
    assert.equal(await PercentageFeeHandlerInstance._fee.call(), fee);
  });

  it("should require admin role to change fee property", async () => {
    const fee = 600;
    await assertOnlyAdmin(PercentageFeeHandlerInstance.changeFee, fee);
  });

  it("should set fee bounds", async () => {
    const lowerBound = 100;
    const upperBound = 300;
    assert.equal(await PercentageFeeHandlerInstance._lowerBound.call(), "0");
    assert.equal(await PercentageFeeHandlerInstance._upperBound.call(), "0");
    await PercentageFeeHandlerInstance.changeFeeBounds(lowerBound, upperBound);
    assert.equal(await PercentageFeeHandlerInstance._lowerBound.call(), lowerBound);
    assert.equal(await PercentageFeeHandlerInstance._upperBound.call(), upperBound);
  });

  it("should require admin role to change fee bounds", async () => {
    const lowerBound = 100;
    const upperBound = 300;
    await assertOnlyAdmin(PercentageFeeHandlerInstance.changeFeeBounds, lowerBound, upperBound);
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
