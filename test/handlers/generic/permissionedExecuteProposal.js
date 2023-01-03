/**
 * Copyright 2020 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");

const Helpers = require("../../helpers");

const TestStoreContract = artifacts.require("TestStore");
const PermissionedGenericHandlerContract = artifacts.require(
  "PermissionedGenericHandler"
);

contract(
  "PermissionedGenericHandler - [Execute Proposal]",
  async (accounts) => {
    const originDomainID = 1;
    const destinationDomainID = 2;
    const expectedDepositNonce = 1;
    const relayer1Address = accounts[2];
    const relayer2Address = accounts[3];

    const depositorAddress = accounts[1];

    const TestStoreMinCount = 10;
    const hashOfTestStore = Ethers.utils.keccak256("0xc0ffee");
    const feeData = "0x";

    let BridgeInstance;
    let TestStoreInstance;
    let initialDepositFunctionSignatures;
    let initialDepositFunctionDepositorOffsets;
    let initialExecuteFunctionSignatures;
    let PermissionedGenericHandlerInstance;
    let resourceID;
    let depositData;

    let proposal;

    beforeEach(async () => {
      await Promise.all([
        (BridgeInstance = await Helpers.deployBridge(
          destinationDomainID,
          accounts[0]
        )),
        TestStoreContract.new(TestStoreMinCount).then(
          (instance) => (TestStoreInstance = instance)
        ),
      ]);

      const TestStoreFuncSig = Helpers.getFunctionSignature(
        TestStoreInstance,
        "store"
      );

      resourceID = Helpers.createResourceID(
        TestStoreInstance.address,
        originDomainID
      );
      initialResourceIDs = [resourceID];
      initialContractAddresses = [TestStoreInstance.address];
      initialDepositFunctionSignatures = [Helpers.blankFunctionSig];
      initialDepositFunctionDepositorOffsets = [
        Helpers.blankFunctionDepositorOffset,
      ];
      initialExecuteFunctionSignatures = [TestStoreFuncSig];

      PermissionedGenericHandlerInstance =
        await PermissionedGenericHandlerContract.new(BridgeInstance.address);

      const permissionedGenericHandlerSetResourceData =
        Helpers.constructGenericHandlerSetResourceData(
          initialDepositFunctionSignatures[0],
          initialDepositFunctionDepositorOffsets[0],
          initialExecuteFunctionSignatures[0]
        );

      await BridgeInstance.adminSetResource(
        PermissionedGenericHandlerInstance.address,
        resourceID,
        TestStoreInstance.address,
        permissionedGenericHandlerSetResourceData
      );

      depositData =
        Helpers.createPermissionedGenericDepositData(hashOfTestStore);
      depositProposalDataHash = Ethers.utils.keccak256(
        PermissionedGenericHandlerInstance.address + depositData.substr(2)
      );

      proposal = {
        originDomainID: originDomainID,
        depositNonce: expectedDepositNonce,
        data: depositData,
        resourceID: resourceID,
      };

      // set MPC address to unpause the Bridge
      await BridgeInstance.endKeygen(Helpers.mpcAddress);
    });

    it("deposit can be executed successfully", async () => {
      const proposalSignedData = await Helpers.signTypedProposal(
        BridgeInstance.address,
        [proposal]
      );

      await TruffleAssert.passes(
        BridgeInstance.deposit(
          originDomainID,
          resourceID,
          depositData,
          feeData,
          {from: depositorAddress}
        )
      );

      // relayer1 executes the proposal
      await TruffleAssert.passes(
        BridgeInstance.executeProposal(proposal, proposalSignedData, {
          from: relayer1Address,
        })
      );

      // Verifying asset was marked as stored in TestStoreInstance
      assert.isTrue(
        await TestStoreInstance._assetsStored.call(hashOfTestStore)
      );
    });

    it("AssetStored event should be emitted", async () => {
      const proposalSignedData = await Helpers.signTypedProposal(
        BridgeInstance.address,
        [proposal]
      );

      await TruffleAssert.passes(
        BridgeInstance.deposit(
          originDomainID,
          resourceID,
          depositData,
          feeData,
          {from: depositorAddress}
        )
      );

      // relayer1 executes the proposal
      const executeTx = await BridgeInstance.executeProposal(
        proposal,
        proposalSignedData,
        {from: relayer2Address}
      );
      const internalTx = await TruffleAssert.createTransactionResult(
        TestStoreInstance,
        executeTx.tx
      );
      TruffleAssert.eventEmitted(internalTx, "AssetStored", (event) => {
        return event.asset === hashOfTestStore;
      });

      assert.isTrue(
        await TestStoreInstance._assetsStored.call(hashOfTestStore),
        "TestStore asset was not successfully stored"
      );
    });
  }
);
