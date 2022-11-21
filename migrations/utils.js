module.exports = async function setupFee(
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
