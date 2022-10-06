/**
 * Copyright 2020 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */

const fs = require("fs");

const Helpers = require('../test/helpers');

const networksConfig = JSON.parse(fs.readFileSync("./networks_config.json"));

const BridgeContract = artifacts.require("Bridge");
const TestStoreContract = artifacts.require("TestStore");
const GenericHandlerV1Contract = artifacts.require("GenericHandlerV1");
const FeeRouterContract = artifacts.require("FeeHandlerRouter");
const BasicFeeHandlerContract = artifacts.require("BasicFeeHandler");

module.exports = async function(deployer, network) {
    // trim suffix from network name and fetch current network config
    let currentNetworkName = network.split("-")[0];
    let currentNetworkConfig = networksConfig[network.split("-")[0]];

    // fetch deployed contracts addresses
    const bridgeInstance = await BridgeContract.deployed();
    const feeRouterInstance = await FeeRouterContract.deployed();
    const basicFeeHandlerInstance = await BasicFeeHandlerContract.deployed();

    // deploy generic handler
    const genericHandlerV1Instance = await deployer.deploy(GenericHandlerV1Contract, bridgeInstance.address);

    console.log("Generic handler v1 address:", "\t", genericHandlerV1Instance.address);
    console.log("Generic handler v1 resourceID:", "\t", currentNetworkConfig.genericV1ResourceID);

    // setup generic handler v1
    await bridgeInstance.adminSetGenericResource(genericHandlerV1Instance.address, currentNetworkConfig.genericV1ResourceID, bridgeInstance.address, Helpers.blankFunctionSig, Helpers.blankFunctionDepositorOffset, Helpers.blankFunctionSig);

    // set resourceID for every network except current from networks config
    delete networksConfig[currentNetworkName]
    for await (const network of Object.values(networksConfig)) {
      await feeRouterInstance.adminSetResourceHandler(network.domainID, network.genericV1ResourceID, basicFeeHandlerInstance.address)
    }
    console.log("Generic handler v1 successfully configured");
}
