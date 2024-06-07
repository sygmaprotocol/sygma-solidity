/* eslint-disable max-len */
// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const parseArgs = require("minimist");
const fs = require("fs");
const Ethers = require("ethers");

const Helpers = require("../test/helpers");

const TestStoreContract = artifacts.require("TestStore");
const ERC20PresetMinterPauser = artifacts.require("ERC20PresetMinterPauserDecimals");
const ERC721MinterBurnerPauserContract = artifacts.require(
  "ERC721MinterBurnerPauser"
);
const ERC1155MinterBurnerPauserContract = artifacts.require(
  "ERC1155PresetMinterPauser"
);

const DEFAULT_CONFIG_PATH = "./migrations/local.json";
const emptySetResourceData = "0x";
const erc20TokenAmount = Ethers.utils.parseUnits("1000", 18);

function getNetworksConfig() {
  let path = parseArgs(process.argv.slice(2))["file"];
  if (path == undefined) {
    path = DEFAULT_CONFIG_PATH;
  }

  return JSON.parse(fs.readFileSync(path));
}

async function setupErc20(
  deployer,
  erc20,
  bridgeInstance,
  erc20HandlerInstance
) {
  let erc20Instance;
  if (!erc20.address) {
    erc20Instance = await deployer.deploy(
      ERC20PresetMinterPauser,
      erc20.name,
      erc20.symbol,
      erc20.decimals
    );
    erc20.address = erc20Instance.address;
  } else {
    erc20Instance = await ERC20PresetMinterPauser.at(erc20.address);
    erc20Instance.contract.setProvider(deployer.provider);
  }

  await bridgeInstance.adminSetResource(
    erc20HandlerInstance.address,
    erc20.resourceID,
    erc20Instance.address,
    Ethers.utils.hexlify(Number(erc20.decimals))
  );

  // strategy can be either mb (mint/burn) or lr (lock/release)
  if (erc20.strategy == "mb") {
    await erc20Instance.grantRole(
      await erc20Instance.MINTER_ROLE(),
      erc20HandlerInstance.address
    );
    await bridgeInstance.adminSetBurnable(
      erc20HandlerInstance.address,
      erc20Instance.address
    );
  }

  await erc20Instance.mint(
    await getDeployerAddress(deployer),
    erc20TokenAmount
  );
  await erc20Instance.mint(
    erc20HandlerInstance.address,
    erc20TokenAmount
  );
}

async function setupErc721(
  deployer,
  erc721,
  bridgeInstance,
  erc721HandlerInstance
) {
  let erc721Instance;
  if (!erc721.address) {
    erc721Instance = await deployer.deploy(
      ERC721MinterBurnerPauserContract,
      erc721.name,
      erc721.symbol,
      erc721.uri
    );
    erc721.address = erc721Instance.address;
  } else {
    erc721Instance = await ERC721MinterBurnerPauserContract.at(erc721.address);
    erc721Instance.contract.setProvider(deployer.provider);
  }

  await bridgeInstance.adminSetResource(
    erc721HandlerInstance.address,
    erc721.resourceID,
    erc721.address,
    emptySetResourceData
  );

  await erc721Instance.grantRole(
    await erc721Instance.MINTER_ROLE(),
    erc721HandlerInstance.address
  );
  await bridgeInstance.adminSetBurnable(
    erc721HandlerInstance.address,
    erc721Instance.address
  );
}

async function setupErc1155(
  deployer,
  erc1155,
  bridgeInstance,
  erc1155HandlerInstance
) {
  let erc1155Instance;
  if (!erc1155.address) {
    erc1155Instance = await deployer.deploy(
      ERC1155MinterBurnerPauserContract,
      erc1155.uri
    );
    erc1155.address = erc1155Instance.address;
  } else {
    erc1155Instance = await ERC1155MinterBurnerPauserContract.at(erc1155.address);
    erc1155Instance.contract.setProvider(deployer.provider);
  }

  await bridgeInstance.adminSetResource(
    erc1155HandlerInstance.address,
    erc1155.resourceID,
    erc1155.address,
    emptySetResourceData
  );

  await erc1155Instance.grantRole(
    await erc1155Instance.MINTER_ROLE(),
    erc1155HandlerInstance.address
  );
  await bridgeInstance.adminSetBurnable(
    erc1155HandlerInstance.address,
    erc1155Instance.address
  );
}

async function setupGeneric(
  deployer,
  generic,
  bridgeInstance,
  genericHandlerInstance
) {
  let genericHandlerSetResourceData = "";
  if (!generic.address) {
    const testStoreInstance = await deployer.deploy(TestStoreContract);
    generic.address = testStoreInstance.address;
    generic.depositFunctionSig = Helpers.blankFunctionSig;
    generic.depositorOffset = Helpers.blankFunctionDepositorOffset;
    generic.executeFunctionSig = Helpers.getFunctionSignature(
      testStoreInstance,
      "store"
    );
  }

  genericHandlerSetResourceData =
    Helpers.constructGenericHandlerSetResourceData(
      generic.depositFunctionSig,
      generic.depositorOffset,
      generic.executeFunctionSig
    );

  await bridgeInstance.adminSetResource(
    genericHandlerInstance.address,
    generic.resourceID,
    generic.address,
    genericHandlerSetResourceData
  );
}

async function redeployHandler(
    deployer,
    currentNetworkConfig,
    bridgeInstance,
    handlerContract,
    handlerInstance,
    tokenType
  ) {
  let deployNewHandler = true;
  let newHandlerInstance;

  for (const erc20 of currentNetworkConfig[tokenType]) {
    if (deployNewHandler) {
      newHandlerInstance = await deployer.deploy(
        handlerContract,
        bridgeInstance.address
      );
      console.log("New handler address:", "\t", newHandlerInstance.address);
      deployNewHandler = false;
    }

    await migrateToNewTokenHandler(
      deployer,
      erc20,
      bridgeInstance,
      handlerInstance,
      newHandlerInstance
    );
  }
}

async function migrateToNewTokenHandler(
  deployer,
  tokenConfig,
  bridgeInstance,
  handlerInstance,
  newHandlerInstance
) {
  const tokenContractAddress = await handlerInstance._resourceIDToTokenContractAddress(
    tokenConfig.resourceID
  );

  await bridgeInstance.adminSetResource(
    newHandlerInstance.address,
    tokenConfig.resourceID,
    tokenContractAddress,
    // set decimal places if !=18 in 'local.json'
    tokenConfig.decimals != "18" ? tokenConfig.decimals : emptySetResourceData
  );

    if(tokenConfig.strategy === "mb"){
      const erc20Instance = await ERC20PresetMinterPauser.at(tokenContractAddress);

    await erc20Instance.grantRole(
      await erc20Instance.MINTER_ROLE(),
      newHandlerInstance.address
    );

    await bridgeInstance.adminSetBurnable(
      newHandlerInstance.address,
      tokenContractAddress
    );
  }

  console.log("Associated resourceID:", "\t", tokenConfig.resourceID);
  console.log(
    "-------------------------------------------------------------------------------"
  );
}

async function getDeployerAddress(deployer) {
  return await deployer["networks"][deployer["network"]][
    "from"
  ];
}

module.exports = {
  setupErc20,
  setupErc721,
  setupErc1155,
  setupGeneric,
  getNetworksConfig,
  migrateToNewTokenHandler,
  redeployHandler,
  getDeployerAddress,
}
