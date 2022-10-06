/**
 * Copyright 2020 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */

const ColorsContract = artifacts.require("Colors");

module.exports = async function(deployer, network) {
    // deploy colors example contract
    await deployer.deploy(ColorsContract);
    const colorsInstance = await ColorsContract.deployed();

    console.log("Colors contract address:", "\t", colorsInstance.address);
}
