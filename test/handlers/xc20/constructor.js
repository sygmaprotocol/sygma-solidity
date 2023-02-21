/**
 * Copyright 2020 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");

const Helpers = require("../../helpers");

const ERC20MintableContract = artifacts.require("ERC20PresetMinterPauser");
const XC20HandlerContract = artifacts.require("XC20Handler");

contract("XC20Handler - [constructor]", async (accounts) => {
  const domainID = 1;
  const emptySetResourceData = "0x";

  let BridgeInstance;
  let ERC20MintableInstance1;
  let ERC20MintableInstance2;
  let ERC20MintableInstance3;
  let initialResourceIDs;
  let initialContractAddresses;

  beforeEach(async () => {
    await Promise.all([
      (BridgeInstance = await Helpers.deployBridge(domainID, accounts[0])),
      ERC20MintableContract.new("token", "TOK").then(
        (instance) => (ERC20MintableInstance1 = instance)
      ),
      ERC20MintableContract.new("token", "TOK").then(
        (instance) => (ERC20MintableInstance2 = instance)
      ),
      ERC20MintableContract.new("token", "TOK").then(
        (instance) => (ERC20MintableInstance3 = instance)
      ),
    ]);

    initialResourceIDs = [];
    burnableContractAddresses = [];

    initialResourceIDs.push(
      Ethers.utils.hexZeroPad(
        ERC20MintableInstance1.address +
          Ethers.utils.hexlify(domainID).substr(2),
        32
      )
    );
    initialResourceIDs.push(
      Ethers.utils.hexZeroPad(
        ERC20MintableInstance2.address +
          Ethers.utils.hexlify(domainID).substr(2),
        32
      )
    );
    initialResourceIDs.push(
      Ethers.utils.hexZeroPad(
        ERC20MintableInstance3.address +
          Ethers.utils.hexlify(domainID).substr(2),
        32
      )
    );

    initialContractAddresses = [
      ERC20MintableInstance1.address,
      ERC20MintableInstance2.address,
      ERC20MintableInstance3.address,
    ];
  });

  it("[sanity] contract should be deployed successfully", async () => {
    await TruffleAssert.passes(XC20HandlerContract.new(BridgeInstance.address));
  });

  it("[sanity] bridge configured on domain", async () => {
    assert.equal(await BridgeInstance._domainID(), domainID);
  });

  it("[sanity] bridge should be initially paused", async () => {
    assert.isTrue(await BridgeInstance.paused());
  });

  it(
    "initialResourceIDs should be parsed correctly and corresponding resourceID mappings should have expected values",
    async () => {
    const XC20HandlerInstance = await XC20HandlerContract.new(
      BridgeInstance.address
    );

    for (i = 0; i < initialResourceIDs.length; i++) {
      await TruffleAssert.passes(
        BridgeInstance.adminSetResource(
          XC20HandlerInstance.address,
          initialResourceIDs[i],
          initialContractAddresses[i],
          emptySetResourceData
        )
      );
    }

    for (const resourceID of initialResourceIDs) {
      const tokenAddress = "0x" + resourceID.substr(24, 40);

      const retrievedTokenAddress =
        await XC20HandlerInstance._resourceIDToTokenContractAddress.call(
          resourceID
        );
      assert.strictEqual(
        Ethers.utils.getAddress(tokenAddress).toLowerCase(),
        retrievedTokenAddress.toLowerCase()
      );

      const retrievedResourceID = (await XC20HandlerInstance._tokenContractAddressToTokenProperties.call(
        tokenAddress
      )).resourceID

      assert.strictEqual(
        resourceID.toLowerCase(),
        retrievedResourceID.toLowerCase()
      );
    }
  });
});
