/**
 * Copyright 2020 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */

const TruffleAssert = require('truffle-assertions');
const Ethers = require('ethers');

const Helpers = require('../../helpers');

const BridgeContract = artifacts.require("Bridge");
const GenericHandlerContract = artifacts.require("GenericHandler");
const TestStoreContract = artifacts.require("TestStore");

contract('GenericHandler - [constructor]', async (accounts) => {
    const domainID = 1;
    const TestStoreMinCount = 1;
    const blankFunctionSig = '0x00000000';
    const blankFunctionDepositorOffset = 0;
    const TestStoreStoreFuncSig = 'store(bytes32)';

    let BridgeInstance;
    let TestStoreInstance1;
    let TestStoreInstance2;
    let TestStoreInstance3;
    let initialResourceIDs;
    let initialContractAddresses;
    let initialDepositFunctionSignatures;
    let initialDepositFunctionDepositorOffsets;
    let initialExecuteFunctionSignatures;

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

        initialDepositFunctionSignatures = [blankFunctionSig, blankFunctionSig, blankFunctionSig];
        initialDepositFunctionDepositorOffsets = [blankFunctionDepositorOffset, blankFunctionDepositorOffset, blankFunctionDepositorOffset];
        initialExecuteFunctionSignatures = [executeProposalFuncSig, executeProposalFuncSig, executeProposalFuncSig];
    });

    it('[sanity] contract should be deployed successfully', async () => {
        await TruffleAssert.passes(
            GenericHandlerContract.new(
                BridgeInstance.address));
    });

    it('contract mappings were set with expected values', async () => {
        const GenericHandlerInstance = await GenericHandlerContract.new(
            BridgeInstance.address);

        for (let i = 0; i < initialResourceIDs.length; i++) {
            await BridgeInstance.adminSetGenericResource(GenericHandlerInstance.address, initialResourceIDs[i], initialContractAddresses[i], initialDepositFunctionSignatures[i], initialDepositFunctionDepositorOffsets[i], initialExecuteFunctionSignatures[i]);
        }

        for (let i = 0; i < initialResourceIDs.length; i++) {
            const retrievedTokenAddress = await GenericHandlerInstance._resourceIDToContractAddress.call(initialResourceIDs[i]);
            assert.strictEqual(initialContractAddresses[i].toLowerCase(), retrievedTokenAddress.toLowerCase());

            const retrievedResourceID = await GenericHandlerInstance._contractAddressToResourceID.call(initialContractAddresses[i]);
            assert.strictEqual(initialResourceIDs[i].toLowerCase(), retrievedResourceID.toLowerCase());

            const retrievedDepositFunctionSig = await GenericHandlerInstance._contractAddressToDepositFunctionSignature.call(initialContractAddresses[i]);
            assert.strictEqual(initialDepositFunctionSignatures[i].toLowerCase(), retrievedDepositFunctionSig.toLowerCase());

            const retrievedDepositFunctionDepositorOffset = await GenericHandlerInstance._contractAddressToDepositFunctionDepositorOffset.call(initialContractAddresses[i]);
            assert.strictEqual(initialDepositFunctionDepositorOffsets[i], retrievedDepositFunctionDepositorOffset.toNumber());

            const retrievedExecuteFunctionSig = await GenericHandlerInstance._contractAddressToExecuteFunctionSignature.call(initialContractAddresses[i]);
            assert.strictEqual(initialExecuteFunctionSignatures[i].toLowerCase(), retrievedExecuteFunctionSig.toLowerCase());
        }
    });
});
