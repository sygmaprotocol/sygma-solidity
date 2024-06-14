// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");
const Helpers = require("../../helpers");

const TestStoreContract = artifacts.require("TestStore");
const TestDepositContract = artifacts.require("TestDeposit");
const PermissionlessGenericHandlerContract = artifacts.require(
  "PermissionlessGenericHandler"
);
const OriginAdapterContract = artifacts.require("OriginAdapter");
const DestinationAdapterContract = artifacts.require("DestinationAdapter");
const BasicFeeHandlerContract = artifacts.require("BasicFeeHandler");

contract(
  "Destination adapter - [Execute Proposal]",
  async (accounts) => {
    const originDomainID = 1;
    const destinationDomainID = 2;
    const expectedDepositNonce = 1;

    const depositorAddress = accounts[1];
    const relayer1Address = accounts[2];
    const relayer2Address = accounts[3];
    // const invalidExecutionContractAddress = accounts[4];
    const recipientAddress = accounts[4];

    const feeData = "0x";
    const destinationMaxFee = 900000;
    const depositAmount = Ethers.utils.parseEther("1");
    const fee = Ethers.utils.parseEther("0.1");
    const transferredAmount = Ethers.utils.parseEther("0.9");
    const hashOfTestStore = Ethers.utils.keccak256("0xc0ffee");
    const handlerResponseLength = 64;
    const contractCallReturndata = Ethers.constants.HashZero;


    let BridgeInstance;
    let TestStoreInstance;
    let TestDepositInstance;
    let OriginAdapterInstance;
    let DestinationAdapterInstance;
    let BasicFeeHandlerInstance;

    let resourceID;
    let depositFunctionSignature;
    let PermissionlessGenericHandlerInstance;
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
        BasicFeeHandlerContract.new(BridgeInstance.address, BridgeInstance.address).then(
          (instance) => (BasicFeeHandlerInstance = instance)
        )
      ]);

      resourceID = Helpers.createResourceID(
        TestStoreInstance.address,
        originDomainID
      );

      OriginAdapterInstance = await OriginAdapterContract.new(BridgeInstance.address, resourceID);
      DestinationAdapterInstance = await DestinationAdapterContract.new(
        OriginAdapterInstance.address
      );

      PermissionlessGenericHandlerInstance =
        await PermissionlessGenericHandlerContract.new(BridgeInstance.address);

      depositFunctionSignature = Helpers.getFunctionSignature(
        DestinationAdapterInstance,
        "execute"
      );

      const PermissionlessGenericHandlerSetResourceData =
        Helpers.constructGenericHandlerSetResourceData(
          depositFunctionSignature,
          Helpers.blankFunctionDepositorOffset,
          Helpers.blankFunctionSig
        );
      await BridgeInstance.adminSetResource(
        PermissionlessGenericHandlerInstance.address,
        resourceID,
        TestStoreInstance.address,
        PermissionlessGenericHandlerSetResourceData
      );

      await BasicFeeHandlerInstance.changeFee(destinationDomainID, resourceID, fee);
      await BridgeInstance.adminChangeFeeHandler(BasicFeeHandlerInstance.address)

      // depositData = Helpers.createPermissionlessGenericDepositData(
      //   depositFunctionSignature,
      //   DestinationAdapterInstance.address,
      //   destinationMaxFee,
      //   OriginAdapterInstance.address,
      //   transferredAmount
      // );
      const abiCoder = Ethers.utils.defaultAbiCoder;
      const executionData = abiCoder
      .encode(["address", "uint256"], [Ethers.constants.AddressZero, transferredAmount.toString()])
      .substring(66)

      const depositData =
      Ethers.utils.hexZeroPad("0xE7EF0", 32) +
      "0004" +
      depositFunctionSignature.substring(2) +
      "14" +
      DestinationAdapterInstance.address.toLowerCase().substring(2) +
      "14" +
      OriginAdapterInstance.address.toLowerCase().substring(2) +
      executionData

      console.log("depositData-0", depositData);
      console.log("depositData-1", OriginAdapterInstance.address);
      console.log("depositData-2", DestinationAdapterInstance.address);
      console.log("depositData-3", BridgeInstance.address);

      proposal = {
        originDomainID: originDomainID,
        depositNonce: expectedDepositNonce,
        data: depositData,
        resourceID: resourceID,
      };

      // set MPC address to unpause the Bridge
      await BridgeInstance.endKeygen(Helpers.mpcAddress);

      console.log(await web3.eth.sendTransaction({
        from: depositorAddress,
        to: DestinationAdapterInstance.address,
        value: "1000000000000000000"
      }));
    });

    it("deposit can be executed successfully", async () => {
      const proposalSignedData = await Helpers.signTypedProposal(
        BridgeInstance.address,
        [proposal]
      );

      console.log("pero-2", recipientAddress)
      console.log("pero-3", depositorAddress)
      await TruffleAssert.passes(
        OriginAdapterInstance.deposit(
          originDomainID,
          fee,
          DestinationAdapterInstance.address,
          recipientAddress,
          {
            from: depositorAddress,
            value: depositAmount
          }
        )
      );

      // relayer1 executes the proposal
        const executeTx = await BridgeInstance.executeProposal(proposal, proposalSignedData, {
          from: relayer1Address,
        })

      console.log("jesam ga", await web3.eth.getBalance(recipientAddress));
      console.log("jesam ga", await web3.eth.getBalance(DestinationAdapterInstance.address));

      const internalTx = await TruffleAssert.createTransactionResult(
        DestinationAdapterInstance,
        executeTx.tx
      );
      TruffleAssert.eventEmitted(internalTx, "Executed", (event) => {
        return event.amount === transferredAmount;
      });
    });

    // it("Executed event should be emitted", async () => {
    //   const proposalSignedData = await Helpers.signTypedProposal(
    //     BridgeInstance.address,
    //     [proposal]
    //   );

    //   await TruffleAssert.passes(
    //     BridgeInstance.deposit(
    //       originDomainID,
    //       resourceID,
    //       depositData,
    //       feeData,
    //       {from: depositorAddress}
    //     )
    //   );

    //   // relayer1 executes the proposal
    //   const executeTx = await BridgeInstance.executeProposal(
    //     proposal,
    //     proposalSignedData,
    //     {from: relayer2Address}
    //   );

    //   const internalTx = await TruffleAssert.createTransactionResult(
    //     DestinationAdapterInstance,
    //     executeTx.tx
    //   );
    //   TruffleAssert.eventEmitted(internalTx, "Executed", (event) => {
    //     return event.amount === transferredAmount;
    //   });
    // });

    // it("ProposalExecution should be emitted even if handler execution fails", async () => {
    //   const proposalSignedData = await Helpers.signTypedProposal(
    //     BridgeInstance.address,
    //     [proposal]
    //   );
    //   // execution contract address
    //   const invalidDepositData = Helpers.createPermissionlessGenericDepositData(
    //     depositFunctionSignature,
    //     invalidExecutionContractAddress,
    //     destinationMaxFee,
    //     depositorAddress,
    //     hashOfTestStore
    //   );

    //   const depositDataHash = Ethers.utils.keccak256(
    //     PermissionlessGenericHandlerInstance.address + depositData.substr(2)
    //   );

    //   await TruffleAssert.passes(
    //     BridgeInstance.deposit(
    //       originDomainID,
    //       resourceID,
    //       invalidDepositData,
    //       feeData,
    //       {from: depositorAddress}
    //     )
    //   );

    //   // relayer1 executes the proposal
    //   const executeTx = await BridgeInstance.executeProposal(
    //     proposal,
    //     proposalSignedData,
    //     {from: relayer1Address}
    //   );

    //   // check that ProposalExecution event is emitted
    //   TruffleAssert.eventEmitted(executeTx, "ProposalExecution", (event) => {
    //     return (
    //       event.originDomainID.toNumber() === originDomainID &&
    //       event.depositNonce.toNumber() === expectedDepositNonce &&
    //       event.dataHash === depositDataHash &&
    //       event.handlerResponse === Ethers.utils.defaultAbiCoder.encode(
    //         ["bool", "uint256", "bytes32"],
    //         [true, handlerResponseLength, contractCallReturndata]
    //       )
    //     );
    //   });

    //   // check that deposit nonce isn't unmarked as used in bitmap
    //   assert.isTrue(
    //     await BridgeInstance.isProposalExecuted(
    //       originDomainID,
    //       expectedDepositNonce
    //     )
    //   );
    // });

    // it("ProposalExecution should be emitted even if gas specified too small", async () => {
    //   const num = 6;
    //   const addresses = [BridgeInstance.address, TestStoreInstance.address];
    //   const message = Ethers.utils.hexlify(Ethers.utils.toUtf8Bytes("message"));
    //   const executionData = Helpers.abiEncode(["uint", "address[]", "bytes"], [num, addresses, message]);

    //   // If the target function accepts (address depositor, bytes executionData)
    //   // then this helper can be used
    //   const preparedExecutionData = await TestDepositInstance.prepareDepositData(executionData);
    //   const depositFunctionSignature = Helpers.getFunctionSignature(
    //     TestDepositInstance,
    //     "executePacked"
    //   );
    //   const tooSmallGas = 500;
    //   const depositData = Helpers.createPermissionlessGenericDepositData(
    //     depositFunctionSignature,
    //     TestDepositInstance.address,
    //     tooSmallGas,
    //     depositorAddress,
    //     preparedExecutionData
    //   );
    //   const proposal = {
    //     originDomainID: originDomainID,
    //     depositNonce: expectedDepositNonce,
    //     data: depositData,
    //     resourceID: resourceID,
    //   };
    //   const proposalSignedData = await Helpers.signTypedProposal(
    //     BridgeInstance.address,
    //     [proposal]
    //   );

    //   // relayer1 executes the proposal
    //   const executeTx = await BridgeInstance.executeProposal(
    //     proposal,
    //     proposalSignedData,
    //     {from: relayer1Address}
    //   );
    //   // check that ProposalExecution event is emitted
    //   TruffleAssert.eventEmitted(executeTx, "ProposalExecution", (event) => {
    //     return (
    //       event.originDomainID.toNumber() === originDomainID &&
    //       event.depositNonce.toNumber() === expectedDepositNonce
    //     );
    //   });

    //   // check that deposit nonce isn't unmarked as used in bitmap
    //   assert.isTrue(
    //     await BridgeInstance.isProposalExecuted(
    //       originDomainID,
    //       expectedDepositNonce
    //     )
    //   );

    //   const internalTx = await TruffleAssert.createTransactionResult(
    //     TestDepositInstance,
    //     executeTx.tx
    //   );
    //   TruffleAssert.eventNotEmitted(internalTx, "TestExecute", (event) => {
    //     return (
    //       event.depositor === depositorAddress &&
    //       event.num.toNumber() === num &&
    //       event.addr === TestStoreInstance.address &&
    //       event.message === message
    //     );
    //   });
    // });

    // it("call with packed depositData should be successful", async () => {
    //   const num = 5;
    //   const addresses = [BridgeInstance.address, TestStoreInstance.address];
    //   const message = Ethers.utils.hexlify(Ethers.utils.toUtf8Bytes("message"));
    //   const executionData = Helpers.abiEncode(["uint", "address[]", "bytes"], [num, addresses, message]);

    //   // If the target function accepts (address depositor, bytes executionData)
    //   // then this helper can be used
    //   const preparedExecutionData = await TestDepositInstance.prepareDepositData(executionData);
    //   const depositFunctionSignature = Helpers.getFunctionSignature(
    //     TestDepositInstance,
    //     "executePacked"
    //   );
    //   const depositData = Helpers.createPermissionlessGenericDepositData(
    //     depositFunctionSignature,
    //     TestDepositInstance.address,
    //     destinationMaxFee,
    //     depositorAddress,
    //     preparedExecutionData
    //   );

    //   const proposal = {
    //     originDomainID: originDomainID,
    //     depositNonce: expectedDepositNonce,
    //     data: depositData,
    //     resourceID: resourceID,
    //   };
    //   const proposalSignedData = await Helpers.signTypedProposal(
    //     BridgeInstance.address,
    //     [proposal]
    //   );
    //   await TruffleAssert.passes(
    //     BridgeInstance.deposit(
    //       originDomainID,
    //       resourceID,
    //       depositData,
    //       feeData,
    //       {from: depositorAddress}
    //     )
    //   );

    //   // relayer1 executes the proposal
    //   const executeTx = await BridgeInstance.executeProposal(proposal, proposalSignedData, {
    //     from: relayer1Address,
    //   });

    //   const internalTx = await TruffleAssert.createTransactionResult(
    //     TestDepositInstance,
    //     executeTx.tx
    //   );

    //   // check that ProposalExecution event is emitted
    //   TruffleAssert.eventEmitted(executeTx, "ProposalExecution", (event) => {
    //     return (
    //       event.originDomainID.toNumber() === originDomainID &&
    //       event.depositNonce.toNumber() === expectedDepositNonce
    //     );
    //   });

    //   TruffleAssert.eventEmitted(internalTx, "TestExecute", (event) => {
    //     return (
    //       event.depositor === depositorAddress &&
    //       event.num.toNumber() === num &&
    //       event.addr === TestStoreInstance.address &&
    //       event.message === message
    //     );
    //   });
    // });

    // it("call with unpacked depositData should be successful", async () => {
    //   const num = 5;
    //   const addresses = [BridgeInstance.address, TestStoreInstance.address];
    //   const message = Ethers.utils.hexlify(Ethers.utils.toUtf8Bytes("message"));

    //   const executionData = Helpers.createPermissionlessGenericExecutionData(
    //     ["uint", "address[]", "bytes"], [num, addresses, message]
    //   );

    //   const depositFunctionSignature = Helpers.getFunctionSignature(
    //     TestDepositInstance,
    //     "executeUnpacked"
    //   );
    //   const depositData = Helpers.createPermissionlessGenericDepositData(
    //     depositFunctionSignature,
    //     TestDepositInstance.address,
    //     destinationMaxFee,
    //     depositorAddress,
    //     executionData
    //   );

    //   const proposal = {
    //     originDomainID: originDomainID,
    //     depositNonce: expectedDepositNonce,
    //     data: depositData,
    //     resourceID: resourceID,
    //   };
    //   const proposalSignedData = await Helpers.signTypedProposal(
    //     BridgeInstance.address,
    //     [proposal]
    //   );
    //   await TruffleAssert.passes(
    //     BridgeInstance.deposit(
    //       originDomainID,
    //       resourceID,
    //       depositData,
    //       feeData,
    //       {from: depositorAddress}
    //     )
    //   );

    //   // relayer1 executes the proposal
    //   const executeTx = await BridgeInstance.executeProposal(proposal, proposalSignedData, {
    //     from: relayer1Address,
    //   });

    //   const internalTx = await TruffleAssert.createTransactionResult(
    //     TestDepositInstance,
    //     executeTx.tx
    //   );

    //   // check that ProposalExecution event is emitted
    //   TruffleAssert.eventEmitted(executeTx, "ProposalExecution", (event) => {
    //     return (
    //       event.originDomainID.toNumber() === originDomainID &&
    //       event.depositNonce.toNumber() === expectedDepositNonce
    //     );
    //   });

    //   TruffleAssert.eventEmitted(internalTx, "TestExecute", (event) => {
    //     return (
    //       event.depositor === depositorAddress &&
    //       event.num.toNumber() === num &&
    //       event.addr === TestStoreInstance.address &&
    //       event.message === message
    //     );
    //   });
    // });
  }
);
