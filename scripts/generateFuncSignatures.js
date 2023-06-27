#!/usr/bin/env node
// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const fs = require("fs");
const {utils} = require("ethers");
const {resolve} = require("path");


const BRIDGE_CONTRACT_PATH = resolve(__dirname, "../contracts/Bridge.sol");
const ARTIFACTS_PATH = resolve(__dirname, "../build/contracts/Bridge.json");

function generateAccessControlFuncSignatures() {
  const bridgeAbiJson = JSON.parse(fs.readFileSync(ARTIFACTS_PATH));
  const bridgeContractMethods = bridgeAbiJson.userdoc.methods
  const bridgeContract = fs.readFileSync(BRIDGE_CONTRACT_PATH);

  // regex that will match all functions that have "onlyAllowed" modifier
  const regex = RegExp("function\\s+(?:(?!_onlyAllowed|function).)+onlyAllowed", "gs");

  let a;
  const b = [];
  // fetch all functions that have "onlyAllowed" modifier from "Bridge.sol"
  while ((a = regex.exec(bridgeContract)) !== null) {
    // filter out only function name from matching (onlyAllowed) functions
    b.push(a[0].split(/[\s()]+/)[1]);
  }

  let accessControlFuncSignatures = []
  // filter out from Bridge ABI functions signatures with "onlyAllowed" modifier
  accessControlFuncSignatures = Object.keys(bridgeContractMethods).filter(
    el1 => b.some(
      el2 => el1.includes(el2))).map(
        func => ({
          function: func,
          hash: utils.keccak256(Buffer.from(func)).substring(0,10)
    })
  );

  console.table(accessControlFuncSignatures);

  return accessControlFuncSignatures;
}

module.exports = {
  generateAccessControlFuncSignatures
};
