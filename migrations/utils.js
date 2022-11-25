const parseArgs = require('minimist')
const fs = require("fs");

const TestStoreContract = artifacts.require("TestStore");
const ERC20PresetMinterPauser = artifacts.require("ERC20PresetMinterPauser");
const ERC721MinterBurnerPauserContract = artifacts.require("ERC721MinterBurnerPauser");

const DEFAULT_CONFIG_PATH = "./migrations/local.json"

function getNetworksConfig() {
  let path = parseArgs(process.argv.slice(2))["file"]
  if (path == undefined) {
    path = DEFAULT_CONFIG_PATH
  }

  return JSON.parse(fs.readFileSync(path));
}


async function setupFee(
  networksConfig,
  feeRouterInstance,
  feeHandlerWithOracleInstance,
  basicFeeHandlerInstance,
  token
) {
  for await (const network of Object.values(networksConfig)) {
    if (token.feeType == "oracle") {
      await feeRouterInstance.adminSetResourceHandler(network.domainID, token.resourceID, feeHandlerWithOracleInstance.address)
    } else {
      await feeRouterInstance.adminSetResourceHandler(network.domainID, token.resourceID, basicFeeHandlerInstance.address)
    }
  }
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

  // strategy can be either mb (mint/burn) or lr (lock/release)
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


module.exports = {
  setupFee,
  setupErc20,
  setupErc721,
  setupGeneric,
  getNetworksConfig
}
