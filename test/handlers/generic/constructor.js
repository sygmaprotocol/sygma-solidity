/**
 * Copyright 2020 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */

const TruffleAssert = require('truffle-assertions');
const Ethers = require('ethers');

const Helpers = require('../../helpers');

const BridgeContract = artifacts.require("Bridge");
const PermissionedGenericHandlerContract = artifacts.require("PermissionedGenericHandler");
const TestStoreContract = artifacts.require("TestStore");

contract('PermissionedGenericHandler - [constructor]', async (accounts) => {
    const domainID = 1;
    const TestStoreMinCount = 1;
    const TestStoreStoreFuncSig = 'store(bytes32)';

    let BridgeInstance;
    let TestStoreInstance1;
    let TestStoreInstance2;
    let TestStoreInstance3;
    let initialResourceIDs;
    let initialContractAddresses;
    let permissionedGenericHandlerSetResourceData

    beforeEach(async () => {
        await Promise.all([
            BridgeInstance = await Helpers.deployBridge(domainID, accounts[0]),
            TestStoreContract.new(TestStoreMinCount).then(instance => TestStoreInstance1 = instance),
            TestStoreContract.new(TestStoreMinCount).then(instance => TestStoreInstance2 = instance),
            TestStoreContract.new(TestStoreMinCount).then(instance => TestStoreInstance3 = instance)
        ]);

        initialResourceIDs = [
            Helpers.createResourceID(TestStoreInstance1.address, domainID),
            Helpers.createResourceID(TestStoreInstance2.address, domainID),
            Helpers.createResourceID(TestStoreInstance3.address, domainID)
        ];
        initialContractAddresses = [TestStoreInstance1.address, TestStoreInstance2.address, TestStoreInstance3.address];

        const executeProposalFuncSig = Ethers.utils.keccak256(Ethers.utils.hexlify(Ethers.utils.toUtf8Bytes(TestStoreStoreFuncSig))).substr(0, 10);

        permissionedGenericHandlerSetResourceData = [
          Helpers.constructGenericHandlerSetResourceData(Helpers.blankFunctionSig, Helpers.blankFunctionDepositorOffset, executeProposalFuncSig),
          Helpers.constructGenericHandlerSetResourceData(Helpers.blankFunctionSig, Helpers.blankFunctionDepositorOffset, executeProposalFuncSig),
          Helpers.constructGenericHandlerSetResourceData(Helpers.blankFunctionSig, Helpers.blankFunctionDepositorOffset, executeProposalFuncSig),
      ];
    });

    it('[sanity] contract should be deployed successfully', async () => {
        await TruffleAssert.passes(
            PermissionedGenericHandlerContract.new(
                BridgeInstance.address));
    });

    it('contract mappings were set with expected values', async () => {
        const PermissionedGenericHandlerInstance = await PermissionedGenericHandlerContract.new(
            BridgeInstance.address);

        for (let i = 0; i < initialResourceIDs.length; i++) {
            await BridgeInstance.adminSetResource(PermissionedGenericHandlerInstance.address, initialResourceIDs[i], initialContractAddresses[i], permissionedGenericHandlerSetResourceData[i]);
        }

        for (let i = 0; i < initialResourceIDs.length; i++) {
            const retrievedTokenAddress = await PermissionedGenericHandlerInstance._resourceIDToContractAddress.call(initialResourceIDs[i]);
            assert.strictEqual(initialContractAddresses[i].toLowerCase(), retrievedTokenAddress.toLowerCase());

            const retrievedResourceID = await PermissionedGenericHandlerInstance._contractAddressToResourceID.call(initialContractAddresses[i]);
            assert.strictEqual(initialResourceIDs[i].toLowerCase(), retrievedResourceID.toLowerCase());

            const retrievedDepositFunctionSig = await PermissionedGenericHandlerInstance._contractAddressToDepositFunctionSignature.call(initialContractAddresses[i]);
            // compare bytes 0-4 from permissionedGenericHandlerSetResourceData
            assert.strictEqual(permissionedGenericHandlerSetResourceData[i].substr(0,10).toLowerCase(), retrievedDepositFunctionSig.toLowerCase());

            const retrievedDepositFunctionDepositorOffset = await PermissionedGenericHandlerInstance._contractAddressToDepositFunctionDepositorOffset.call(initialContractAddresses[i]);
            // compare bytes 4 - 36 from permissionedGenericHandlerSetResourceData
            assert.strictEqual("0x" + permissionedGenericHandlerSetResourceData[i].substr(10,64), Helpers.toHex(retrievedDepositFunctionDepositorOffset.toNumber(), 32));

            const retrievedExecuteFunctionSig = await PermissionedGenericHandlerInstance._contractAddressToExecuteFunctionSignature.call(initialContractAddresses[i]);
            // compare bytes 36 - 40 from permissionedGenericHandlerSetResourceData
            assert.strictEqual("0x" + permissionedGenericHandlerSetResourceData[i].substr(74, 8).toLowerCase(), retrievedExecuteFunctionSig.toLowerCase());
        }
    });
});
