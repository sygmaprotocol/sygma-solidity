// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");

const Helpers = require("../../helpers");

const ERC1155MintableContract = artifacts.require("ERC1155PresetMinterPauser");
const ERC1155HandlerContract = artifacts.require("ERC1155Handler");

contract("ERC1155Handler - [Burn ERC1155]", async (accounts) => {
  const domainID = 1;
  const emptySetResourceData = "0x";

  let BridgeInstance;
  let ERC1155MintableInstance1;
  let ERC1155MintableInstance2;
  let resourceID1;
  let resourceID2;
  let initialResourceIDs;
  let initialContractAddresses;
  let burnableContractAddresses;

  beforeEach(async () => {
    await Promise.all([
      (BridgeInstance = await Helpers.deployBridge(domainID, accounts[0])),
      ERC1155MintableContract.new("TOK").then(
        (instance) => (ERC1155MintableInstance1 = instance)
      ),
      ERC1155MintableContract.new("TOK").then(
        (instance) => (ERC1155MintableInstance2 = instance)
      ),
    ]);

    resourceID1 = Ethers.utils.hexZeroPad(
      ERC1155MintableInstance1.address +
        Ethers.utils.hexlify(domainID).substr(2),
      32
    );
    resourceID2 = Ethers.utils.hexZeroPad(
      ERC1155MintableInstance2.address +
        Ethers.utils.hexlify(domainID).substr(2),
      32
    );
    initialResourceIDs = [resourceID1, resourceID2];
    initialContractAddresses = [
      ERC1155MintableInstance1.address,
      ERC1155MintableInstance2.address,
    ];
    burnableContractAddresses = [ERC1155MintableInstance1.address];
  });

  it("[sanity] contract should be deployed successfully", async () => {
    await TruffleAssert.passes(
      ERC1155HandlerContract.new(BridgeInstance.address)
    );
  });

  it("burnableContractAddresses should be marked as burnable", async () => {
    const ERC1155HandlerInstance = await ERC1155HandlerContract.new(
      BridgeInstance.address
    );

    for (i = 0; i < initialResourceIDs.length; i++) {
      await TruffleAssert.passes(
        BridgeInstance.adminSetResource(
          ERC1155HandlerInstance.address,
          initialResourceIDs[i],
          initialContractAddresses[i],
          emptySetResourceData
        )
      );
    }

    for (i = 0; i < burnableContractAddresses.length; i++) {
      await TruffleAssert.passes(
        BridgeInstance.adminSetBurnable(
          ERC1155HandlerInstance.address,
          burnableContractAddresses[i]
        )
      );
    }

    for (const burnableAddress of burnableContractAddresses) {
      const isBurnable = (await ERC1155HandlerInstance._tokenContractAddressToTokenProperties.call(
        burnableAddress
      )).isBurnable;

      assert.isTrue(isBurnable, "Contract wasn't successfully marked burnable");
    }
  });

  it("ERC1155MintableInstance2.address should not be marked as burnable", async () => {
    const ERC1155HandlerInstance = await ERC1155HandlerContract.new(
      BridgeInstance.address
    );

    for (i = 0; i < initialResourceIDs.length; i++) {
      await TruffleAssert.passes(
        BridgeInstance.adminSetResource(
          ERC1155HandlerInstance.address,
          initialResourceIDs[i],
          initialContractAddresses[i],
          emptySetResourceData
        )
      );
    }

    for (i = 0; i < burnableContractAddresses.length; i++) {
      await TruffleAssert.passes(
        BridgeInstance.adminSetBurnable(
          ERC1155HandlerInstance.address,
          burnableContractAddresses[i]
        )
      );
    }

    const isBurnable = (await ERC1155HandlerInstance._tokenContractAddressToTokenProperties.call(
      ERC1155MintableInstance2.address
    )).isBurnable

    assert.isFalse(isBurnable, "Contract shouldn't be marked burnable");
  });

  it("ERC1155MintableInstance2.address should be marked as burnable after setBurnable is called", async () => {
    const ERC1155HandlerInstance = await ERC1155HandlerContract.new(
      BridgeInstance.address
    );

    for (i = 0; i < initialResourceIDs.length; i++) {
      await TruffleAssert.passes(
        BridgeInstance.adminSetResource(
          ERC1155HandlerInstance.address,
          initialResourceIDs[i],
          initialContractAddresses[i],
          emptySetResourceData
        )
      );
    }

    for (i = 0; i < burnableContractAddresses.length; i++) {
      await TruffleAssert.passes(
        BridgeInstance.adminSetBurnable(
          ERC1155HandlerInstance.address,
          burnableContractAddresses[i]
        )
      );
    }

    await BridgeInstance.adminSetBurnable(
      ERC1155HandlerInstance.address,
      ERC1155MintableInstance2.address
    );
    const isBurnable = (await ERC1155HandlerInstance._tokenContractAddressToTokenProperties.call(
      ERC1155MintableInstance2.address
    )).isBurnable;

    assert.isTrue(isBurnable, "Contract wasn't successfully marked burnable");
  });

  it(`ERC1155MintableInstances should not be marked as
      burnable after setResource is called on already burnable tokens`, async () => {
    const ERC1155HandlerInstance = await ERC1155HandlerContract.new(
      BridgeInstance.address
    );

    for (i = 0; i < initialResourceIDs.length; i++) {
      await TruffleAssert.passes(
        BridgeInstance.adminSetResource(
          ERC1155HandlerInstance.address,
          initialResourceIDs[i],
          initialContractAddresses[i],
          emptySetResourceData
        )
      );
    }

    for (i = 0; i < initialResourceIDs.length; i++) {
      await TruffleAssert.passes(
        BridgeInstance.adminSetBurnable(
          ERC1155HandlerInstance.address,
          initialContractAddresses[i]
        )
      );
    }

    // tokens should be marked as burnable
    for (i = 0; i < initialResourceIDs.length; i++) {
      const isBurnableBeforeReRegisteringResource = (
        await ERC1155HandlerInstance._tokenContractAddressToTokenProperties.call(
          initialContractAddresses[i]
        )
      ).isBurnable;

      assert.isTrue(isBurnableBeforeReRegisteringResource, "Contract wasn't successfully marked burnable");
    }

    // re-register resource - sets isBurnable to false for tokens
    for (i = 0; i < initialResourceIDs.length; i++) {
      await TruffleAssert.passes(
        BridgeInstance.adminSetResource(
          ERC1155HandlerInstance.address,
          initialResourceIDs[i],
          initialContractAddresses[i],
          emptySetResourceData
        )
      );
    }

    // tokens should not be marked as burnable if resource is re-registered
    for (i = 0; i < initialResourceIDs.length; i++) {
      const isBurnableAfterReRegisteringResource = (
        await ERC1155HandlerInstance._tokenContractAddressToTokenProperties.call(
          initialContractAddresses[i]
        )
      ).isBurnable;

      assert.isFalse(isBurnableAfterReRegisteringResource, "Contract shouldn't be marked burnable");
    }
  });
});
