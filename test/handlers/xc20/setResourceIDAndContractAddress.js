/**
 * Copyright 2020 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */

const Ethers = require("ethers");

const Helpers = require("../../helpers");

const ERC20MintableContract = artifacts.require("ERC20PresetMinterPauser");
const XC20HandlerContract = artifacts.require("XC20Handler");

contract(
  "XC20Handler - [setResourceIDAndContractAddress]",
  async (accounts) => {
    const domainID = 1;
    const emptySetResourceData = "0x";

    let BridgeInstance;
    let ERC20MintableInstance1;
    let XC20HandlerInstance;
    let initialResourceIDs;
    let initialContractAddresses;

    beforeEach(async () => {
      (BridgeInstance = await Helpers.deployBridge(domainID, accounts[0])),
        (ERC20MintableInstance1 = await ERC20MintableContract.new(
          "token",
          "TOK"
        ));

      initialResourceIDs = [
        Ethers.utils.hexZeroPad(
          ERC20MintableInstance1.address +
            Ethers.utils.hexlify(domainID).substr(2),
          32
        ),
      ];
      initialContractAddresses = [ERC20MintableInstance1.address];
      burnableContractAddresses = [];

      XC20HandlerInstance = await XC20HandlerContract.new(
        BridgeInstance.address
      );
      await BridgeInstance.adminSetResource(
        XC20HandlerInstance.address,
        initialResourceIDs[0],
        initialContractAddresses[0],
        emptySetResourceData
      );
    });

    it("[sanity] ERC20MintableInstance1's resourceID and contract address should be set correctly", async () => {
      const retrievedTokenAddress =
        await XC20HandlerInstance._resourceIDToTokenContractAddress.call(
          initialResourceIDs[0]
        );
      assert.strictEqual(
        Ethers.utils.getAddress(ERC20MintableInstance1.address),
        retrievedTokenAddress
      );

      const retrievedResourceID =
        await XC20HandlerInstance._tokenContractAddressToResourceID.call(
          ERC20MintableInstance1.address
        );
      assert.strictEqual(
        initialResourceIDs[0].toLowerCase(),
        retrievedResourceID.toLowerCase()
      );
    });

    it("new resourceID and corresponding contract address should be set correctly", async () => {
      const ERC20MintableInstance2 = await ERC20MintableContract.new(
        "token",
        "TOK"
      );
      const secondERC20ResourceID = Ethers.utils.hexZeroPad(
        ERC20MintableInstance2.address +
          Ethers.utils.hexlify(domainID).substr(2),
        32
      );

      await BridgeInstance.adminSetResource(
        XC20HandlerInstance.address,
        secondERC20ResourceID,
        ERC20MintableInstance2.address,
        emptySetResourceData
      );

      const retrievedTokenAddress =
        await XC20HandlerInstance._resourceIDToTokenContractAddress.call(
          secondERC20ResourceID
        );
      assert.strictEqual(
        Ethers.utils.getAddress(ERC20MintableInstance2.address).toLowerCase(),
        retrievedTokenAddress.toLowerCase()
      );

      const retrievedResourceID =
        await XC20HandlerInstance._tokenContractAddressToResourceID.call(
          ERC20MintableInstance2.address
        );
      assert.strictEqual(
        secondERC20ResourceID.toLowerCase(),
        retrievedResourceID.toLowerCase()
      );
    });

    it("existing resourceID should be updated correctly with new token contract address", async () => {
      await BridgeInstance.adminSetResource(
        XC20HandlerInstance.address,
        initialResourceIDs[0],
        ERC20MintableInstance1.address,
        emptySetResourceData
      );

      const ERC20MintableInstance2 = await ERC20MintableContract.new(
        "token",
        "TOK"
      );
      await BridgeInstance.adminSetResource(
        XC20HandlerInstance.address,
        initialResourceIDs[0],
        ERC20MintableInstance2.address,
        emptySetResourceData
      );

      const retrievedTokenAddress =
        await XC20HandlerInstance._resourceIDToTokenContractAddress.call(
          initialResourceIDs[0]
        );
      assert.strictEqual(ERC20MintableInstance2.address, retrievedTokenAddress);

      const retrievedResourceID =
        await XC20HandlerInstance._tokenContractAddressToResourceID.call(
          ERC20MintableInstance2.address
        );
      assert.strictEqual(
        initialResourceIDs[0].toLowerCase(),
        retrievedResourceID.toLowerCase()
      );
    });

    it("existing resourceID should be updated correctly with new handler address", async () => {
      await BridgeInstance.adminSetResource(
        XC20HandlerInstance.address,
        initialResourceIDs[0],
        ERC20MintableInstance1.address,
        emptySetResourceData
      );

      const ERC20MintableInstance2 = await ERC20MintableContract.new(
        "token",
        "TOK"
      );
      XC20HandlerInstance2 = await XC20HandlerContract.new(
        BridgeInstance.address
      );

      await BridgeInstance.adminSetResource(
        XC20HandlerInstance2.address,
        initialResourceIDs[0],
        ERC20MintableInstance2.address,
        emptySetResourceData
      );

      const bridgeHandlerAddress =
        await BridgeInstance._resourceIDToHandlerAddress.call(
          initialResourceIDs[0]
        );
      assert.strictEqual(
        bridgeHandlerAddress.toLowerCase(),
        XC20HandlerInstance2.address.toLowerCase()
      );
    });

    it("existing resourceID should be replaced by new resourceID in handler", async () => {
      await BridgeInstance.adminSetResource(
        XC20HandlerInstance.address,
        initialResourceIDs[0],
        ERC20MintableInstance1.address,
        emptySetResourceData
      );

      const ERC20MintableInstance2 = await ERC20MintableContract.new(
        "token",
        "TOK"
      );
      const secondERC20ResourceID = Ethers.utils.hexZeroPad(
        ERC20MintableInstance2.address +
          Ethers.utils.hexlify(domainID).substr(2),
        32
      );

      await BridgeInstance.adminSetResource(
        XC20HandlerInstance.address,
        secondERC20ResourceID,
        ERC20MintableInstance1.address,
        emptySetResourceData
      );

      const retrievedResourceID =
        await XC20HandlerInstance._tokenContractAddressToResourceID.call(
          ERC20MintableInstance1.address
        );
      assert.strictEqual(
        secondERC20ResourceID.toLowerCase(),
        retrievedResourceID.toLowerCase()
      );

      const retrievedContractAddress =
        await XC20HandlerInstance._resourceIDToTokenContractAddress.call(
          secondERC20ResourceID
        );
      assert.strictEqual(
        retrievedContractAddress.toLowerCase(),
        ERC20MintableInstance1.address.toLowerCase()
      );
    });
  }
);
