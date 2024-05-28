// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");
const Helpers = require("../../helpers");

const TestStoreContract = artifacts.require("TestStore");
const TestDepositContract = artifacts.require("TestDeposit");
const GmpHandlerContract = artifacts.require(
  "GmpHandler"
);

contract(
  "GmpHandler - [Execute Proposal]",
  async (accounts) => {
    const originDomainID = 1;
    const destinationDomainID = 2;
    const expectedDepositNonce = 1;

    const depositorAddress = accounts[1];
    const relayer1Address = accounts[2];
    const relayer2Address = accounts[3];
    const invalidExecutionContractAddress = accounts[4];

    const feeData = "0x";
    const destinationMaxFee = 900000;
    const hashOfTestStore = Ethers.utils.keccak256("0xc0ffee");
    const handlerResponseLength = 64;
    const contractCallReturndata = Ethers.constants.HashZero;


    let BridgeInstance;
    let TestStoreInstance;
    let TestDepositInstance;

    let resourceID;
    let depositFunctionSignature;
    let GmpHandlerInstance;
    let depositData;
    let proposal;

    beforeEach(async () => {
      await Promise.all([
        (BridgeInstance = await Helpers.deployBridge(
          destinationDomainID,
          accounts[0]
        )),
        TestStoreContract.new().then(
          (instance) => (TestStoreInstance = instance)
        ),
        TestDepositContract.new().then(
          (instance) => (TestDepositInstance = instance)
        ),
      ]);

      resourceID = Helpers.createResourceID(
        TestStoreInstance.address,
        originDomainID
      );

      GmpHandlerInstance =
        await GmpHandlerContract.new(BridgeInstance.address);

      depositFunctionSignature = Helpers.getFunctionSignature(
        TestStoreInstance,
        "storeWithDepositor"
      );

      const GmpHandlerSetResourceData =
        Helpers.constructGenericHandlerSetResourceData(
          depositFunctionSignature,
          Helpers.blankFunctionDepositorOffset,
          Helpers.blankFunctionSig
        );
      await BridgeInstance.adminSetResource(
        GmpHandlerInstance.address,
        resourceID,
        TestStoreInstance.address,
        GmpHandlerSetResourceData
      );

      depositData = Helpers.createGmpDepositData(
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

    it("ProposalExecution should be emitted even if handler execution fails", async () => {
      const proposalSignedData = await Helpers.signTypedProposal(
        BridgeInstance.address,
        [proposal]
      );
      // execution contract address
      const invalidDepositData = Helpers.createGmpDepositData(
        depositFunctionSignature,
        invalidExecutionContractAddress,
        destinationMaxFee,
        depositorAddress,
        hashOfTestStore
      );

      const depositDataHash = Ethers.utils.keccak256(
        GmpHandlerInstance.address + depositData.substr(2)
      );

      await TruffleAssert.passes(
        BridgeInstance.deposit(
          originDomainID,
          resourceID,
          invalidDepositData,
          feeData,
          {from: depositorAddress}
        )
      );

      // relayer1 executes the proposal
      const executeTx = await BridgeInstance.executeProposal(
        proposal,
        proposalSignedData,
        {from: relayer1Address}
      );

      // check that ProposalExecution event is emitted
      TruffleAssert.eventEmitted(executeTx, "ProposalExecution", (event) => {
        return (
          event.originDomainID.toNumber() === originDomainID &&
          event.depositNonce.toNumber() === expectedDepositNonce &&
          event.dataHash === depositDataHash &&
          event.handlerResponse === Ethers.utils.defaultAbiCoder.encode(
            ["bool", "uint256", "bytes32"],
            [true, handlerResponseLength, contractCallReturndata]
          )
        );
      });

      // check that deposit nonce isn't unmarked as used in bitmap
      assert.isTrue(
        await BridgeInstance.isProposalExecuted(
          originDomainID,
          expectedDepositNonce
        )
      );

      // Check that asset isn't marked as stored in TestStoreInstance
      assert.isTrue(
        await TestStoreInstance._assetsStored.call(hashOfTestStore)
      );
    });

    it("ProposalExecution should be emitted even if gas specified too small", async () => {
      const num = 6;
      const addresses = [BridgeInstance.address, TestStoreInstance.address];
      const message = Ethers.utils.hexlify(Ethers.utils.toUtf8Bytes("message"));
      const executionData = Helpers.abiEncode(["uint", "address[]", "bytes"], [num, addresses, message]);

      // If the target function accepts (address depositor, bytes executionData)
      // then this helper can be used
      const preparedExecutionData = await TestDepositInstance.prepareDepositData(executionData);
      const depositFunctionSignature = Helpers.getFunctionSignature(
        TestDepositInstance,
        "executePacked"
      );
      const tooSmallGas = 500;
      const depositData = Helpers.createGmpDepositData(
        depositFunctionSignature,
        TestDepositInstance.address,
        tooSmallGas,
        depositorAddress,
        preparedExecutionData
      );
      const proposal = {
        originDomainID: originDomainID,
        depositNonce: expectedDepositNonce,
        data: depositData,
        resourceID: resourceID,
      };
      const proposalSignedData = await Helpers.signTypedProposal(
        BridgeInstance.address,
        [proposal]
      );

      // relayer1 executes the proposal
      const executeTx = await BridgeInstance.executeProposal(
        proposal,
        proposalSignedData,
        {from: relayer1Address}
      );
      // check that ProposalExecution event is emitted
      TruffleAssert.eventEmitted(executeTx, "ProposalExecution", (event) => {
        return (
          event.originDomainID.toNumber() === originDomainID &&
          event.depositNonce.toNumber() === expectedDepositNonce
        );
      });

      // check that deposit nonce isn't unmarked as used in bitmap
      assert.isTrue(
        await BridgeInstance.isProposalExecuted(
          originDomainID,
          expectedDepositNonce
        )
      );

      const internalTx = await TruffleAssert.createTransactionResult(
        TestDepositInstance,
        executeTx.tx
      );
      TruffleAssert.eventNotEmitted(internalTx, "TestExecute", (event) => {
        return (
          event.depositor === depositorAddress &&
          event.num.toNumber() === num &&
          event.addr === TestStoreInstance.address &&
          event.message === message
        );
      });
    });

    it("call with packed depositData should be successful", async () => {
      const num = 5;
      const addresses = [BridgeInstance.address, TestStoreInstance.address];
      const message = Ethers.utils.hexlify(Ethers.utils.toUtf8Bytes("message"));
      const executionData = Helpers.abiEncode(["uint", "address[]", "bytes"], [num, addresses, message]);

      // If the target function accepts (address depositor, bytes executionData)
      // then this helper can be used
      const preparedExecutionData = await TestDepositInstance.prepareDepositData(executionData);
      const depositFunctionSignature = Helpers.getFunctionSignature(
        TestDepositInstance,
        "executePacked"
      );
      const depositData = Helpers.createGmpDepositData(
        depositFunctionSignature,
        TestDepositInstance.address,
        destinationMaxFee,
        depositorAddress,
        preparedExecutionData
      );

      const proposal = {
        originDomainID: originDomainID,
        depositNonce: expectedDepositNonce,
        data: depositData,
        resourceID: resourceID,
      };
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
      const executeTx = await BridgeInstance.executeProposal(proposal, proposalSignedData, {
        from: relayer1Address,
      });

      const internalTx = await TruffleAssert.createTransactionResult(
        TestDepositInstance,
        executeTx.tx
      );

      // check that ProposalExecution event is emitted
      TruffleAssert.eventEmitted(executeTx, "ProposalExecution", (event) => {
        return (
          event.originDomainID.toNumber() === originDomainID &&
          event.depositNonce.toNumber() === expectedDepositNonce
        );
      });

      TruffleAssert.eventEmitted(internalTx, "TestExecute", (event) => {
        return (
          event.depositor === depositorAddress &&
          event.num.toNumber() === num &&
          event.addr === TestStoreInstance.address &&
          event.message === message
        );
      });
    });

    it("call with unpacked depositData should be successful", async () => {
      const num = 5;
      const addresses = [BridgeInstance.address, TestStoreInstance.address];
      const message = Ethers.utils.hexlify(Ethers.utils.toUtf8Bytes("message"));

      const executionData = Helpers.createGmpExecutionData(
        ["uint", "address[]", "bytes"], [num, addresses, message]
      );

      const depositFunctionSignature = Helpers.getFunctionSignature(
        TestDepositInstance,
        "executeUnpacked"
      );
      const depositData = Helpers.createGmpDepositData(
        depositFunctionSignature,
        TestDepositInstance.address,
        destinationMaxFee,
        depositorAddress,
        executionData
      );

      const proposal = {
        originDomainID: originDomainID,
        depositNonce: expectedDepositNonce,
        data: depositData,
        resourceID: resourceID,
      };
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
      const executeTx = await BridgeInstance.executeProposal(proposal, proposalSignedData, {
        from: relayer1Address,
      });

      const internalTx = await TruffleAssert.createTransactionResult(
        TestDepositInstance,
        executeTx.tx
      );

      // check that ProposalExecution event is emitted
      TruffleAssert.eventEmitted(executeTx, "ProposalExecution", (event) => {
        return (
          event.originDomainID.toNumber() === originDomainID &&
          event.depositNonce.toNumber() === expectedDepositNonce
        );
      });

      TruffleAssert.eventEmitted(internalTx, "TestExecute", (event) => {
        return (
          event.depositor === depositorAddress &&
          event.num.toNumber() === num &&
          event.addr === TestStoreInstance.address &&
          event.message === message
        );
      });
    });
  }
);
