/**
 * Copyright 2020 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */

const fs = require("fs");

const networksConfig = JSON.parse(fs.readFileSync("./networks_config.json"));

const BridgeContract = artifacts.require("Bridge");
const XC20SafeContract = artifacts.require("XC20Safe");
const XC20HandlerContract = artifacts.require("XC20Handler");
const XC20TestContract = artifacts.require("XC20Test");
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

    // deploy XC20 contracts
    await deployer.deploy(XC20SafeContract);
    const xc20TestInstance = await deployer.deploy(XC20TestContract, erc20MinterPauserInstance.address);
    await deployer.deploy(XC20HandlerContract, bridgeInstance.address);
    const xc20HandlerInstance = await XC20HandlerContract.deployed();

    console.log("XC20Handler contract address:", "\t", xc20HandlerInstance.address);
    console.log("XC20Test contract address:", "\t", xc20TestInstance.address);

    // setup XC20Handler
    await bridgeInstance.adminSetResource(xc20HandlerInstance.address, currentNetworkConfig.xc20ResourceID, xc20TestInstance.address);
    await bridgeInstance.adminChangeFeeHandler(feeRouterInstance.address);
    await erc20MinterPauserInstance.grantRole(await erc20MinterPauserInstance.MINTER_ROLE(), xc20HandlerInstance.address);
    await bridgeInstance.adminSetBurnable(xc20HandlerInstance.address, xc20TestInstance.address);


    // set resourceID for every network except current from networks config
    delete networksConfig[currentNetworkName]
    for await (const network of Object.values(networksConfig)) {
      await feeRouterInstance.adminSetResourceHandler(network.domainID, network.xc20ResourceID, feeHandlerWithOracleInstance.address);
    }
    console.log("XC20Handler successfully configured")
}
