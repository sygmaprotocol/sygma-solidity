// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const parseArgs = require("minimist");

const Utils = require("./utils");

const BridgeContract = artifacts.require("Bridge");
const DefaultMessageReceiverContract = artifacts.require("DefaultMessageReceiver");
const ERC20HandlerContract = artifacts.require("ERC20Handler");
const XC20HandlerContract = artifacts.require("XC20Handler");

const TOKEN_TYPE = {
  ERC20: "erc20",
  XC20: "xc20"
}

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
    const defaultMessageReceiverInstance = await DefaultMessageReceiverContract.deployed();
    const erc20HandlerInstance = await ERC20HandlerContract.deployed();
    try {
      xc20HandlerInstance = await XC20HandlerContract.deployed();
    } catch(e){
      console.error(e)
    }

    // redeploy and register ERC20 handler
    await Utils.redeployHandler(
      deployer,
      currentNetworkConfig,
      bridgeInstance,
      ERC20HandlerContract,
      erc20HandlerInstance,
      TOKEN_TYPE.ERC20,
      defaultMessageReceiverInstance
    );

    // redeploy XC20 handler and register (if deployed to current network)
    if(currentNetworkConfig.xc20 && xc20HandlerInstance){
      await Utils.redeployHandler(
        deployer,
        currentNetworkConfig,
        bridgeInstance,
        XC20HandlerContract,
        xc20HandlerInstance,
        TOKEN_TYPE.XC20
      );
    }
  }
}
