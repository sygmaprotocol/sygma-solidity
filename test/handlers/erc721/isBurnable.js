// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");

const Helpers = require("../../helpers");

const ERC721MintableContract = artifacts.require("ERC721MinterBurnerPauser");
const ERC721HandlerContract = artifacts.require("ERC721Handler");

contract("ERC721Handler - [Burn ERC721]", async (accounts) => {
  const domainID = 1;
  const emptySetResourceData = "0x";

  let BridgeInstance;
  let ERC721MintableInstance1;
  let ERC721MintableInstance2;
  let resourceID1;
  let resourceID2;
  let initialResourceIDs;
  let initialContractAddresses;
  let burnableContractAddresses;

  beforeEach(async () => {
    await Promise.all([
      (BridgeInstance = await Helpers.deployBridge(domainID, accounts[0])),
      ERC721MintableContract.new("token", "TOK", "").then(
        (instance) => (ERC721MintableInstance1 = instance)
      ),
      ERC721MintableContract.new("token", "TOK", "").then(
        (instance) => (ERC721MintableInstance2 = instance)
      ),
    ]);

    resourceID1 = Helpers.createResourceID(
      ERC721MintableInstance1.address,
      domainID
    );
    resourceID2 = Helpers.createResourceID(
      ERC721MintableInstance2.address,
      domainID
    );
    initialResourceIDs = [resourceID1, resourceID2];
    initialContractAddresses = [
      ERC721MintableInstance1.address,
      ERC721MintableInstance2.address,
    ];
    burnableContractAddresses = [ERC721MintableInstance1.address];
  });

  it("[sanity] contract should be deployed successfully", async () => {
    await TruffleAssert.passes(
      ERC721HandlerContract.new(BridgeInstance.address)
    );
  });

  it("burnableContractAddresses should be marked as burnable", async () => {
    const ERC721HandlerInstance = await ERC721HandlerContract.new(
      BridgeInstance.address
    );

    for (i = 0; i < initialResourceIDs.length; i++) {
      await TruffleAssert.passes(
        BridgeInstance.adminSetResource(
          ERC721HandlerInstance.address,
          initialResourceIDs[i],
          initialContractAddresses[i],
          emptySetResourceData
        )
      );
    }

    for (i = 0; i < burnableContractAddresses.length; i++) {
      await TruffleAssert.passes(
        BridgeInstance.adminSetBurnable(
          ERC721HandlerInstance.address,
          burnableContractAddresses[i]
        )
      );
    }

    for (const burnableAddress of burnableContractAddresses) {
      const isBurnable = (await ERC721HandlerInstance._tokenContractAddressToTokenProperties.call(
        burnableAddress
      )).isBurnable

      assert.isTrue(isBurnable, "Contract wasn't successfully marked burnable");
    }
  });

  it("ERC721MintableInstance2.address should not be marked as burnable", async () => {
    const ERC721HandlerInstance = await ERC721HandlerContract.new(
      BridgeInstance.address
    );

    for (i = 0; i < initialResourceIDs.length; i++) {
      await TruffleAssert.passes(
        BridgeInstance.adminSetResource(
          ERC721HandlerInstance.address,
          initialResourceIDs[i],
          initialContractAddresses[i],
          emptySetResourceData
        )
      );
    }

    for (i = 0; i < burnableContractAddresses.length; i++) {
      await TruffleAssert.passes(
        BridgeInstance.adminSetBurnable(
          ERC721HandlerInstance.address,
          burnableContractAddresses[i]
        )
      );
    }

    const isBurnable = (await ERC721HandlerInstance._tokenContractAddressToTokenProperties.call(
      ERC721MintableInstance2.address
    )).isBurnable;

    assert.isFalse(isBurnable, "Contract shouldn't be marked burnable");
  });

  it("ERC721MintableInstance2.address should be marked as burnable after setBurnable is called", async () => {
    const ERC721HandlerInstance = await ERC721HandlerContract.new(
      BridgeInstance.address
    );

    for (i = 0; i < initialResourceIDs.length; i++) {
      await TruffleAssert.passes(
        BridgeInstance.adminSetResource(
          ERC721HandlerInstance.address,
          initialResourceIDs[i],
          initialContractAddresses[i],
          emptySetResourceData
        )
      );
    }

    for (i = 0; i < burnableContractAddresses.length; i++) {
      await TruffleAssert.passes(
        BridgeInstance.adminSetBurnable(
          ERC721HandlerInstance.address,
          burnableContractAddresses[i]
        )
      );
    }

    await BridgeInstance.adminSetBurnable(
      ERC721HandlerInstance.address,
      ERC721MintableInstance2.address
    );
    const isBurnable = (await ERC721HandlerInstance._tokenContractAddressToTokenProperties.call(
      ERC721MintableInstance2.address
    )).isBurnable;

    assert.isTrue(isBurnable, "Contract wasn't successfully marked burnable");
  });

  it(`ERC721MintableInstances should not be marked as
      burnable after setResource is called on already burnable tokens`, async () => {
    const ERC721HandlerInstance = await ERC721HandlerContract.new(
      BridgeInstance.address
    );

    for (i = 0; i < initialResourceIDs.length; i++) {
      await TruffleAssert.passes(
        BridgeInstance.adminSetResource(
          ERC721HandlerInstance.address,
          initialResourceIDs[i],
          initialContractAddresses[i],
          emptySetResourceData
        )
      );
    }

    for (i = 0; i < initialResourceIDs.length; i++) {
      await TruffleAssert.passes(
        BridgeInstance.adminSetBurnable(
          ERC721HandlerInstance.address,
          initialContractAddresses[i]
        )
      );
    }

    // tokens should be marked as burnable
    for (i = 0; i < initialResourceIDs.length; i++) {
      const isBurnableBeforeReRegisteringResource = (
        await ERC721HandlerInstance._tokenContractAddressToTokenProperties.call(
          initialContractAddresses[i]
        )
      ).isBurnable;

      assert.isTrue(isBurnableBeforeReRegisteringResource, "Contract wasn't successfully marked burnable");
    }

    // re-register resource - sets isBurnable to false for tokens
    for (i = 0; i < initialResourceIDs.length; i++) {
      await TruffleAssert.passes(
        BridgeInstance.adminSetResource(
          ERC721HandlerInstance.address,
          initialResourceIDs[i],
          initialContractAddresses[i],
          emptySetResourceData
        )
      );
    }

    // tokens should not be marked as burnable if resource is re-registered
    for (i = 0; i < initialResourceIDs.length; i++) {
      const isBurnableAfterReRegisteringResource = (
        await ERC721HandlerInstance._tokenContractAddressToTokenProperties.call(
          initialContractAddresses[i]
        )
      ).isBurnable;

      assert.isFalse(isBurnableAfterReRegisteringResource, "Contract shouldn't be marked burnable");
    }
  });
});
