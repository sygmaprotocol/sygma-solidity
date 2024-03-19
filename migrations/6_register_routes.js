// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const Utils = require("./utils");

const BasicFeeHandlerContract = artifacts.require("BasicFeeHandler");
const PercentageFeeHandler = artifacts.require("PercentageERC20FeeHandlerEVM");
const FeeRouterContract = artifacts.require("FeeHandlerRouter");

module.exports = async function (deployer, network) {
  const networksConfig = Utils.getNetworksConfig();
  // trim suffix from network name and fetch current network config
  const currentNetworkName = network.split("-")[0];
  const currentNetworkConfig = networksConfig[currentNetworkName];

  delete networksConfig[currentNetworkName];
  // fetch deployed contracts addresses
  const basicFeeHandlerInstance = await BasicFeeHandlerContract.deployed()
  const percentageFeeHandlerInstance = await PercentageFeeHandler.deployed()
  const feeRouterInstance = await FeeRouterContract.deployed()

  for(const fee of currentNetworkConfig.fee) {
    console.log(`registering resource ${fee.resourceID} for destination domain 
    ${fee.toDomain} using feeHandler: ${basicFeeHandlerInstance.address}`)
    if (fee.type == "basic") {
      await feeRouterInstance.adminSetResourceHandler(fee.toDomain, fee.resourceID, basicFeeHandlerInstance.address)
      await basicFeeHandlerInstance.changeFee(fee.toDomain, fee.resourceID, fee.feeAmount)
    } else if (fee.type == "percentage") {
      await feeRouterInstance.adminSetResourceHandler(
        fee.toDomain, fee.resourceID, percentageFeeHandlerInstance.address)
      await percentageFeeHandlerInstance.changeFee(fee.toDomain, fee.resourceID, fee.feeAmount)
    }
  }
};
