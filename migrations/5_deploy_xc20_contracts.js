/**
 * Copyright 2020 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */

const BridgeContract = artifacts.require("Bridge");
const XC20SafeContract = artifacts.require("XC20Safe");
const XC20HandlerContract = artifacts.require("XC20Handler");


module.exports = async function (deployer, network) {
    // trim suffix from network name and fetch current network config
    let currentNetworkName = network.split("-")[0];

    if(currentNetworkName === "astar"){

        // fetch deployed contracts addresses
        const bridgeInstance = await BridgeContract.deployed();

        // deploy XC20 contracts
        await deployer.deploy(XC20SafeContract);
        await deployer.deploy(XC20HandlerContract, bridgeInstance.address);
        const xc20HandlerInstance = await XC20HandlerContract.deployed();

        console.log("XC20Handler contract address:", "\t", xc20HandlerInstance.address);
    }
}
