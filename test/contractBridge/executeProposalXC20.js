/**
 * Copyright 2020 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");

const Helpers = require("../helpers");

const XC20TestContract = artifacts.require("XC20Test");
const XC20TestContractMock = artifacts.require("XC20TestMock");
const XC20HandlerContract = artifacts.require("XC20Handler");

contract("Bridge - [execute proposal - XC20]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;

  const adminAddress = accounts[0];
  const depositorAddress = accounts[1];
  const recipientAddress = accounts[2];
  const relayer1Address = accounts[3];

  const initialTokenAmount = 100;
  const depositAmount = 10;
  const expectedDepositNonce = 1;
  const feeData = "0x";
  const emptySetResourceData = "0x";

  let BridgeInstance;
  let XC20TestInstance;
  let XC20TestMockInstance;
  let XC20HandlerInstance;

  let resourceID1;
  let resourceID2;
  let depositData;
  let depositProposalData;

  let data = "";
  let dataHash = "";
  let proposal;

  beforeEach(async () => {
    await Promise.all([
      (BridgeInstance = await Helpers.deployBridge(
        destinationDomainID,
        adminAddress
      )),
      XC20TestContract.new().then(
        (instance) => (XC20TestInstance = instance)
      ),
      XC20TestContractMock.new().then(
        (instance) => (XC20TestMockInstance = instance)
      )
    ]);

    await Promise.all([
      resourceID1 = Helpers.createResourceID(
        XC20TestInstance.address,
        destinationDomainID
      ),
      resourceID2 = Helpers.createResourceID(
        XC20TestMockInstance.address,
        destinationDomainID
      )
    ]);

    initialResourceIDs = [resourceID1, resourceID2];
    initialContractAddresses = [XC20TestInstance.address];
    burnableContractAddresses = [];

    XC20HandlerInstance = await XC20HandlerContract.new(BridgeInstance.address);

    await Promise.all([
      BridgeInstance.adminSetResource(
        XC20HandlerInstance.address,
        initialResourceIDs[0],
        XC20TestInstance.address,
        emptySetResourceData
      ),
      XC20TestInstance.mint(
        depositorAddress,
        initialTokenAmount
      ),
      BridgeInstance.adminSetResource(
        XC20HandlerInstance.address,
        initialResourceIDs[1],
        XC20TestMockInstance.address,
        emptySetResourceData
      ),
      XC20TestMockInstance.mint(
        depositorAddress,
        initialTokenAmount
      ),
    ]);

    await BridgeInstance.adminSetBurnable(
      XC20HandlerInstance.address,
      XC20TestInstance.address
    );

    await BridgeInstance.adminSetBurnable(
      XC20HandlerInstance.address,
      XC20TestMockInstance.address
    );

    data = Helpers.createERCDepositData(depositAmount, 20, recipientAddress);
    dataHash = Ethers.utils.keccak256(
      XC20HandlerInstance.address + data.substr(2)
    );

    await XC20TestInstance.approve(XC20HandlerInstance.address, depositAmount, {
      from: depositorAddress,
    });

    depositData = Helpers.createERCDepositData(
      depositAmount,
      20,
      recipientAddress
    );
    depositProposalData = Helpers.createERCDepositData(
      depositAmount,
      20,
      recipientAddress
    );
    depositProposalDataHash = Ethers.utils.keccak256(
      XC20HandlerInstance.address + depositProposalData.substr(2)
    );

    proposal = {
      originDomainID: originDomainID,
      depositNonce: expectedDepositNonce,
      resourceID: initialResourceIDs[0],
      data: depositProposalData,
    };

    // set MPC address to unpause the Bridge
    await BridgeInstance.endKeygen(Helpers.mpcAddress);

  });

  describe("lock/release strategy", async () => {
    it("isProposalExecuted returns false if depositNonce is not used", async () => {
      const destinationDomainID = await BridgeInstance._domainID();

      assert.isFalse(
        await BridgeInstance.isProposalExecuted(
          destinationDomainID,
          expectedDepositNonce
        )
      );
    });

    it("should create and execute executeProposal successfully", async () => {
      const proposalSignedData = await Helpers.signTypedProposal(
        BridgeInstance.address,
        [proposal]
      );

      // depositorAddress makes initial deposit of depositAmount
      assert.isFalse(await BridgeInstance.paused());
      await TruffleAssert.passes(
        BridgeInstance.deposit(
          originDomainID,
          initialResourceIDs[0],
          depositData,
          feeData,
          {from: depositorAddress}
        )
      );

      await TruffleAssert.passes(
        BridgeInstance.executeProposal(proposal, proposalSignedData, {
          from: relayer1Address,
        })
      );

      // check that deposit nonce has been marked as used in bitmap
      assert.isTrue(
        await BridgeInstance.isProposalExecuted(
          originDomainID,
          expectedDepositNonce
        )
      );

      // check that tokens are transferred to recipient address
      const recipientBalance = await XC20TestInstance.balanceOf(
        recipientAddress
      );
      assert.strictEqual(recipientBalance.toNumber(), depositAmount);
    });

    it("should skip executing proposal if deposit nonce is already used", async () => {
      const proposalSignedData = await Helpers.signTypedProposal(
        BridgeInstance.address,
        [proposal]
      );

      // depositorAddress makes initial deposit of depositAmount
      assert.isFalse(await BridgeInstance.paused());
      await TruffleAssert.passes(
        BridgeInstance.deposit(
          originDomainID,
          initialResourceIDs[0],
          depositData,
          feeData,
          {from: depositorAddress}
        )
      );

      await TruffleAssert.passes(
        BridgeInstance.executeProposal(proposal, proposalSignedData, {
          from: relayer1Address,
        })
      );

      const skipExecuteTx = await BridgeInstance.executeProposal(
        proposal,
        proposalSignedData,
        {from: relayer1Address}
      );

      // check that no ProposalExecution events are emitted
      assert.equal(skipExecuteTx.logs.length, 0);
    });

    it("executeProposal event should be emitted with expected values", async () => {
      const proposalSignedData = await Helpers.signTypedProposal(
        BridgeInstance.address,
        [proposal]
      );

      // depositorAddress makes initial deposit of depositAmount
      assert.isFalse(await BridgeInstance.paused());
      await TruffleAssert.passes(
        BridgeInstance.deposit(
          originDomainID,
          initialResourceIDs[0],
          depositData,
          feeData,
          {from: depositorAddress}
        )
      );

      const proposalTx = await BridgeInstance.executeProposal(
        proposal,
        proposalSignedData,
        {from: relayer1Address}
      );

      TruffleAssert.eventEmitted(proposalTx, "ProposalExecution", (event) => {
        return (
          event.originDomainID.toNumber() === originDomainID &&
          event.depositNonce.toNumber() === expectedDepositNonce &&
          event.dataHash === dataHash
        );
      });

      // check that deposit nonce has been marked as used in bitmap
      assert.isTrue(
        await BridgeInstance.isProposalExecuted(
          originDomainID,
          expectedDepositNonce
        )
      );

      // check that tokens are transferred to recipient address
      const recipientBalance = await XC20TestInstance.balanceOf(
        recipientAddress
      );
      assert.strictEqual(recipientBalance.toNumber(), depositAmount);
    });

    it(`should fail to executeProposal if signed Proposal has
        different chainID than the one on which it should be executed`, async () => {
      const proposalSignedData =
        await Helpers.mockSignTypedProposalWithInvalidChainID(
          BridgeInstance.address,
          [proposal]
        );

      // depositorAddress makes initial deposit of depositAmount
      assert.isFalse(await BridgeInstance.paused());
      await TruffleAssert.passes(
        BridgeInstance.deposit(
          originDomainID,
          initialResourceIDs[0],
          depositData,
          feeData,
          {from: depositorAddress}
        )
      );

      await TruffleAssert.reverts(
        BridgeInstance.executeProposal(proposal, proposalSignedData, {
          from: relayer1Address,
        }),
        "Invalid proposal signer"
      );
    });
  });

  describe("mint/burn strategy", async () => {
    beforeEach(async () => {
      await BridgeInstance.adminSetBurnable(
        XC20HandlerInstance.address,
        XC20TestInstance.address
      );
    });

    it("isProposalExecuted returns false if depositNonce is not used", async () => {
      const destinationDomainID = await BridgeInstance._domainID();

      assert.isFalse(
        await BridgeInstance.isProposalExecuted(
          destinationDomainID,
          expectedDepositNonce
        )
      );
    });

    it("should create and execute executeProposal successfully", async () => {
      const proposalSignedData = await Helpers.signTypedProposal(
        BridgeInstance.address,
        [proposal]
      );

      // depositorAddress makes initial deposit of depositAmount
      assert.isFalse(await BridgeInstance.paused());
      await TruffleAssert.passes(
        BridgeInstance.deposit(
          originDomainID,
          initialResourceIDs[0],
          depositData,
          feeData,
          {from: depositorAddress}
        )
      );

      await TruffleAssert.passes(
        BridgeInstance.executeProposal(proposal, proposalSignedData, {
          from: relayer1Address,
        })
      );

      // check that deposit nonce has been marked as used in bitmap
      assert.isTrue(
        await BridgeInstance.isProposalExecuted(
          originDomainID,
          expectedDepositNonce
        )
      );

      // check that tokens are transferred to recipient address
      const recipientBalance = await XC20TestInstance.balanceOf(
        recipientAddress
      );
      assert.strictEqual(recipientBalance.toNumber(), depositAmount);
    });

    it("should skip executing proposal if deposit nonce is already used", async () => {
      const proposalSignedData = await Helpers.signTypedProposal(
        BridgeInstance.address,
        [proposal]
      );

      // depositorAddress makes initial deposit of depositAmount
      assert.isFalse(await BridgeInstance.paused());
      await TruffleAssert.passes(
        BridgeInstance.deposit(
          originDomainID,
          initialResourceIDs[0],
          depositData,
          feeData,
          {from: depositorAddress}
        )
      );

      await TruffleAssert.passes(
        BridgeInstance.executeProposal(proposal, proposalSignedData, {
          from: relayer1Address,
        })
      );

      const skipExecuteTx = await BridgeInstance.executeProposal(
        proposal,
        proposalSignedData,
        {from: relayer1Address}
      );

      // check that no ProposalExecution events are emitted
      assert.equal(skipExecuteTx.logs.length, 0);
    });

    it("executeProposal event should be emitted with expected values", async () => {
      const proposalSignedData = await Helpers.signTypedProposal(
        BridgeInstance.address,
        [proposal]
      );

      // depositorAddress makes initial deposit of depositAmount
      assert.isFalse(await BridgeInstance.paused());
      await TruffleAssert.passes(
        BridgeInstance.deposit(
          originDomainID,
          initialResourceIDs[0],
          depositData,
          feeData,
          {from: depositorAddress}
        )
      );

      const proposalTx = await BridgeInstance.executeProposal(
        proposal,
        proposalSignedData,
        {from: relayer1Address}
      );

      TruffleAssert.eventEmitted(proposalTx, "ProposalExecution", (event) => {
        return (
          event.originDomainID.toNumber() === originDomainID &&
          event.depositNonce.toNumber() === expectedDepositNonce &&
          event.dataHash === dataHash
        );
      });

      // check that deposit nonce has been marked as used in bitmap
      assert.isTrue(
        await BridgeInstance.isProposalExecuted(
          originDomainID,
          expectedDepositNonce
        )
      );

      // check that tokens are transferred to recipient address
      const recipientBalance = await XC20TestInstance.balanceOf(
        recipientAddress
      );
      assert.strictEqual(recipientBalance.toNumber(), depositAmount);
    });

    it(`should fail to executeProposal if signed Proposal
        has different chainID than the one on which it should be executed`, async () => {
      const proposalSignedData =
        await Helpers.mockSignTypedProposalWithInvalidChainID(
          BridgeInstance.address,
          [proposal]
        );

      // depositorAddress makes initial deposit of depositAmount
      assert.isFalse(await BridgeInstance.paused());
      await TruffleAssert.passes(
        BridgeInstance.deposit(
          originDomainID,
          initialResourceIDs[0],
          depositData,
          feeData,
          {from: depositorAddress}
        )
      );

      await TruffleAssert.reverts(
        BridgeInstance.executeProposal(proposal, proposalSignedData, {
          from: relayer1Address,
        }),
        "Invalid proposal signer"
      );
    });

    it(`transfer event should be emitted with expected values when executing proposal -
        mint to handler and then transfer to recipient`, async () => {
      const proposalSignedData = await Helpers.signTypedProposal(
        BridgeInstance.address,
        [proposal]
      );

      // depositorAddress makes initial deposit of depositAmount
      assert.isFalse(await BridgeInstance.paused());
      await TruffleAssert.passes(
        BridgeInstance.deposit(
          originDomainID,
          initialResourceIDs[0],
          depositData,
          feeData,
          {from: depositorAddress}
        )
      );

      const proposalTx = await BridgeInstance.executeProposal(
        proposal,
        proposalSignedData,
        {from: relayer1Address}
      );

      TruffleAssert.eventEmitted(proposalTx, "ProposalExecution", (event) => {
        return (
          event.originDomainID.toNumber() === originDomainID &&
          event.depositNonce.toNumber() === expectedDepositNonce &&
          event.dataHash === dataHash
        );
      });

      const internalTx = await TruffleAssert.createTransactionResult(
        XC20TestInstance,
        proposalTx.tx
      );

      // check that tokens are minted to handler
      TruffleAssert.eventEmitted(internalTx, "Transfer", (event) => {
        return (
          event.from === Ethers.constants.AddressZero &&
          event.to === XC20HandlerInstance.address &&
          event.value.toNumber() === depositAmount
        );
      });

      // check that tokens are transferred from handler to recipient
      TruffleAssert.eventEmitted(internalTx, "Transfer", (event) => {
        return (
          event.from === XC20HandlerInstance.address &&
          event.to === recipientAddress &&
          event.value.toNumber() === depositAmount
        );
      });

      // check that deposit nonce has been marked as used in bitmap
      assert.isTrue(
        await BridgeInstance.isProposalExecuted(
          originDomainID,
          expectedDepositNonce
        )
      );

      // check that tokens are transferred to recipient address
      const recipientBalance = await XC20TestInstance.balanceOf(recipientAddress);
      assert.strictEqual(recipientBalance.toNumber(), depositAmount);
    });

    it("executeProposal should revert if transferring tokens from XC20Safe to recipient fails", async () => {
      const failingProposal = {
        originDomainID: originDomainID,
        depositNonce: expectedDepositNonce,
        resourceID: initialResourceIDs[1],
        data: depositData,
      };

      const proposalSignedData = await Helpers.signTypedProposal(
        BridgeInstance.address,
        [failingProposal]
      );

      await BridgeInstance.deposit(
        originDomainID,
        initialResourceIDs[1],
        depositData,
        feeData,
        {from: depositorAddress}
      );

      const depositProposalBeforeFailedExecute =
        await BridgeInstance.isProposalExecuted(
          originDomainID,
          expectedDepositNonce
        );

      // depositNonce is not used
      assert.isFalse(depositProposalBeforeFailedExecute);

      // recipient balance before proposal execution is 0
      const recipientBalanceBeforeFailedExecute = await XC20TestMockInstance.balanceOf(recipientAddress);
      assert.strictEqual(
        recipientBalanceBeforeFailedExecute.toNumber(),
        0
      );

      const executeTx = await BridgeInstance.executeProposal(
        failingProposal,
        proposalSignedData,
        {from: relayer1Address}
      );

      TruffleAssert.eventEmitted(executeTx, "FailedHandlerExecution", (event) => {
        return (
          event.originDomainID.toNumber() === originDomainID &&
          event.depositNonce.toNumber() === expectedDepositNonce &&
          Ethers.utils.toUtf8String(
            // slice from handler response bytes containing the revert reason
            "0x" + event.lowLevelData.slice(138, 226)
          ) === "XC20: failed to transfer tokens to recipient"
        );
      });

      const recipientBalanceAfterFailedExecute = await XC20TestMockInstance.balanceOf(recipientAddress);
      assert.strictEqual(
        recipientBalanceAfterFailedExecute.toNumber(),
        0
      );

      // recipient balance after proposal execution hasn't changed
      const depositProposalAfterFailedExecute =
        await BridgeInstance.isProposalExecuted(
          originDomainID,
          expectedDepositNonce
        );

      // depositNonce is not used
      assert.isFalse(depositProposalAfterFailedExecute);
    });
  });
});
