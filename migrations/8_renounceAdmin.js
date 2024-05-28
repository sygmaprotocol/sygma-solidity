// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const Utils = require("./utils");

const AccessControlSegregatorContract = artifacts.require(
  "AccessControlSegregator"
);
const FeeRouterContract = artifacts.require("FeeHandlerRouter");
const BasicFeeHandlerContract = artifacts.require("BasicFeeHandler");
const PercentageFeeHandlerContract = artifacts.require("PercentageERC20FeeHandler");

module.exports = async function (deployer, network) {
  const networksConfig = Utils.getNetworksConfig();
  const currentNetworkConfig = networksConfig[network.split("-")[0]];

  if (!currentNetworkConfig.access) return;

  // fetch deployed contracts addresses
  const accessControlInstance =
    await AccessControlSegregatorContract.deployed();
  const feeRouterInstance = await FeeRouterContract.deployed();
  const basicFeeHandlerInstance = await BasicFeeHandlerContract.deployed();
  const percentageFeeHandlerInstance = await PercentageFeeHandlerContract.deployed();

  if (currentNetworkConfig.access.feeHandlerAdmin) {
    console.log(
      "Renouncing handler admin to %s",
      currentNetworkConfig.access.feeHandlerAdmin
    );

    await basicFeeHandlerInstance.renounceAdmin(
      currentNetworkConfig.access.feeHandlerAdmin
    );
    await percentageFeeHandlerInstance.renounceAdmin(
      currentNetworkConfig.access.feeHandlerAdmin
    );
  }

  if (currentNetworkConfig.access.feeRouterAdmin) {
    console.log(
      "Renouncing router admin to %s",
      currentNetworkConfig.access.feeRouterAdmin
    );

    await feeRouterInstance.grantRole(
      "0x00",
      currentNetworkConfig.access.feeRouterAdmin
    );
    await feeRouterInstance.renounceRole(
      "0x00",
      await Utils.getDeployerAddress(deployer)
    );
  }

  for (const [func, admin] of Object.entries(
    currentNetworkConfig.access.accessControl
  )) {
    console.log("Granting access for function %s to %s", func, admin);

    await accessControlInstance.grantAccess(func, admin);
  }
};
