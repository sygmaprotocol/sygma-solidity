/**
 * Copyright 2020 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */

const Helpers = require("../../test/helpers");

const BridgeContract = artifacts.require("Bridge");
const AccessControlSegregatorContract = artifacts.require(
  "AccessControlSegregator"
);
const ERC20HandlerContract = artifacts.require("ERC20Handler");
const ERC721HandlerContract = artifacts.require("ERC721Handler");
const ERC1155HandlerContract = artifacts.require("ERC1155Handler");
const PermissionedGenericHandlerContract = artifacts.require(
  "PermissionedGenericHandler"
);
const PermissionlessGenericHandlerContract = artifacts.require(
  "PermissionlessGenericHandler"
);
const TestStoreContract = artifacts.require("TestStore");
const ERCHandlerHelpersContract = artifacts.require("ERCHandlerHelpers");
const ERC20SafeContract = artifacts.require("ERC20Safe");
const ERC721SafeContract = artifacts.require("ERC721Safe");
const ERC1155SafeContract = artifacts.require("ERC1155Safe");

contract("Gas Benchmark - [contract deployments]", async (accounts) => {
  const domainID = 1;
  const TestStoreMinCount = 1;
  const gasBenchmarks = [];

  let BridgeInstance;

  it("Should deploy all contracts and print benchmarks", async () => {
    const accessControlInstance = await AccessControlSegregatorContract.new(
        Helpers.accessControlFuncSignatures,
        Array(13).fill(accounts[0])
    );
    let contractInstances = [accessControlInstance];
    contractInstances = contractInstances.concat(
      await Promise.all([
        await BridgeContract.new(domainID, accessControlInstance.address).then(
          (instance) => (BridgeInstance = instance)
        ),
        ERC20HandlerContract.new(BridgeInstance.address),
        ERC721HandlerContract.new(BridgeInstance.address),
        ERC1155HandlerContract.new(BridgeInstance.address),
        PermissionedGenericHandlerContract.new(BridgeInstance.address),
        PermissionlessGenericHandlerContract.new(BridgeInstance.address),
        TestStoreContract.new(TestStoreMinCount),
        ERCHandlerHelpersContract.new(BridgeInstance.address),
        ERC20SafeContract.new(),
        ERC721SafeContract.new(),
        ERC1155SafeContract.new(),
      ])
    );
    for (const contractInstance of contractInstances) {
      const txReceipt = await web3.eth.getTransactionReceipt(
        contractInstance.transactionHash
      );
      gasBenchmarks.push({
        type: contractInstance.constructor._json.contractName,
        gasUsed: txReceipt.gasUsed,
      });
    }

    console.table(gasBenchmarks);
  });
});
