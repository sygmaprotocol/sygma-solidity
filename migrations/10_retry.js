const parseArgs = require("minimist");

const RetryContract = artifacts.require("Retry");

module.exports = async function (deployer) {
	await deployer.deploy(RetryContract);
	const RetryInstance = await RetryContract.deployed();

	console.table({
		"Retry Address": RetryInstance.address,
	});
}
