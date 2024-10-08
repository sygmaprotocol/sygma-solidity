const parseArgs = require("minimist");

const Admin = artifacts.require("Admin");

module.exports = async function (deployer) {

  const deployAdminContract  = parseArgs(process.argv.slice(2))["deploy-admin"];

  if (deployAdminContract){
    await deployer.deploy(Admin);
    const adminInstance = await Admin.deployed();

    console.table({
        "Admin Address": adminInstance.address,
    });
  }
}
