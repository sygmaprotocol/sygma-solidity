// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: BUSL-1.1

const parseArgs = require("minimist");

const Utils = require("./utils");

const BridgeContract = artifacts.require("Bridge");
const ERC20HandlerContract = artifacts.require("ERC20Handler");
const XC20HandlerContract = artifacts.require("XC20Handler");


module.exports = async function (deployer, network) {
  // check if "redeploy-token-handlers" is provided -> redeploys
  // token handlers and registers them on bridge contract
  const redeployTokenHandlers = parseArgs(process.argv.slice(2))["redeploy-token-handlers"];
  if (redeployTokenHandlers) {
    const networksConfig = Utils.getNetworksConfig();
    // trim suffix from network name and fetch current network config
    const currentNetworkName = network.split("-")[0];
    const currentNetworkConfig = networksConfig[currentNetworkName];

    let xc20HandlerInstance;

    // fetch deployed contracts addresses
    const bridgeInstance = await BridgeContract.deployed();
    const erc20HandlerInstance = await ERC20HandlerContract.deployed();
    try {
      xc20HandlerInstance = await XC20HandlerContract.deployed();
    } catch(e){
      console.error(e)
    }

    // deploy and migrate erc20 handler to new handler
    for (const erc20 of currentNetworkConfig.erc20) {
      await Utils.migrateToNewTokenHandler(
        deployer,
        erc20,
        bridgeInstance,
        erc20HandlerInstance,
      );
    }

    // deploy and migrate erc20 handler to new handler if
    // xc20 handler is deployed on current network
    if (xc20HandlerInstance) {
      for (const xc20 of currentNetworkConfig.xc20) {
        await Utils.migrateToNewTokenHandler(
          deployer,
          xc20,
          bridgeInstance,
          xc20HandlerInstance,
        );
      }
    }
  }
}
