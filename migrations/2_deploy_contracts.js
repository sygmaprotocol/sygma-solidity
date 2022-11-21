/**
 * Copyright 2020 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */

const Ethers = require("ethers");

const Helpers = require('../test/helpers');
const Utils = require('./utils');


const AccessControlSegregatorContract = artifacts.require("AccessControlSegregator");
const PausableContract = artifacts.require("Pausable");
const BridgeContract = artifacts.require("Bridge");
const TestStoreContract = artifacts.require("TestStore");
const ERC20PresetMinterPauser = artifacts.require("ERC20PresetMinterPauser");
const ERC20SafeContract = artifacts.require("ERC20Safe");
const ERC721MinterBurnerPauserContract = artifacts.require("ERC721MinterBurnerPauser");
const ERC721SafeContract = artifacts.require("ERC721Safe");
const ERC20HandlerContract = artifacts.require("ERC20Handler");
const ERC721HandlerContract = artifacts.require("ERC721Handler");
const GenericHandlerContract = artifacts.require("GenericHandler");
const FeeRouterContract = artifacts.require("FeeHandlerRouter");
const BasicFeeHandlerContract = artifacts.require("BasicFeeHandler");
const FeeHandlerWithOracleContract = artifacts.require("FeeHandlerWithOracle");

module.exports = async function(deployer, network) {
    const networksConfig = Utils.getNetworksConfig()
    // fetch deployer address
    const deployerAddress = await deployer['networks'][deployer['network']]['from'];
    // assign addresses for access segregation
    const functionAccessAddresses = Array(14).fill(deployerAddress);

    // trim suffix from network name and fetch current network config
    let currentNetworkName = network.split("-")[0]
    let currentNetworkConfig = networksConfig[network.split("-")[0]]
    delete networksConfig[currentNetworkName]

    // deploy utils contracts
    const accessControlSegregatorInstance = await deployer.deploy(AccessControlSegregatorContract, Helpers.accessControlFuncSignatures, functionAccessAddresses);
    await deployer.deploy(PausableContract);

    // deploy main contracts
    const bridgeInstance = await deployer.deploy(BridgeContract, currentNetworkConfig.domainID, accessControlSegregatorInstance.address);

    // deploy handler contracts
    const erc20HandlerInstance = await deployer.deploy(ERC20HandlerContract, bridgeInstance.address);
    const erc721HandlerInstance = await deployer.deploy(ERC721HandlerContract, bridgeInstance.address);
    const genericHandlerInstance = await deployer.deploy(GenericHandlerContract, bridgeInstance.address);

    // deploy fee handlers
    const feeRouterInstance = await deployer.deploy(FeeRouterContract, bridgeInstance.address);
    const basicFeeHandlerInstance = await deployer.deploy(BasicFeeHandlerContract, bridgeInstance.address, feeRouterInstance.address);
    const feeHandlerWithOracleInstance = await deployer.deploy(FeeHandlerWithOracleContract, bridgeInstance.address, feeRouterInstance.address);

    // deploy safe contracts
    await deployer.deploy(ERC20SafeContract);
    await deployer.deploy(ERC721SafeContract);

    // setup fee router and fee handlers
    await bridgeInstance.adminChangeFeeHandler(feeRouterInstance.address);
    await feeHandlerWithOracleInstance.setFeeOracle(currentNetworkConfig.fee.oracle.address);
    await feeHandlerWithOracleInstance.setFeeProperties(currentNetworkConfig.fee.oracle.gasUsed, currentNetworkConfig.fee.oracle.feePercentage);
    await basicFeeHandlerInstance.changeFee(Ethers.utils.parseEther(currentNetworkConfig.fee.basic.fee).toString());

    console.table({
      "Deployer Address": deployerAddress,
      "Domain ID": currentNetworkConfig.domainID,
      "Bridge Address": bridgeInstance.address,
      "ERC20Handler Address": erc20HandlerInstance.address,
      "ERC721Handler Address": erc721HandlerInstance.address,
      "GenericHandler Address": genericHandlerInstance.address,
      "FeeRouterContract Address": feeRouterInstance.address,
      "BasicFeeHandler Address": basicFeeHandlerInstance.address,
      "FeeHandlerWithOracle Address": feeHandlerWithOracleInstance.address,
  });

    // setup erc20 tokens
    for (const erc20 of currentNetworkConfig.erc20) {
      await setupErc20(deployer, erc20, bridgeInstance, erc20HandlerInstance);
      await Utils.setupFee(networksConfig, feeRouterInstance, feeHandlerWithOracleInstance, basicFeeHandlerInstance, erc20);

      console.log("-------------------------------------------------------------------------------")
      console.log("ERC20 address:", "\t", erc20.address);
      console.log("ResourceID:", "\t", erc20.resourceID);
      console.log("-------------------------------------------------------------------------------")
    }

    // setup erc721 tokens
    for (const erc721 of currentNetworkConfig.erc721) {
      await setupErc721(deployer, erc721, bridgeInstance, erc721HandlerInstance);
      await Utils.setupFee(networksConfig, feeRouterInstance, feeHandlerWithOracleInstance, basicFeeHandlerInstance, erc721);

      console.log("-------------------------------------------------------------------------------")
      console.log("ERC721 address:", "\t", erc721.address);
      console.log("ResourceID:", "\t", erc721.resourceID);
      console.log("-------------------------------------------------------------------------------")
    }

    for (const generic of currentNetworkConfig.permissionedGeneric) {
      await setupGeneric(deployer, generic, bridgeInstance, genericHandlerInstance);
      await Utils.setupFee(networksConfig, feeRouterInstance, feeHandlerWithOracleInstance, basicFeeHandlerInstance);

      console.log("-------------------------------------------------------------------------------")
      console.log("Generic contract address:", "\t", generic.address);
      console.log("ResourceID:", "\t", generic.resourceID);
      console.log("-------------------------------------------------------------------------------")
    }

    // set MPC address
    if (currentNetworkConfig.MPCAddress) await bridgeInstance.endKeygen(currentNetworkConfig.MPCAddress);

    console.log("🎉🎉🎉 Sygma bridge successfully configured 🎉🎉🎉","\n");
}

