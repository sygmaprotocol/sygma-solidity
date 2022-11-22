const parseArgs = require('minimist')
const fs = require("fs");

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

module.exports = {
  setupFee,
  getNetworksConfig
}
