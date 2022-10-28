/**
 * Copyright 2020 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */

const fs = require("fs");

const networksConfig = JSON.parse(fs.readFileSync("./networks_config.json"));

const BridgeContract = artifacts.require("Bridge");
const XC20SafeContract = artifacts.require("XC20Safe");
const XC20HandlerContract = artifacts.require("XC20Handler");
const FeeRouterContract = artifacts.require("FeeHandlerRouter");
const FeeHandlerWithOracleContract = artifacts.require("FeeHandlerWithOracle");
const ERC20MinterPauserContract = artifacts.require("ERC20PresetMinterPauser");


module.exports = async function (deployer, network) {
    // trim suffix from network name and fetch current network config
    let currentNetworkName = network.split("-")[0];
    let currentNetworkConfig = networksConfig[network.split("-")[0]];

    // fetch deployed contracts addresses
    const bridgeInstance = await BridgeContract.deployed();
    const feeRouterInstance = await FeeRouterContract.deployed();
    const feeHandlerWithOracleInstance = await FeeHandlerWithOracleContract.deployed();
    const erc20MinterPauserInstance = await ERC20MinterPauserContract.deployed();

    // deploy XC20Safe contract
    await deployer.deploy(XC20SafeContract);
    await deployer.deploy(XC20HandlerContract, bridgeInstance.address);
    const xc20HandlerInstance = await XC20HandlerContract.deployed();

    console.log("XC20SafeHandler contract address:", "\t", xc20HandlerInstance.address);

    // setup XC20Handler
    await bridgeInstance.adminChangeFeeHandler(feeRouterInstance.address);

    // set resourceID for every network except current from networks config
    delete networksConfig[currentNetworkName]
    for await (const network of Object.values(networksConfig)) {
      await feeRouterInstance.adminSetResourceHandler(network.domainID, network.xc20ResourceID, feeHandlerWithOracleInstance.address);
    }
    console.log("XC20Handler successfully configured")
}
