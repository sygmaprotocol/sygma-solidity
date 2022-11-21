const parseArgs = require('minimist')
const fs = require("fs");

function getNetworksConfig() {
  return JSON.parse(fs.readFileSync(parseArgs(process.argv.slice(2))["file"]));
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
