// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");
const Helpers = require("../../helpers");

const ERC20MintableContract = artifacts.require("ERC20PresetMinterPauser");
const PermissionlessGenericHandlerContract = artifacts.require(
  "PermissionlessGenericHandler"
);
const SocialAdapterContract = artifacts.require("SocialNetworkAdapter");
const SocialNetworkPercentageFeeHandlerContract = artifacts.require("SocialNetworkPercentageFeeHandler");
const SocialNetworkControllerMockContract = artifacts.require("SocialNetworkControllerMock");

contract(
  "PermissionlessGenericHandler - Social network - [Execute Proposal]",
  async (accounts) => {
    const originDomainID = 1;
    const destinationDomainID = 2;
    const expectedDepositNonce = 1;

    const ethDepositorAddress = accounts[1];
    const relayer1Address = accounts[2];

    const destinationMaxFee = 900000;


    let BridgeInstance;
    let SocialNetworkAdapterInstance;
    let SocialNetworkControllerMockInstance;

    let resourceID;
    let depositFunctionSignature;
    let PermissionlessGenericHandlerInstance;
    let SocialNetworkPercentageFeeHandlerInstance;
    let ERC20MintableInstance;

    beforeEach(async () => {
      await Promise.all([
        (BridgeInstance = await Helpers.deployBridge(
          destinationDomainID,
          accounts[0]
        )),
        (ERC20MintableInstance = ERC20MintableContract.new(
          "ERC20Token",
          "ERC20TOK"
        ).then((instance) => (ERC20MintableInstance = instance))),
      ]);

      resourceID = "0x0000000000000000000000000000000000000000000000000000000000000000"

      PermissionlessGenericHandlerInstance =
        await PermissionlessGenericHandlerContract.new(BridgeInstance.address);

        SocialNetworkPercentageFeeHandlerInstance = await SocialNetworkPercentageFeeHandlerContract.new(
          ERC20MintableInstance.address
        );

      SocialNetworkControllerMockInstance = await SocialNetworkControllerMockContract.new();
      SocialNetworkAdapterInstance = await SocialAdapterContract.new(
        PermissionlessGenericHandlerInstance.address,
          SocialNetworkPercentageFeeHandlerInstance.address,
          SocialNetworkControllerMockInstance.address,
        );

      depositFunctionSignature = Helpers.getFunctionSignature(
        SocialNetworkAdapterInstance,
        "stakeBTC"
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
        SocialNetworkAdapterInstance.address,
        PermissionlessGenericHandlerSetResourceData
      );

      // set MPC address to unpause the Bridge
      await BridgeInstance.endKeygen(Helpers.mpcAddress);
    });

    it("call with packed depositData should be successful", async () => {
      const depositAmount = 5;
      const btcDepositorAddress = "btcDepositorAddress"
      const executionData = Helpers.abiEncode(["uint", "string"], [depositAmount, btcDepositorAddress]);

      // this mocks prepareDepositData helper function from origin adapter
      // this logic is now on implemented on relayers
      const preparedExecutionData =
        "0x" +
        Helpers.abiEncode(
          ["address", "bytes"], [Ethers.constants.AddressZero, executionData]
        ).slice(66);

      const depositFunctionSignature = Helpers.getFunctionSignature(
        SocialNetworkAdapterInstance,
        "stakeBTC"
      );
      const depositData = Helpers.createPermissionlessGenericDepositData(
        depositFunctionSignature,
        SocialNetworkAdapterInstance.address,
        destinationMaxFee,
        ethDepositorAddress,
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
      const executeTx = await BridgeInstance.executeProposal(proposal, proposalSignedData, {
        from: relayer1Address,
      });

      const internalTx = await TruffleAssert.createTransactionResult(
        SocialNetworkControllerMockInstance,
        executeTx.tx
      );

      // check that ProposalExecution event is emitted
      TruffleAssert.eventEmitted(executeTx, "ProposalExecution", (event) => {
        return (
          event.originDomainID.toNumber() === originDomainID &&
          event.depositNonce.toNumber() === expectedDepositNonce
        );
      });

      // check that TestExecute event is emitted
      TruffleAssert.eventEmitted(internalTx, "Stake", (event) => {
        return (
          event.user === ethDepositorAddress &&
          // this is for Social network internal logic
          // 36900 Social Network Bitcoin (HEART) for every Bitcoin (SAT) deposited
          event.amount.toNumber() === depositAmount * 369
        );
      });

      // check that amount is mapped to belonging address
      assert.equal(
        await SocialNetworkAdapterInstance._btcToEthDepositorToStakedAmount.call(
          btcDepositorAddress,
          ethDepositorAddress
        ),
        depositAmount
      )
    });
  }
);
