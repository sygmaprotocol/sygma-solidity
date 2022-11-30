/**
 * Copyright 2020 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */

const Helpers = require('../test/helpers');
const Utils = require('./utils');

const BridgeContract = artifacts.require("Bridge");
const GenericHandlerV1Contract = artifacts.require("GenericHandlerV1");
const FeeRouterContract = artifacts.require("FeeHandlerRouter");
const BasicFeeHandlerContract = artifacts.require("BasicFeeHandler");
const FeeHandlerWithOracleContract = artifacts.require("FeeHandlerWithOracle");

module.exports = async function(deployer, network) {
    const networksConfig = Utils.getNetworksConfig()
    // trim suffix from network name and fetch current network config
    let currentNetworkName = network.split("-")[0];
    let currentNetworkConfig = networksConfig[currentNetworkName];
    delete networksConfig[currentNetworkName]

    // fetch deployed contracts addresses
    const bridgeInstance = await BridgeContract.deployed();
    const feeRouterInstance = await FeeRouterContract.deployed();
    const basicFeeHandlerInstance = await BasicFeeHandlerContract.deployed();
    const feeHandlerWithOracleInstance = await FeeHandlerWithOracleContract.deployed();

    // deploy generic handler
    const genericHandlerV1Instance = await deployer.deploy(GenericHandlerV1Contract, bridgeInstance.address);

    console.log("-------------------------------------------------------------------------------")
    console.log("Generic handler v1 address:", "\t", genericHandlerV1Instance.address);
    console.log("Generic handler v1 resourceID:", "\t", currentNetworkConfig.permissionlessGeneric.resourceID);
    console.log("-------------------------------------------------------------------------------")

    // setup generic handler v1
    if (currentNetworkConfig.permissionlessGeneric && currentNetworkConfig.permissionlessGeneric.resourceID) {
      await bridgeInstance.adminSetGenericResource(genericHandlerV1Instance.address, currentNetworkConfig.permissionlessGeneric.resourceID, bridgeInstance.address, Helpers.blankFunctionSig, Helpers.blankFunctionDepositorOffset, Helpers.blankFunctionSig);
      await Utils.setupFee(networksConfig, feeRouterInstance, feeHandlerWithOracleInstance, basicFeeHandlerInstance, currentNetworkConfig.permissionlessGeneric);
    }
}
