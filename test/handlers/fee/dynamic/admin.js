/**
 * Copyright 2022 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */

const TruffleAssert = require("truffle-assertions");

const Helpers = require("../../../helpers");

const DynamicFeeHandlerContract = artifacts.require("DynamicERC20FeeHandlerEVM");
const FeeHandlerRouterContract = artifacts.require("FeeHandlerRouter");

contract("DynamicFeeHandler - [admin]", async (accounts) => {
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
  let DynamicFeeHandlerInstance;
  let FeeHandlerRouterInstance;
  let ADMIN_ROLE;

  beforeEach(async () => {
    BridgeInstance = await Helpers.deployBridge(domainID, accounts[0]);
    FeeHandlerRouterInstance = await FeeHandlerRouterContract.new(
      BridgeInstance.address
    );
    DynamicFeeHandlerInstance = await DynamicFeeHandlerContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );
    ADMIN_ROLE = await DynamicFeeHandlerInstance.DEFAULT_ADMIN_ROLE();
  });

  it("should set fee oracle", async () => {
    const oracleAddress = accounts[1];
    assert.equal(
      await DynamicFeeHandlerInstance._oracleAddress.call(),
      "0x0000000000000000000000000000000000000000"
    );
    await DynamicFeeHandlerInstance.setFeeOracle(oracleAddress);
    const newOracle = await DynamicFeeHandlerInstance._oracleAddress.call();
    assert.equal(newOracle, oracleAddress);
  });

  it("should require admin role to change fee oracle", async () => {
    const oracleAddress = accounts[1];
    await assertOnlyAdmin(
      DynamicFeeHandlerInstance.setFeeOracle,
      oracleAddress
    );
  });

  it("should set fee properties", async () => {
    const gasUsed = 100000;
    const feePercent = 5;
    assert.equal(await DynamicFeeHandlerInstance._gasUsed.call(), "0");
    assert.equal(await DynamicFeeHandlerInstance._feePercent.call(), "0");
    await DynamicFeeHandlerInstance.setFeeProperties(gasUsed, feePercent);
    assert.equal(await DynamicFeeHandlerInstance._gasUsed.call(), gasUsed);
    assert.equal(
      await DynamicFeeHandlerInstance._feePercent.call(),
      feePercent
    );
  });

  it("should require admin role to change fee properties", async () => {
    const gasUsed = 100000;
    const feePercent = 5;
    await assertOnlyAdmin(
      DynamicFeeHandlerInstance.setFeeProperties,
      gasUsed,
      feePercent
    );
  });

  it("DynamicFeeHandler admin should be changed to expectedDynamicFeeHandlerAdmin", async () => {
    const expectedDynamicFeeHandlerAdmin = accounts[1];

    // check current admin
    assert.isTrue(
      await DynamicFeeHandlerInstance.hasRole(
        ADMIN_ROLE,
        currentFeeHandlerAdmin
      )
    );

    await TruffleAssert.passes(
      DynamicFeeHandlerInstance.renounceAdmin(
        expectedDynamicFeeHandlerAdmin
      )
    );
    assert.isTrue(
      await DynamicFeeHandlerInstance.hasRole(
        ADMIN_ROLE,
        expectedDynamicFeeHandlerAdmin
      )
    );

    // check that former admin is no longer admin
    assert.isFalse(
      await DynamicFeeHandlerInstance.hasRole(
        ADMIN_ROLE,
        currentFeeHandlerAdmin
      )
    );
  });
});
