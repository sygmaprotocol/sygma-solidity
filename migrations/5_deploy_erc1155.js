// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const Utils = require("./utils");

const BridgeContract = artifacts.require("Bridge");
const ERC1155HandlerContract = artifacts.require("ERC1155Handler");

module.exports = async function (deployer, network) {
  const networksConfig = Utils.getNetworksConfig();
  // trim suffix from network name and fetch current network config
  const currentNetworkName = network.split("-")[0];
  const currentNetworkConfig = networksConfig[currentNetworkName];

  delete networksConfig[currentNetworkName];
  // fetch deployed contracts addresses
  const bridgeInstance = await BridgeContract.deployed();

  // deploy generic handler
  const erc1155HandlerInstance = await deployer.deploy(
    ERC1155HandlerContract,
    bridgeInstance.address
  );
  
  console.table({

    "ERC1155Handler Address": erc1155HandlerInstance.address,

  });

  for (const erc1155 of currentNetworkConfig.erc1155) {
    await Utils.setupErc1155(
      deployer,
      erc1155,
      bridgeInstance,
      erc1155HandlerInstance
    );

    console.log(
      "-------------------------------------------------------------------------------"
    );
    console.log("ERC1155 address:", "\t", erc1155.address);
    console.log("ResourceID:", "\t", erc1155.resourceID);
    console.log(
      "-------------------------------------------------------------------------------"
    );
  }
};
