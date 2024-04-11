const parseArgs = require("minimist");

const FROSTKeygenContract = artifacts.require("FROSTKeygen");

module.exports = async function (deployer) {

  const deployFrostKeygen = parseArgs(process.argv.slice(2))["deploy-frost-keygen"];
  
  if (deployFrostKeygen){
    
    const frostKeygenInstance = await deployer.deploy(FROSTKeygenContract, deployer.address); 

    console.table({
        "FROSTKeygen Address": frostKeygenInstance.address,
    });

  }

}

