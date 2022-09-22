/**
 * Copyright 2020 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */

const Ethers = require("ethers");
const fs = require("fs");

const Helpers = require('../test/helpers');

const networksConfig = JSON.parse(fs.readFileSync("./networks_config.json"));

const AccessControlSegregatorContract = artifacts.require("AccessControlSegregator");
const PausableContract = artifacts.require("Pausable");
const BridgeContract = artifacts.require("Bridge");
const CentrifugeAssetContract = artifacts.require("CentrifugeAsset");
const ERC20MinterPauserContract = artifacts.require("ERC20PresetMinterPauser");
const ERC20LockReleaseContract = artifacts.require("ERC20PresetMinterPauser");
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
    // fetch deployer address
    const deployerAddress = await deployer['networks'][deployer['network']]['from'];
    // assign addresses for access segregation
    const functionAccessAddresses = Array(14).fill(deployerAddress);

    // trim suffix from network name and fetch current network config
    let currentNetworkName = network.split("-")[0]
    let currentNetworkConfig = networksConfig[network.split("-")[0]]
    // deploy utils contracts
    const accessControlSegregatorInstance = await deployer.deploy(AccessControlSegregatorContract, Helpers.accessControlFuncSignatures, functionAccessAddresses);
    await deployer.deploy(PausableContract);

    // deploy main contracts
    const bridgeInstance = await deployer.deploy(BridgeContract, currentNetworkConfig.domainID, accessControlSegregatorInstance.address);
    const centrifugeAssetInstance = await deployer.deploy(CentrifugeAssetContract);
    const erc20MinterPauserInstance = await deployer.deploy(ERC20MinterPauserContract, currentNetworkConfig.erc20Name, currentNetworkConfig.erc20Symbol);
    await deployer.deploy(ERC20SafeContract);
    const erc20LockReleaseInstance = await deployer.deploy(ERC20LockReleaseContract, currentNetworkConfig.erc20LRName, currentNetworkConfig.erc20LRSymbol);
    const erc721MinterBurnerPauserInstance = await deployer.deploy(ERC721MinterBurnerPauserContract, currentNetworkConfig.erc721Name, currentNetworkConfig.erc721Symbol, currentNetworkConfig.erc721URI);
    await deployer.deploy(ERC721SafeContract);

    // deploy handler contracts
    const erc20HandlerInstance = await deployer.deploy(ERC20HandlerContract, bridgeInstance.address);
    const erc721HandlerInstance = await deployer.deploy(ERC721HandlerContract, bridgeInstance.address);
    const genericHandlerInstance = await deployer.deploy(GenericHandlerContract, bridgeInstance.address);

    // deploy fee handlers
    const feeRouterInstance = await deployer.deploy(FeeRouterContract, bridgeInstance.address);
    const basicFeeHandlerInstance = await deployer.deploy(BasicFeeHandlerContract, bridgeInstance.address, feeRouterInstance.address);
    const feeHandlerWithOracleInstance = await deployer.deploy(FeeHandlerWithOracleContract, bridgeInstance.address, feeRouterInstance.address);

    // fetch deployed network domainID
    const domainID = (await (await BridgeContract.deployed())._domainID()).toString();

    console.log("🎉🎉🎉 Sygma contracts successfully deployed 🎉🎉🎉","\n");
    console.log("===================================================");
    console.table({
        "Deployer Address": deployerAddress,
        "Domain ID": domainID,
        "Bridge Address": bridgeInstance.address,
        "centrifugeAssetAddress": centrifugeAssetInstance.address,
        "ERC20 Address": erc20MinterPauserInstance.address,
        "ERC20LockRelease Address": erc20LockReleaseInstance.address,
        "ERC721 Address": erc721MinterBurnerPauserInstance.address,
        "ERC20Handler Address": erc20HandlerInstance.address,
        "ERC20LockReleaseHandler Address": erc20HandlerInstance.address,
        "ERC721Handler Address": erc721HandlerInstance.address,
        "GenericHandler Address": genericHandlerInstance.address,
        "FeeRouterContract Address": feeRouterInstance.address,
        "BasicFeeHandler Address": basicFeeHandlerInstance.address,
        "FeeHandlerWithOracle Address": feeHandlerWithOracleInstance.address,
        "ERC20 resourceID": currentNetworkConfig.erc20ResourceID,
        "Generic resourceID": currentNetworkConfig.genericResourceID,
        "ERC721 resourceID": currentNetworkConfig.erc721ResourceID,
        "ERCLockRelease20 resourceID": currentNetworkConfig.erc20LockReleaseResourceID
    });

    /* setup contracts */
    const tokenAmount = process.env.TOKEN_AMOUNT;
    const feeOracleAddress = process.env.FEE_ORACLE_ADDRESS;
    const feeHandlerWithOracleGasUsed = process.env.FHWO_GAS_USED;
    const feeHandlerWithOracleFeePercentage = process.env.FHWO_FEE_PERCENTAGE; // e.g. 500 means 5%
    const basicFeeHandlerFee = Ethers.utils.parseEther(process.env.BFH_FEE);

    // setup ERC20
    await bridgeInstance.adminSetResource(erc20HandlerInstance.address, currentNetworkConfig.erc20ResourceID, erc20MinterPauserInstance.address);
    await bridgeInstance.adminSetResource(erc20HandlerInstance.address, currentNetworkConfig.erc20LockReleaseResourceID, erc20LockReleaseInstance.address);
    await erc20MinterPauserInstance.grantRole(await erc20MinterPauserInstance.MINTER_ROLE(), erc20HandlerInstance.address);
    await erc20MinterPauserInstance.mint(deployerAddress, tokenAmount);
    await erc20MinterPauserInstance.mint(erc20HandlerInstance.address, tokenAmount);
    await erc20MinterPauserInstance.approve(erc20HandlerInstance.address, tokenAmount);
    await bridgeInstance.adminSetBurnable(erc20HandlerInstance.address, erc20MinterPauserInstance.address);

    // setup ERC721
    await bridgeInstance.adminSetResource(erc721HandlerInstance.address, currentNetworkConfig.erc721ResourceID, erc721MinterBurnerPauserInstance.address);
    await erc721MinterBurnerPauserInstance.grantRole(await erc20MinterPauserInstance.MINTER_ROLE(), erc721HandlerInstance.address);
    await bridgeInstance.adminSetBurnable(erc721HandlerInstance.address, erc721MinterBurnerPauserInstance.address);

    // setup generic
    await bridgeInstance.adminSetGenericResource(genericHandlerInstance.address, currentNetworkConfig.genericResourceID, centrifugeAssetInstance.address, Helpers.blankFunctionSig, Helpers.blankFunctionDepositorOffset, Helpers.getFunctionSignature(centrifugeAssetInstance, 'store'));

    // setup fee router and fee handlers
    await bridgeInstance.adminChangeFeeHandler(feeRouterInstance.address);
    await feeHandlerWithOracleInstance.setFeeOracle(feeOracleAddress);
    await feeHandlerWithOracleInstance.setFeeProperties(feeHandlerWithOracleGasUsed, feeHandlerWithOracleFeePercentage);
    await basicFeeHandlerInstance.changeFee(basicFeeHandlerFee.toString());

    // set MPC address
    await bridgeInstance.endKeygen(currentNetworkConfig.MPCAddress);

    // set resourceID for every network except current from networks config
    delete networksConfig[currentNetworkName]
    for await (const network of Object.values(networksConfig)) {
      await feeRouterInstance.adminSetResourceHandler(network.domainID, network.erc20ResourceID, feeHandlerWithOracleInstance.address)
      await feeRouterInstance.adminSetResourceHandler(network.domainID, network.erc20LockReleaseResourceID, basicFeeHandlerInstance.address)
      await feeRouterInstance.adminSetResourceHandler(network.domainID, network.erc721ResourceID, basicFeeHandlerInstance.address)
      await feeRouterInstance.adminSetResourceHandler(network.domainID, network.genericResourceID, basicFeeHandlerInstance.address)
    }
    console.log("🎉🎉🎉 Sygma bridge successfully configured 🎉🎉🎉","\n");
}
