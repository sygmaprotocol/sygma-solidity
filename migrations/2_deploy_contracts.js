// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const Helpers = require("../test/helpers");
const Utils = require("./utils");

const AccessControlSegregatorContract = artifacts.require(
  "AccessControlSegregator"
);
const PausableContract = artifacts.require("Pausable");
const BridgeContract = artifacts.require("Bridge");
const ERC20HandlerContract = artifacts.require("ERC20Handler");
const ERC721HandlerContract = artifacts.require("ERC721Handler");

const FeeRouterContract = artifacts.require("FeeHandlerRouter");
const BasicFeeHandlerContract = artifacts.require("BasicFeeHandler");
const PercentageFeeHandler = artifacts.require("PercentageERC20FeeHandler");

module.exports = async function (deployer, network) {
  const networksConfig = Utils.getNetworksConfig();
  // fetch deployer address
  const deployerAddress = await Utils.getDeployerAddress(deployer);
  // assign addresses for access segregation
  const functionAccessAddresses = Array(13).fill(deployerAddress);

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
  const percentageFeeHandlerInstance = await deployer.deploy(
    PercentageFeeHandler,
    bridgeInstance.address,
    feeRouterInstance.address
  )

  // setup fee router
  await bridgeInstance.adminChangeFeeHandler(feeRouterInstance.address);

  console.table({
    "Deployer Address": deployerAddress,
    "Domain ID": currentNetworkConfig.domainID,
    "Bridge Address": bridgeInstance.address,
    "ERC20Handler Address": erc20HandlerInstance.address,
    "ERC721Handler Address": erc721HandlerInstance.address,
    "FeeRouterContract Address": feeRouterInstance.address,
    "BasicFeeHandler Address": basicFeeHandlerInstance.address,
    "PercentageFeeHandler Address": percentageFeeHandlerInstance.address
  });

  // setup erc20 tokens
  for (const erc20 of currentNetworkConfig.erc20) {
    await Utils.setupErc20(
      deployer,
      erc20,
      bridgeInstance,
      erc20HandlerInstance
    );

    console.log(
      "-------------------------------------------------------------------------------"
    );
    console.log("ERC20 address:", "\t", erc20.address);
    console.log("ResourceID:", "\t", erc20.resourceID);
    console.log("Decimal places:", "\t", erc20.decimals);
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

    console.log(
      "-------------------------------------------------------------------------------"
    );
    console.log("ERC721 address:", "\t", erc721.address);
    console.log("ResourceID:", "\t", erc721.resourceID);
    console.log(
      "-------------------------------------------------------------------------------"
    );
  }

  // set MPC address
  if (currentNetworkConfig.MPCAddress)
    await bridgeInstance.endKeygen(currentNetworkConfig.MPCAddress);

  console.log("🎉🎉🎉 Sygma bridge successfully configured 🎉🎉🎉", "\n");
};
