/**
 * Copyright 2020 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */

 const Ethers = require("ethers");

 const networksConfig = require("./networks_config");
 const Helpers = require('../test/helpers');

 const AccessControlSegregatorContract = artifacts.require("AccessControlSegregator");
 const PausableContract = artifacts.require("Pausable");
 const BridgeContract = artifacts.require("Bridge");
 const CentrifugeAssetContract = artifacts.require("CentrifugeAsset");
 const ERC20MinterPauserContract = artifacts.require("ERC20PresetMinterPauser");
 const ERC20SafeContract = artifacts.require("ERC20Safe");
 const ERC721MinterBurnerPauserContract = artifacts.require("ERC721MinterBurnerPauser");
 const ERC721SafeContract = artifacts.require("ERC721Safe");
 const ERC1155SafeContract = artifacts.require("ERC1155Safe");
 const ForwarderContract = artifacts.require("Forwarder");
 const ERC20HandlerContract = artifacts.require("ERC20Handler");
 const ERC721HandlerContract = artifacts.require("ERC721Handler");
 const ERC1155HandlerContract = artifacts.require("ERC1155Handler");
 const GenericHandlerContract = artifacts.require("GenericHandler");
 const FeeRouterContract = artifacts.require("FeeHandlerRouter");
 const BasicFeeHandlerContract = artifacts.require("BasicFeeHandler");
 const FeeHandlerWithOracleContract = artifacts.require("FeeHandlerWithOracle");


 module.exports = async function(deployer, network) {
     if (network === "mumbai") {
         // fetch deployer address
         const deployerAddress = await deployer['networks'][deployer['network']]['from'];
         // assign addresses for access segregation
         const functionAccessAddresses = Array(14).fill(deployerAddress);

         // deploy utils contracts
         const accessControlSegregatorInstance = await deployer.deploy(AccessControlSegregatorContract, Helpers.accessControlFuncSignatures, functionAccessAddresses);
         await deployer.deploy(PausableContract);

         // deploy main contracts
         const bridgeInstance = await deployer.deploy(BridgeContract, networksConfig.mumbai.domainID, accessControlSegregatorInstance.address);
         const centrifugeAssetInstance = await deployer.deploy(CentrifugeAssetContract);
         const erc20MinterPauserInstance = await deployer.deploy(ERC20MinterPauserContract, networksConfig.mumbai.erc20Name, networksConfig.mumbai.erc20Symbol);
         const erc20SafeInstance = await deployer.deploy(ERC20SafeContract);
         const erc721MinterBurnerPauserInstance = await deployer.deploy(ERC721MinterBurnerPauserContract, networksConfig.mumbai.erc721Name, networksConfig.mumbai.erc721Symbol, networksConfig.mumbai.erc721URI);
         const erc721SafeInstance = await deployer.deploy(ERC721SafeContract);
         const erc1155SafeInstance = await deployer.deploy(ERC1155SafeContract);
         const forwarderInstance = await deployer.deploy(ForwarderContract);

         // deploy handler contracts
         const erc20HandlerInstance= await deployer.deploy(ERC20HandlerContract, bridgeInstance.address);
         const erc721HandlerInstance = await deployer.deploy(ERC721HandlerContract, bridgeInstance.address);
         const erc1155HandlerInstance = await deployer.deploy(ERC1155HandlerContract, bridgeInstance.address);
         const genericHandlerInstance = await deployer.deploy(GenericHandlerContract, bridgeInstance.address);

         // deploy fee handlers
         const feeRouterInstance = await deployer.deploy(FeeRouterContract, bridgeInstance.address);
         const basicFeeHandlerInstance = await deployer.deploy(BasicFeeHandlerContract, bridgeInstance.address, feeRouterInstance.address);
         const feeHandlerWithOracleInstance = await deployer.deploy(FeeHandlerWithOracleContract, bridgeInstance.address, feeRouterInstance.address);

         /* setup contracts */
         const tokenAmount = 10000;
         const feeOracleAddress = "0x70B7D7448982b15295150575541D1d3b862f7FE9";
         const feeHandlerWithOracleGasUsed = 100000;
         const feeHandlerWithOracleFeePercentage = 500; // 5%
         const basicFeeHandlerFee = Ethers.utils.parseEther("0.1");

         // setup ERC20
         await bridgeInstance.adminSetResource(erc20HandlerInstance.address, networksConfig.mumbai.erc20ResourceID, erc20MinterPauserInstance.address);
         await erc20MinterPauserInstance.grantRole(await erc20MinterPauserInstance.MINTER_ROLE(), erc20HandlerInstance.address);
         await erc20MinterPauserInstance.mint(deployerAddress, tokenAmount);
         await erc20MinterPauserInstance.approve(erc20HandlerInstance.address, tokenAmount);
         await bridgeInstance.adminSetBurnable(erc20HandlerInstance.address, erc20MinterPauserInstance.address);

         // setup ERC721
         await bridgeInstance.adminSetResource(erc721HandlerInstance.address, networksConfig.mumbai.erc721ResourceID, erc721MinterBurnerPauserInstance.address);
         await erc721MinterBurnerPauserInstance.grantRole(await erc20MinterPauserInstance.MINTER_ROLE(), erc721HandlerInstance.address);
         await bridgeInstance.adminSetBurnable(erc721HandlerInstance.address, erc721MinterBurnerPauserInstance.address);

         // setup generic
         await bridgeInstance.adminSetGenericResource(genericHandlerInstance.address, networksConfig.mumbai.genericResourceID, centrifugeAssetInstance.address, Helpers.blankFunctionSig, Helpers.blankFunctionDepositorOffset, Helpers.getFunctionSignature(centrifugeAssetInstance, 'store'));

         // setup fee router and fee handlers
         await bridgeInstance.adminChangeFeeHandler(feeRouterInstance.address);
         await feeHandlerWithOracleInstance.setFeeOracle(feeOracleAddress);
         await feeHandlerWithOracleInstance.setFeeProperties(feeHandlerWithOracleGasUsed, feeHandlerWithOracleFeePercentage);
         await basicFeeHandlerInstance.changeFee(basicFeeHandlerFee.toString());

        // set MPC address
        await bridgeInstance.endKeygen(networksConfig.goerli.MPCAddress);

         // fetch deployed network domainID
         const domainID = (await (await BridgeContract.deployed())._domainID()).toString();

         console.log("🎉🎉🎉 Sygma contracts successfully deployed 🎉🎉🎉","\n");
         console.log("===================================================");
         console.table({
             "Deployer Address": deployerAddress,
             "Domain ID": domainID,
             "Bridge Address": bridgeInstance.address,
             "centrifugeAssetAddress": centrifugeAssetInstance.address,
             "ERC20MinterPauser Address": erc20MinterPauserInstance.address,
             "ERC20Safe Address": erc20SafeInstance.address,
             "ERC721MinterBurnerPauser Address": erc721MinterBurnerPauserInstance.address,
             "ERC721Safe Address": erc721SafeInstance.address,
             "ERC1155Safe Address": erc1155SafeInstance.address,
             "Forwarder Address": forwarderInstance.address,
             "ERC20Handler Address": erc20HandlerInstance.address,
             "ERC721Handler Address": erc721HandlerInstance.address,
             "ERC1155Handler Address": erc1155HandlerInstance.address,
             "GenericHandler Address": genericHandlerInstance.address,
             "FeeRouterContract Address": feeRouterInstance.address,
             "BasicFeeHandler Address": basicFeeHandlerInstance.address,
             "FeeHandlerWithOracle Address": feeHandlerWithOracleInstance.address,
         });
     }
 }
