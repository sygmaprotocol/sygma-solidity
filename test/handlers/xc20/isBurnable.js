/**
 * Copyright 2020 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");

const Helpers = require("../../helpers");

const ERC20MintableContract = artifacts.require("ERC20PresetMinterPauser");
const XC20HandlerContract = artifacts.require("XC20Handler");

contract("XC20Handler - [Burn XC20]", async (accounts) => {
  const domainID = 1;
  const emptySetResourceData = "0x";

  let BridgeInstance;
  let ERC20MintableInstance1;
  let ERC20MintableInstance2;
  let resourceID1;
  let resourceID2;
  let initialResourceIDs;
  let initialContractAddresses;
  let burnableContractAddresses;

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

    resourceID1 = Ethers.utils.hexZeroPad(
      ERC20MintableInstance1.address + Ethers.utils.hexlify(domainID).substr(2),
      32
    );
    resourceID2 = Ethers.utils.hexZeroPad(
      ERC20MintableInstance2.address + Ethers.utils.hexlify(domainID).substr(2),
      32
    );
    initialResourceIDs = [resourceID1, resourceID2];
    initialContractAddresses = [
      ERC20MintableInstance1.address,
      ERC20MintableInstance2.address,
    ];
    burnableContractAddresses = [ERC20MintableInstance1.address];
  });

  it("[sanity] contract should be deployed successfully", async () => {
    await TruffleAssert.passes(XC20HandlerContract.new(BridgeInstance.address));
  });

  it("burnableContractAddresses should be marked as burnable", async () => {
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

    for (i = 0; i < burnableContractAddresses.length; i++) {
      await TruffleAssert.passes(
        BridgeInstance.adminSetBurnable(
          XC20HandlerInstance.address,
          burnableContractAddresses[i]
        )
      );
    }

    for (const burnableAddress of burnableContractAddresses) {
      const isBurnable = (await XC20HandlerInstance._tokenContractAddressToTokenProperties.call(
        burnableAddress
      )).isBurnable;

      assert.isTrue(isBurnable, "Contract wasn't successfully marked burnable");
    }
  });

  it("ERC20MintableInstance2.address should not be marked as burnable", async () => {
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

    for (i = 0; i < burnableContractAddresses.length; i++) {
      await TruffleAssert.passes(
        BridgeInstance.adminSetBurnable(
          XC20HandlerInstance.address,
          burnableContractAddresses[i]
        )
      );
    }

    const isBurnable = (await XC20HandlerInstance._tokenContractAddressToTokenProperties.call(
      ERC20MintableInstance2.address
    )).isBurnable;

    assert.isFalse(isBurnable, "Contract shouldn't be marked burnable");
  });

  it("ERC20MintableInstance2.address should be marked as burnable after setBurnable is called", async () => {
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

    for (i = 0; i < burnableContractAddresses.length; i++) {
      await TruffleAssert.passes(
        BridgeInstance.adminSetBurnable(
          XC20HandlerInstance.address,
          burnableContractAddresses[i]
        )
      );
    }

    await BridgeInstance.adminSetBurnable(
      XC20HandlerInstance.address,
      ERC20MintableInstance2.address
    );
    const isBurnable = (await XC20HandlerInstance._tokenContractAddressToTokenProperties.call(
      ERC20MintableInstance2.address
    )).isBurnable;

    assert.isTrue(isBurnable, "Contract wasn't successfully marked burnable");
  });
});
