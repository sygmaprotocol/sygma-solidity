/**
 * Copyright 2020 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */

const Helpers = require('../test/helpers');
const Utils = require('./utils');

const AccessControlSegregatorContract = artifacts.require("AccessControlSegregator");
const FeeRouterContract = artifacts.require("FeeHandlerRouter");
const BasicFeeHandlerContract = artifacts.require("BasicFeeHandler");
const FeeHandlerWithOracleContract = artifacts.require("FeeHandlerWithOracle");

module.exports = async function(deployer, network) {
    const networksConfig = Utils.getNetworksConfig()
    let currentNetworkConfig = networksConfig[network.split("-")[0]];

    if (!currentNetworkConfig.access) return;

    // fetch deployed contracts addresses
    const accessControlInstance = await AccessControlSegregatorContract.deployed();
    const feeRouterInstance = await FeeRouterContract.deployed();
    const basicFeeHandlerInstance = await BasicFeeHandlerContract.deployed();
    const feeHandlerWithOracleInstance = await FeeHandlerWithOracleContract.deployed();

    if (currentNetworkConfig.access.feeHandlerAdmin) {
      console.log("Renouncing handler admin to %s", currentNetworkConfig.access.feeHandlerAdmin);

      await basicFeeHandlerInstance.renounceAdmin(currentNetworkConfig.access.feeHandlerAdmin);
      await feeHandlerWithOracleInstance.renounceAdmin(currentNetworkConfig.access.feeHandlerAdmin);
    }

    if (currentNetworkConfig.access.feeRouterAdmin) {
      console.log("Renouncing router admin to %s", currentNetworkConfig.access.feeRouterAdmin);

      await feeRouterInstance.grantRole("0x00", currentNetworkConfig.access.feeRouterAdmin);
      await feeRouterInstance.renounceRole("0x00", await deployer['networks'][deployer['network']]['from']);
    }

    for (let i = 0; i < currentNetworkConfig.access.accessControl.functions.length; i++) {
      const func = currentNetworkConfig.access.accessControl.functions[i]
      const admin = currentNetworkConfig.access.accessControl.admins[i]

      console.log("Granting access for function %s to %s", func, admin)

      await accessControlInstance.grantAccess(func, admin);
    }
}
