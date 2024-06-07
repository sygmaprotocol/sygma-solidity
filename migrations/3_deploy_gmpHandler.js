// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const Helpers = require("../test/helpers");
const Utils = require("./utils");

const BridgeContract = artifacts.require("Bridge");
const GmpHandlerContract = artifacts.require(
  "GmpHandler"
);

module.exports = async function (deployer, network) {
  const networksConfig = Utils.getNetworksConfig();
  // trim suffix from network name and fetch current network config
  const currentNetworkName = network.split("-")[0];
  const currentNetworkConfig = networksConfig[currentNetworkName];
  delete networksConfig[currentNetworkName];
  if (
    currentNetworkConfig.gmp &&
    currentNetworkConfig.gmp.resourceID
  ) {
  // fetch deployed contracts addresses
  const bridgeInstance = await BridgeContract.deployed();

  // deploy generic handler
  const GmpHandlerInstance = await deployer.deploy(
    GmpHandlerContract,
    bridgeInstance.address
  );

  console.log(
    "-------------------------------------------------------------------------------"
  );
  console.log(
    "Gmp handler address:",
    "\t",
    GmpHandlerInstance.address
  );
  console.log(
    "Gmp handler resourceID:",
    "\t",
    currentNetworkConfig.gmp.resourceID
  );
  console.log(
    "-------------------------------------------------------------------------------"
  );

  // setup Gmp  handler
    const genericHandlerSetResourceData =
      Helpers.constructGenericHandlerSetResourceData(
        Helpers.blankFunctionSig,
        Helpers.blankFunctionDepositorOffset,
        Helpers.blankFunctionSig
      );
    await bridgeInstance.adminSetResource(
      GmpHandlerInstance.address,
      currentNetworkConfig.gmp.resourceID,
      bridgeInstance.address,
      genericHandlerSetResourceData
    );
  }
};
