// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");

const Helpers = require("../../helpers");

const ERC20MintableContract = artifacts.require("ERC20PresetMinterPauser");
const ERC20HandlerContract = artifacts.require("ERC20Handler");

contract("ERC20Handler - [isWhitelisted]", async (accounts) => {
  const domainID = 1;
  const emptySetResourceData = "0x";

  let BridgeInstance;
  let ERC20MintableInstance1;
  let initialResourceIDs;

  beforeEach(async () => {
    await Promise.all([
      (BridgeInstance = await Helpers.deployBridge(domainID, accounts[0])),
      ERC20MintableContract.new("token", "TOK").then(
        (instance) => (ERC20MintableInstance1 = instance)
      ),
      ERC20MintableContract.new("token", "TOK").then(
        (instance) => (ERC20MintableInstance2 = instance)
      ),
    ]);

    initialResourceIDs = [];
    resourceID1 = Ethers.utils.hexZeroPad(
      ERC20MintableInstance1.address + Ethers.utils.hexlify(domainID).substr(2),
      32
    );
    initialResourceIDs.push(resourceID1);
    initialContractAddresses = [ERC20MintableInstance1.address];
    burnableContractAddresses = [];
  });

  it("[sanity] contract should be deployed successfully", async () => {
    await TruffleAssert.passes(
      ERC20HandlerContract.new(BridgeInstance.address)
    );
  });

  it("initialContractAddress should be whitelisted", async () => {
    const ERC20HandlerInstance = await ERC20HandlerContract.new(
      BridgeInstance.address
    );
    await BridgeInstance.adminSetResource(
      ERC20HandlerInstance.address,
      resourceID1,
      ERC20MintableInstance1.address,
      emptySetResourceData
    );
    const isWhitelisted = (await ERC20HandlerInstance._tokenContractAddressToTokenProperties.call(
      ERC20MintableInstance1.address
    )).isWhitelisted;

    assert.isTrue(isWhitelisted, "Contract wasn't successfully whitelisted");
  })
})
