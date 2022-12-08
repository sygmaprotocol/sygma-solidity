/**
 * Copyright 2020 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */

const TruffleAssert = require('truffle-assertions');
const Ethers = require('ethers');
const Helpers = require('../../helpers');

const TestStoreContract = artifacts.require("TestStore");
const PermissionlessGenericHandlerContract = artifacts.require("PermissionlessGenericHandler");

contract('PermissionlessGenericHandler - [Execute Proposal]', async (accounts) => {
    const originDomainID = 1;
    const destinationDomainID = 2;
    const expectedDepositNonce = 1;

    const depositorAddress = accounts[1];
    const relayer1Address = accounts[2];
    const relayer2Address = accounts[3];
    const invalidExecutionContractAddress = accounts[4];

    const feeData = '0x';
    const destinationMaxFee = 2000000;
    const hashOfTestStore = Ethers.utils.keccak256('0xc0ffee');

    let BridgeInstance;
    let TestStoreInstance;

    let resourceID;
    let depositFunctionSignature;
    let PermissionlessGenericHandlerInstance;
    let depositData;
    let proposal;

    beforeEach(async () => {
        await Promise.all([
            BridgeInstance = await Helpers.deployBridge(destinationDomainID, accounts[0]),
            TestStoreContract.new().then(instance => TestStoreInstance = instance)
        ]);

        resourceID = Helpers.createResourceID(TestStoreInstance.address, originDomainID);

        PermissionlessGenericHandlerInstance = await PermissionlessGenericHandlerContract.new(
            BridgeInstance.address);

        depositFunctionSignature = Helpers.getFunctionSignature(TestStoreInstance, 'storeWithDepositor');

        const PermissionlessGenericHandlerSetResourceData = Helpers.constructGenericHandlerSetResourceData(
            depositFunctionSignature,
            Helpers.blankFunctionDepositorOffset,
            Helpers.blankFunctionSig
        );
        await BridgeInstance.adminSetResource(PermissionlessGenericHandlerInstance.address, resourceID, TestStoreInstance.address, PermissionlessGenericHandlerSetResourceData);


        depositData = Helpers.createPermissionlessGenericDepositData(
            depositFunctionSignature,
            TestStoreInstance.address,
            destinationMaxFee,
            depositorAddress,
            hashOfTestStore
        );

        proposal = {
          originDomainID: originDomainID,
          depositNonce: expectedDepositNonce,
          data: depositData,
          resourceID: resourceID
        };

        // set MPC address to unpause the Bridge
        await BridgeInstance.endKeygen(Helpers.mpcAddress);
    });

  it('deposit can be executed successfully', async () => {
      const proposalSignedData = await Helpers.signTypedProposal(BridgeInstance.address, [proposal]);
      await TruffleAssert.passes(BridgeInstance.deposit(
          originDomainID,
          resourceID,
          depositData,
          feeData,
          { from: depositorAddress }
      ));

      // relayer1 executes the proposal
      await TruffleAssert.passes(BridgeInstance.executeProposal(
          proposal,
          proposalSignedData,
          { from: relayer1Address }
      ));

      // Verifying asset was marked as stored in TestStoreInstance
      assert.isTrue(await TestStoreInstance._assetsStored.call(hashOfTestStore));
  });

    it('AssetStored event should be emitted', async () => {
        const proposalSignedData = await Helpers.signTypedProposal(BridgeInstance.address, [proposal]);


        await TruffleAssert.passes(BridgeInstance.deposit(
            originDomainID,
            resourceID,
            depositData,
            feeData,
            { from: depositorAddress }
        ));

        // relayer1 executes the proposal
        const executeTx = await BridgeInstance.executeProposal(
            proposal,
            proposalSignedData,
            { from: relayer2Address }
        );

        const internalTx = await TruffleAssert.createTransactionResult(TestStoreInstance, executeTx.tx);
        TruffleAssert.eventEmitted(internalTx, 'AssetStored', event => {
          return event.asset === hashOfTestStore;
        });

        assert.isTrue(await TestStoreInstance._assetsStored.call(hashOfTestStore),
            'TestStore asset was not successfully stored');
    });

    it('ProposalExecution should be emitted even if handler execution fails', async () => {
      const proposalSignedData = await Helpers.signTypedProposal(BridgeInstance.address, [proposal]);
      // execution contract address
      const invalidDepositData =
      Helpers.createPermissionlessGenericDepositData(
        depositFunctionSignature,
        invalidExecutionContractAddress,
        destinationMaxFee,
        depositorAddress,
        hashOfTestStore
    );

    const depositDataHash = Ethers.utils.keccak256(PermissionlessGenericHandlerInstance.address + depositData.substr(2));

    await TruffleAssert.passes(BridgeInstance.deposit(
        originDomainID,
        resourceID,
        invalidDepositData,
        feeData,
        { from: depositorAddress }
    ));

    // relayer1 executes the proposal
    const executeTx = await BridgeInstance.executeProposal(
        proposal,
        proposalSignedData,
        { from: relayer1Address }
    );

    // check that ProposalExecution event is emitted
    TruffleAssert.eventEmitted(executeTx, 'ProposalExecution', (event) => {
        return event.originDomainID.toNumber() === originDomainID &&
            event.depositNonce.toNumber() === expectedDepositNonce &&
            event.dataHash === depositDataHash
    });

    // check that deposit nonce isn't unmarked as used in bitmap
    assert.isTrue(await BridgeInstance.isProposalExecuted(originDomainID, expectedDepositNonce));

    // Check that asset isn't marked as stored in TestStoreInstance
    assert.isTrue(await TestStoreInstance._assetsStored.call(hashOfTestStore));
  });
});
