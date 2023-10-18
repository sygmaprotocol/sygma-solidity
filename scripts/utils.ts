import fs from "fs";
import { resolve } from "path";
import type { InterfaceAbi, Fragment } from "ethers";
import { keccak256, ContractFactory } from "ethers";

const BRIDGE_CONTRACT_PATH = resolve(__dirname, "../src/contracts/Bridge.sol");
const ARTIFACTS_PATH = resolve(
  __dirname,
  "../artifacts/src/contracts/Bridge.sol/Bridge.json",
);

export function generateAccessControlFuncSignatures(): {
  function: string;
  hash: string;
}[] {
  const bridgeArtifacts = JSON.parse(
    fs.readFileSync(ARTIFACTS_PATH).toString(),
  );
  const bridgeContractFactory = new ContractFactory(
    bridgeArtifacts.abi as InterfaceAbi,
    bridgeArtifacts.bytecode as string,
  );
  const bridgeContractMethods = bridgeContractFactory.interface.fragments
    .map((fragment: Fragment) => {
      if (fragment.type == "function") {
        return fragment.format();
      }
    })
    .filter((item) => item) as Array<string>;

  const bridgeContract = fs.readFileSync(BRIDGE_CONTRACT_PATH);

  // regex that will match all functions that have "onlyAllowed" modifier
  const regex = RegExp(
    "function\\s+(?:(?!_onlyAllowed|function).)+onlyAllowed",
    "gs",
  );

  let a;
  const b: Array<string> = [];
  // fetch all functions that have "onlyAllowed" modifier from "Bridge.sol"
  while ((a = regex.exec(bridgeContract.toString())) !== null) {
    // filter out only function name from matching (onlyAllowed) functions
    b.push(a[0].split(/[\s()]+/)[1]);
  }

  let accessControlFuncSignatures = [];
  // filter out from Bridge ABI functions signatures with "onlyAllowed" modifier
  accessControlFuncSignatures = bridgeContractMethods
    .filter((el1) => b.some((el2) => el1.includes(el2)))
    .map((func) => ({
      function: func,
      hash: keccak256(Buffer.from(func)).substring(0, 10),
    }));

  console.table(accessControlFuncSignatures);

  return accessControlFuncSignatures;
}
