import fs from "fs";
import { resolve } from "path";
import type { InterfaceAbi, Fragment } from "ethers";
import { keccak256, ContractFactory } from "ethers";

export function generateAccessControlFuncSignatures(contracts: Array<string>): {
  function: string;
  hash: string;
}[] {
  const allAccessControlFuncSignatures: {
    function: string;
    hash: string;
  }[] = [];

  contracts.map((contractName) => {
    const CONTRACT_PATH = resolve(
      __dirname,
      `../src/contracts/${contractName}.sol`,
    );
    const ARTIFACTS_PATH = resolve(
      __dirname,
      `../artifacts/src/contracts/${contractName}.sol/${contractName}.json`,
    );

    const bridgeArtifacts = JSON.parse(
      fs.readFileSync(ARTIFACTS_PATH).toString(),
    );
    const contractFactory = new ContractFactory(
      bridgeArtifacts.abi as InterfaceAbi,
      bridgeArtifacts.bytecode as string,
    );
    const contractMethods = contractFactory.interface.fragments
      .map((fragment: Fragment) => {
        if (fragment.type == "function") {
          return fragment.format();
        }
      })
      .filter((item) => item) as Array<string>;

    const contractInstance = fs.readFileSync(CONTRACT_PATH);

    // regex that will match all functions that have "onlyAllowed" modifier
    const regex = RegExp(
      "function\\s+(?:(?!_onlyAllowed|function).)+onlyAllowed",
      "gs",
    );

    let a;
    const b: Array<string> = [];
    // fetch all functions that have "onlyAllowed" modifier
    while ((a = regex.exec(contractInstance.toString())) !== null) {
      // filter out only function name from matching (onlyAllowed) functions
      b.push(a[0].split(/[\s()]+/)[1]);
    }

    // filter out from Bridge ABI functions signatures with "onlyAllowed" modifier
    const accessControlFuncSignatures = contractMethods
      .filter((el1) => b.some((el2) => el1.includes(el2)))
      .map((func) => ({
        function: func,
        hash: keccak256(Buffer.from(func)).substring(0, 10),
      }));
    allAccessControlFuncSignatures.push(...accessControlFuncSignatures);
  });

  console.table(allAccessControlFuncSignatures);

  return allAccessControlFuncSignatures;
}
