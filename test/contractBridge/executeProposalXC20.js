/**
 * Copyright 2020 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */

const TruffleAssert = require('truffle-assertions');
const Ethers = require('ethers');

const Helpers = require('../helpers');

const BridgeContract = artifacts.require("Bridge");
const XC20TestContract = artifacts.require("XC20Test");
const XC20HandlerContract = artifacts.require("XC20Handler");



contract('Bridge - [execute proposal - XC20]', async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const invalidDestinationDomainID = 3;

  const adminAddress = accounts[0]
  const depositorAddress = accounts[1];
  const recipientAddress = accounts[2];
  const relayer1Address = accounts[3];


  const initialTokenAmount = 100;
  const depositAmount = 10;
  const expectedDepositNonce = 1;
  const feeData = '0x';

  let BridgeInstance;
  let XC20TestInstance;
  let XC20HandlerInstance;

  let resourceID;
  let depositData;
  let depositProposalData;
  let depositProposalDataHash;

  let data = '';
  let dataHash = '';
  let proposal;

  beforeEach(async () => {
      await Promise.all([
          BridgeInstance = await Helpers.deployBridge(destinationDomainID, adminAddress),
          XC20TestContract.new().then(instance => OriginXC20TestInstance = instance)
        ]);

      await XC20TestContract.new().then(instance => XC20TestInstance = instance),

      resourceID = Helpers.createResourceID(XC20TestInstance.address, destinationDomainID);

      initialResourceIDs = [resourceID];
      initialContractAddresses = [XC20TestInstance.address];
      burnableContractAddresses = [];

      XC20HandlerInstance = await XC20HandlerContract.new(BridgeInstance.address);

      await Promise.all([
        BridgeInstance.adminSetResource(XC20HandlerInstance.address, resourceID, XC20TestInstance.address),
        XC20TestInstance.mint(depositorAddress, initialTokenAmount),
        // XC20TestInstance.mint(XC20HandlerInstance.address, initialTokenAmount),
      ]);
      await XC20TestInstance.approve(XC20TestInstance.address, initialTokenAmount, {from: depositorAddress});

      data = Helpers.createERCDepositData(
        depositAmount,
        20,
        recipientAddress);
      dataHash = Ethers.utils.keccak256(XC20HandlerInstance.address + data.substr(2));

      await XC20TestInstance.approve(XC20HandlerInstance.address, depositAmount, { from: depositorAddress });

      depositData = Helpers.createERCDepositData(depositAmount, 20, recipientAddress);
      depositProposalData = Helpers.createERCDepositData(depositAmount, 20, recipientAddress)
      depositProposalDataHash = Ethers.utils.keccak256(XC20HandlerInstance.address + depositProposalData.substr(2));

      proposal = {
        originDomainID: originDomainID,
        depositNonce: expectedDepositNonce,
        resourceID: resourceID,
        data: depositProposalData
      };

      // set MPC address to unpause the Bridge
      await BridgeInstance.endKeygen(Helpers.mpcAddress);
  });

  describe('lock/release strategy', async () => {
    it("isProposalExecuted returns false if depositNonce is not used", async () => {
        const destinationDomainID = await BridgeInstance._domainID();

        assert.isFalse(await BridgeInstance.isProposalExecuted(destinationDomainID, expectedDepositNonce));
      });

      it('should create and execute executeProposal successfully', async () => {
        const proposalSignedData = await Helpers.signTypedProposal(BridgeInstance.address, [proposal]);

        // depositorAddress makes initial deposit of depositAmount
        assert.isFalse(await BridgeInstance.paused());
        await TruffleAssert.passes(BridgeInstance.deposit(
            originDomainID,
            resourceID,
            depositData,
            feeData,
            { from: depositorAddress }
        ));

        await TruffleAssert.passes(BridgeInstance.executeProposal(
          proposal,
          proposalSignedData,
          { from: relayer1Address }
        ));

        // check that deposit nonce has been marked as used in bitmap
        assert.isTrue(await BridgeInstance.isProposalExecuted(originDomainID, expectedDepositNonce));

        // check that tokens are transferred to recipient address
        const recipientBalance = await XC20TestInstance.balanceOf(recipientAddress);
        assert.strictEqual(recipientBalance.toNumber(), depositAmount);
    });

    it('should skip executing proposal if deposit nonce is already used', async () => {
      const proposalSignedData = await Helpers.signTypedProposal(BridgeInstance.address, [proposal]);

      // depositorAddress makes initial deposit of depositAmount
      assert.isFalse(await BridgeInstance.paused());
      await TruffleAssert.passes(BridgeInstance.deposit(
          originDomainID,
          resourceID,
          depositData,
          feeData,
          { from: depositorAddress }
      ));

      await TruffleAssert.passes(BridgeInstance.executeProposal(
        proposal,
        proposalSignedData,
        { from: relayer1Address }
    ));

      const skipExecuteTx = await BridgeInstance.executeProposal(
        proposal,
        proposalSignedData,
        { from: relayer1Address }
        );

        // check that no ProposalExecution events are emitted
        assert.equal(skipExecuteTx.logs.length, 0);
    });

    it('executeProposal event should be emitted with expected values', async () => {
        const proposalSignedData = await Helpers.signTypedProposal(BridgeInstance.address, [proposal]);

        // depositorAddress makes initial deposit of depositAmount
        assert.isFalse(await BridgeInstance.paused());
        await TruffleAssert.passes(BridgeInstance.deposit(
            originDomainID,
            resourceID,
            depositData,
            feeData,
            { from: depositorAddress }
        ));

        const proposalTx = await BridgeInstance.executeProposal(
          proposal,
          proposalSignedData,
          { from: relayer1Address }
      );

        TruffleAssert.eventEmitted(proposalTx, 'ProposalExecution', (event) => {
            return event.originDomainID.toNumber() === originDomainID &&
                event.depositNonce.toNumber() === expectedDepositNonce &&
                event.dataHash === dataHash
        });

        // check that deposit nonce has been marked as used in bitmap
        assert.isTrue(await BridgeInstance.isProposalExecuted(originDomainID, expectedDepositNonce));

        // check that tokens are transferred to recipient address
        const recipientBalance = await XC20TestInstance.balanceOf(recipientAddress);
        assert.strictEqual(recipientBalance.toNumber(), depositAmount);
    });

    it('should fail to executeProposal if signed Proposal has different chainID than the one on which it should be executed', async () => {
        const proposalSignedData = await Helpers.mockSignTypedProposalWithInvalidChainID(BridgeInstance.address, [proposal]);

        // depositorAddress makes initial deposit of depositAmount
        assert.isFalse(await BridgeInstance.paused());
        await TruffleAssert.passes(BridgeInstance.deposit(
            originDomainID,
            resourceID,
            depositData,
            feeData,
            { from: depositorAddress }
        ));

        await TruffleAssert.reverts(BridgeInstance.executeProposal(
          proposal,
          proposalSignedData,
          { from: relayer1Address }
      ), "Invalid proposal signer");
    });
  });

  describe('mint/burn strategy', async () => {
    it("isProposalExecuted returns false if depositNonce is not used", async () => {
        const destinationDomainID = await BridgeInstance._domainID();

        assert.isFalse(await BridgeInstance.isProposalExecuted(destinationDomainID, expectedDepositNonce));
      });

      it('should create and execute executeProposal successfully', async () => {
        const proposalSignedData = await Helpers.signTypedProposal(BridgeInstance.address, [proposal]);

        // depositorAddress makes initial deposit of depositAmount
        assert.isFalse(await BridgeInstance.paused());
        await TruffleAssert.passes(BridgeInstance.deposit(
            originDomainID,
            resourceID,
            depositData,
            feeData,
            { from: depositorAddress }
        ));

        await TruffleAssert.passes(BridgeInstance.executeProposal(
          proposal,
          proposalSignedData,
          { from: relayer1Address }
        ));

        // check that deposit nonce has been marked as used in bitmap
        assert.isTrue(await BridgeInstance.isProposalExecuted(originDomainID, expectedDepositNonce));

        // check that tokens are transferred to recipient address
        const recipientBalance = await XC20TestInstance.balanceOf(recipientAddress);
        assert.strictEqual(recipientBalance.toNumber(), depositAmount);
    });

    it('should skip executing proposal if deposit nonce is already used', async () => {
      const proposalSignedData = await Helpers.signTypedProposal(BridgeInstance.address, [proposal]);

      // depositorAddress makes initial deposit of depositAmount
      assert.isFalse(await BridgeInstance.paused());
      await TruffleAssert.passes(BridgeInstance.deposit(
          originDomainID,
          resourceID,
          depositData,
          feeData,
          { from: depositorAddress }
      ));

      await TruffleAssert.passes(BridgeInstance.executeProposal(
        proposal,
        proposalSignedData,
        { from: relayer1Address }
    ));

      const skipExecuteTx = await BridgeInstance.executeProposal(
        proposal,
        proposalSignedData,
        { from: relayer1Address }
        );

        // check that no ProposalExecution events are emitted
        assert.equal(skipExecuteTx.logs.length, 0);
    });

    it('executeProposal event should be emitted with expected values', async () => {
        const proposalSignedData = await Helpers.signTypedProposal(BridgeInstance.address, [proposal]);

        // depositorAddress makes initial deposit of depositAmount
        assert.isFalse(await BridgeInstance.paused());
        await TruffleAssert.passes(BridgeInstance.deposit(
            originDomainID,
            resourceID,
            depositData,
            feeData,
            { from: depositorAddress }
        ));

        const proposalTx = await BridgeInstance.executeProposal(
          proposal,
          proposalSignedData,
          { from: relayer1Address }
      );

        TruffleAssert.eventEmitted(proposalTx, 'ProposalExecution', (event) => {
            return event.originDomainID.toNumber() === originDomainID &&
                event.depositNonce.toNumber() === expectedDepositNonce &&
                event.dataHash === dataHash
        });

        // check that deposit nonce has been marked as used in bitmap
        assert.isTrue(await BridgeInstance.isProposalExecuted(originDomainID, expectedDepositNonce));

        // check that tokens are transferred to recipient address
        const recipientBalance = await XC20TestInstance.balanceOf(recipientAddress);
        assert.strictEqual(recipientBalance.toNumber(), depositAmount);
    });

    it('should fail to executeProposal if signed Proposal has different chainID than the one on which it should be executed', async () => {
        const proposalSignedData = await Helpers.mockSignTypedProposalWithInvalidChainID(BridgeInstance.address, [proposal]);

        // depositorAddress makes initial deposit of depositAmount
        assert.isFalse(await BridgeInstance.paused());
        await TruffleAssert.passes(BridgeInstance.deposit(
            originDomainID,
            resourceID,
            depositData,
            feeData,
            { from: depositorAddress }
        ));

        await TruffleAssert.reverts(BridgeInstance.executeProposal(
          proposal,
          proposalSignedData,
          { from: relayer1Address }
      ), "Invalid proposal signer");
    });
  });
});