async function setupErc20(
  deployer,
  erc20,
  bridgeInstance,
  erc20HandlerInstance
) {
  var erc20Instance
  if (!erc20.address) {
    erc20Instance = await deployer.deploy(ERC20PresetMinterPauser, erc20.name, erc20.symbol);
    erc20.address = erc20Instance.address
  } else {
    erc20Instance = await ERC20PresetMinterPauser.at(erc20.address)
    erc20Instance.contract.setProvider(deployer.provider)
  }

  await bridgeInstance.adminSetResource(erc20HandlerInstance.address, erc20.resourceID, erc20Instance.address);

  if (erc20.strategy == "mb") {
    await erc20Instance.grantRole(await erc20Instance.MINTER_ROLE(), erc20HandlerInstance.address);
    await bridgeInstance.adminSetBurnable(erc20HandlerInstance.address, erc20Instance.address);
  }
}

async function setupErc721(
  deployer,
  erc721,
  bridgeInstance,
  erc721HandlerInstance
) {
  var erc721Instance
  if (!erc721.address) {
    erc721Instance = await deployer.deploy(ERC721MinterBurnerPauserContract, erc721.name, erc721.symbol, erc721.uri);
    erc721.address = erc721Instance.address
  } else {
    erc721Instance = await ERC721MinterBurnerPauserContract.at(erc721.address)
    erc721Instance.contract.setProvider(deployer.provider)
  }

  await bridgeInstance.adminSetResource(erc721HandlerInstance.address, erc721.resourceID, erc721.address);

  await erc721Instance.grantRole(await erc721Instance.MINTER_ROLE(), erc721HandlerInstance.address);
  await bridgeInstance.adminSetBurnable(erc721HandlerInstance.address, erc721Instance.address);
}

async function setupGeneric(deployer, generic, bridgeInstance, genericHandlerInstance) {
  if (!generic.address) {
    const testStoreInstance = await deployer.deploy(TestStoreContract);
    generic.address = testStoreInstance.address;
    generic.depositFunctionSig = Helpers.blankFunctionSig;
    generic.depositorOffset = Helpers.blankFunctionDepositorOffset;
    generic.executeFunctionSig = Helpers.getFunctionSignature(testStoreInstance, "store");
  }

  await bridgeInstance.adminSetGenericResource(
    genericHandlerInstance.address,
    generic.resourceID,
    generic.address,
    generic.depositFunctionSig,
    generic.depositorOffset,
    generic.executeFunctionSig
  );
}
