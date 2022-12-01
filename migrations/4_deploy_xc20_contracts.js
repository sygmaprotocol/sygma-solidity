/**
 * Copyright 2020 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */

const BridgeContract = artifacts.require("Bridge");
const XC20HandlerContract = artifacts.require("XC20Handler");
const FeeRouterContract = artifacts.require("FeeHandlerRouter");
const BasicFeeHandlerContract = artifacts.require("BasicFeeHandler");
const FeeHandlerWithOracleContract = artifacts.require("FeeHandlerWithOracle");


module.exports = async function (deployer, network) {
    // trim suffix from network name and fetch current network config
    let currentNetworkName = network.split("-")[0];
    if(currentNetworkName !== "astar" || "shiden" || "shibuya") {
        return
    }

    // fetch deployed contracts addresses
    const bridgeInstance = await BridgeContract.deployed();
    const feeRouterInstance = await FeeRouterContract.deployed();
    const basicFeeHandlerInstance = await BasicFeeHandlerContract.deployed();
    const feeHandlerWithOracleInstance = await FeeHandlerWithOracleContract.deployed();

    // deploy XC20 contracts
    await deployer.deploy(XC20HandlerContract, bridgeInstance.address);
    const xc20HandlerInstance = await XC20HandlerContract.deployed();

    // setup xc20 tokens
    for (const xc20 of currentNetworkConfig.xc20) {
      await Utils.setupErc20(deployer, xc20, bridgeInstance, xc20HandlerInstance);
      await Utils.setupFee(networksConfig, feeRouterInstance, feeHandlerWithOracleInstance, basicFeeHandlerInstance, xc20);

      console.log("-------------------------------------------------------------------------------")
      console.log("XC20 address:", "\t", xc20.address);
      console.log("ResourceID:", "\t", xc20.resourceID);
      console.log("-------------------------------------------------------------------------------")
    }

    console.log("XC20Handler contract address:", "\t", xc20HandlerInstance.address);
}
