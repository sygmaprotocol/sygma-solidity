/**
 * Copyright 2020 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */

const Ethers = require("ethers");

const Helpers = require("../test/helpers");
const Utils = require("./utils");

const AccessControlSegregatorContract = artifacts.require(
  "AccessControlSegregator"
);
const PausableContract = artifacts.require("Pausable");
const BridgeContract = artifacts.require("Bridge");
const ERC20HandlerContract = artifacts.require("ERC20Handler");
const ERC721HandlerContract = artifacts.require("ERC721Handler");
const PermissionedGenericHandlerContract = artifacts.require(
  "PermissionedGenericHandler"
);
const FeeRouterContract = artifacts.require("FeeHandlerRouter");
const BasicFeeHandlerContract = artifacts.require("BasicFeeHandler");
const FeeHandlerWithOracleContract = artifacts.require("FeeHandlerWithOracle");

module.exports = async function (deployer, network) {
  const networksConfig = Utils.getNetworksConfig();
  // fetch deployer address
  const deployerAddress = await deployer["networks"][deployer["network"]][
    "from"
  ];
  // assign addresses for access segregation
  const functionAccessAddresses = Array(14).fill(deployerAddress);

  // trim suffix from network name and fetch current network config
  const currentNetworkName = network.split("-")[0];
  const currentNetworkConfig = networksConfig[currentNetworkName];
  delete networksConfig[currentNetworkName];

  // deploy utils contracts
  const accessControlSegregatorInstance = await deployer.deploy(
    AccessControlSegregatorContract,
    Helpers.accessControlFuncSignatures,
    functionAccessAddresses
  );
  await deployer.deploy(PausableContract);

  // deploy main contracts
  const bridgeInstance = await deployer.deploy(
    BridgeContract,
    currentNetworkConfig.domainID,
    accessControlSegregatorInstance.address
  );

  // deploy handler contracts
  const erc20HandlerInstance = await deployer.deploy(
    ERC20HandlerContract,
    bridgeInstance.address
  );
  const erc721HandlerInstance = await deployer.deploy(
    ERC721HandlerContract,
    bridgeInstance.address
  );
  const permissionedGenericHandlerInstance = await deployer.deploy(
    PermissionedGenericHandlerContract,
    bridgeInstance.address
  );

  // deploy fee handlers
  const feeRouterInstance = await deployer.deploy(
    FeeRouterContract,
    bridgeInstance.address
  );
  const basicFeeHandlerInstance = await deployer.deploy(
    BasicFeeHandlerContract,
    bridgeInstance.address,
    feeRouterInstance.address
  );
  const feeHandlerWithOracleInstance = await deployer.deploy(
    FeeHandlerWithOracleContract,
    bridgeInstance.address,
    feeRouterInstance.address
  );

  // setup fee router and fee handlers
  await bridgeInstance.adminChangeFeeHandler(feeRouterInstance.address);
  await feeHandlerWithOracleInstance.setFeeOracle(
    currentNetworkConfig.fee.oracle.address
  );
  await feeHandlerWithOracleInstance.setFeeProperties(
    currentNetworkConfig.fee.oracle.gasUsed,
    currentNetworkConfig.fee.oracle.feePercentage
  );
  await basicFeeHandlerInstance.changeFee(
    Ethers.utils.parseEther(currentNetworkConfig.fee.basic.fee).toString()
  );

  console.table({
    "Deployer Address": deployerAddress,
    "Domain ID": currentNetworkConfig.domainID,
    "Bridge Address": bridgeInstance.address,
    "ERC20Handler Address": erc20HandlerInstance.address,
    "ERC721Handler Address": erc721HandlerInstance.address,
    "PermissionedGenericHandler Address":
      permissionedGenericHandlerInstance.address,
    "FeeRouterContract Address": feeRouterInstance.address,
    "BasicFeeHandler Address": basicFeeHandlerInstance.address,
    "FeeHandlerWithOracle Address": feeHandlerWithOracleInstance.address,
  });

  // setup erc20 tokens
  for (const erc20 of currentNetworkConfig.erc20) {
    await Utils.setupErc20(
      deployer,
      erc20,
      bridgeInstance,
      erc20HandlerInstance
    );
    await Utils.setupFee(
      networksConfig,
      feeRouterInstance,
      feeHandlerWithOracleInstance,
      basicFeeHandlerInstance,
      erc20
    );
    await Utils.setupDecimals(
      networksConfig,
      bridgeInstance,
      erc20HandlerInstance,
      erc20
    );

    console.log(
      "-------------------------------------------------------------------------------"
    );
    console.log("ERC20 address:", "\t", erc20.address);
    console.log("ResourceID:", "\t", erc20.resourceID);
    console.log(
      "-------------------------------------------------------------------------------"
    );
  }

  // setup erc721 tokens
  for (const erc721 of currentNetworkConfig.erc721) {
    await Utils.setupErc721(
      deployer,
      erc721,
      bridgeInstance,
      erc721HandlerInstance
    );
    await Utils.setupFee(
      networksConfig,
      feeRouterInstance,
      feeHandlerWithOracleInstance,
      basicFeeHandlerInstance,
      erc721
    );

    console.log(
      "-------------------------------------------------------------------------------"
    );
    console.log("ERC721 address:", "\t", erc721.address);
    console.log("ResourceID:", "\t", erc721.resourceID);
    console.log(
      "-------------------------------------------------------------------------------"
    );
  }

  for (const generic of currentNetworkConfig.permissionedGeneric) {
    await Utils.setupGeneric(
      deployer,
      generic,
      bridgeInstance,
      permissionedGenericHandlerInstance
    );
    await Utils.setupFee(
      networksConfig,
      feeRouterInstance,
      feeHandlerWithOracleInstance,
      basicFeeHandlerInstance,
      generic
    );

    console.log(
      "-------------------------------------------------------------------------------"
    );
    console.log("Generic contract address:", "\t", generic.address);
    console.log("ResourceID:", "\t", generic.resourceID);
    console.log(
      "-------------------------------------------------------------------------------"
    );
  }

  // set MPC address
  if (currentNetworkConfig.MPCAddress)
    await bridgeInstance.endKeygen(currentNetworkConfig.MPCAddress);

  console.log("🎉🎉🎉 Sygma bridge successfully configured 🎉🎉🎉", "\n");
};
