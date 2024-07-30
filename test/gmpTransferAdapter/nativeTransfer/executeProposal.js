// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");

const Helpers = require("../../helpers");

const GmpTransferAdapterContract = artifacts.require("GmpTransferAdapter");
const GmpHandlerContract = artifacts.require(
  "GmpHandler"
);
const BasicFeeHandlerContract = artifacts.require("BasicFeeHandler");
const FeeHandlerRouterContract = artifacts.require("FeeHandlerRouter");
const XERC20FactoryContract = artifacts.require("XERC20Factory");
const XERC20Contract = artifacts.require("XERC20");
const XERC20LockboxContract = artifacts.require("XERC20Lockbox");

contract("Gmp transfer adapter - [Execute proposal - native token]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const adminAddress = accounts[0];
  const depositorAddress = accounts[1];
  const recipientAddress = accounts[2];
  const relayer1Address = accounts[3];

  const expectedDepositNonce = 1;
  const handlerResponseLength = 64;
  const contractCallReturndata = Ethers.constants.HashZero;
  const destinationMaxFee = 900000;
  const resourceID = "0x0000000000000000000000000000000000000000000000000000000000000650";
  const depositAmount = 10;
  const fee = Ethers.utils.parseEther("0.1");
  const transferredAmount = 10
  const mintingLimit = 500;
  const burningLimit = 500;

  let BridgeInstance;
  let BasicFeeHandlerInstance;
  let FeeHandlerRouterInstance;
  let XERC20Instance;
  let XERC20LockboxInstance;
  let proposal;
  let dataHash;
  let depositFunctionSignature;


  beforeEach(async () => {
    await Promise.all([
      (BridgeInstance = await Helpers.deployBridge(
        destinationDomainID,
        adminAddress
      )),
    ]);


    FeeHandlerRouterInstance = await FeeHandlerRouterContract.new(
      BridgeInstance.address
    );
    BasicFeeHandlerInstance = await BasicFeeHandlerContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );

    await BasicFeeHandlerInstance.changeFee(destinationDomainID, resourceID, fee);
    await BridgeInstance.adminChangeFeeHandler(FeeHandlerRouterInstance.address),
    await FeeHandlerRouterInstance.adminSetResourceHandler(
      originDomainID,
      resourceID,
      BasicFeeHandlerInstance.address
    );

    GmpHandlerInstance = await GmpHandlerContract.new(BridgeInstance.address);
    GmpTransferAdapterInstance = await GmpTransferAdapterContract.new(
      BridgeInstance.address,
      GmpHandlerInstance.address,
      resourceID,
    );

    XERC20FactoryInstance = await XERC20FactoryContract.new();
    const response = await XERC20FactoryInstance.deployXERC20(
      "sygmaETH",
      "sETH",
      [mintingLimit],
      [burningLimit],
      [GmpTransferAdapterInstance.address]
    );
    // set XERC20 contract instance address to the address deployed via XERC20Factory
    const deployedXERC20Address = response.logs[0].args._xerc20
    XERC20Instance = await XERC20Contract.at(deployedXERC20Address)
    const lockboxDeployResponse = await XERC20FactoryInstance.deployLockbox(
      XERC20Instance.address,
      Ethers.constants.AddressZero,
      true
    );
    // set Lockbox contract instance address to the address deployed via XERC20Factory
    const lockboxAddress = lockboxDeployResponse.logs[0].args._lockbox
    XERC20LockboxInstance = await XERC20LockboxContract.at(lockboxAddress);

    await XERC20LockboxInstance.depositNativeTo(
      depositorAddress,
      {
        value: depositAmount
      }
    );
    await XERC20Instance.increaseAllowance(
      GmpTransferAdapterInstance.address,
      depositAmount,
      {
        from: depositorAddress
      }
    );

    depositFunctionSignature = Helpers.getFunctionSignature(
      GmpTransferAdapterInstance,
      "executeProposal"
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
      GmpHandlerInstance.address,
      GmpHandlerSetResourceData
    );

    const preparedExecutionData = await GmpTransferAdapterInstance.prepareDepositData(
      recipientAddress,
      XERC20Instance.address,
      transferredAmount
    );
    depositData = Helpers.createGmpDepositData(
      depositFunctionSignature,
      GmpTransferAdapterInstance.address,
      destinationMaxFee,
      GmpTransferAdapterInstance.address,
      preparedExecutionData
    );

    proposal = {
      originDomainID: originDomainID,
      depositNonce: expectedDepositNonce,
      resourceID: resourceID,
      data: depositData,
    };

    dataHash = Ethers.utils.keccak256(
      GmpHandlerInstance.address + depositData.substr(2)
    );


    // set MPC address to unpause the Bridge
    await BridgeInstance.endKeygen(Helpers.mpcAddress);

    // send ETH to destination adapter for transfers
    await web3.eth.sendTransaction({
      from: depositorAddress,
      to: GmpTransferAdapterInstance.address,
      value: "1000000000000000000"
    })
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

    const recipientNativeBalanceBefore = await web3.eth.getBalance(recipientAddress);
    const depositorXERC20BalanceBefore = await XERC20Instance.balanceOf(depositorAddress);
    const recipientXERC20BalanceBefore = await XERC20Instance.balanceOf(recipientAddress);

    // depositorAddress makes initial deposit of depositAmount
    assert.isFalse(await BridgeInstance.paused());
    await TruffleAssert.passes(
      GmpTransferAdapterInstance.deposit(
        originDomainID,
        recipientAddress,
        XERC20Instance.address,
        depositAmount,
        {
          from: depositorAddress,
          value: fee
        }
      )
    );

    await BridgeInstance.executeProposal(proposal, proposalSignedData, {
      from: relayer1Address,
    });

    const depositorXERC20BalanceAfter = await XERC20Instance.balanceOf(depositorAddress);
    const recipientXERC20BalanceAfter = await XERC20Instance.balanceOf(recipientAddress);

    // check that deposit nonce has been marked as used in bitmap
    assert.isTrue(
      await BridgeInstance.isProposalExecuted(
        originDomainID,
        expectedDepositNonce
      )
    );

    // check that depositor and recipient balances are aligned with expectations
    const recipientNativeBalanceAfter = await web3.eth.getBalance(recipientAddress);
    assert.strictEqual(recipientNativeBalanceBefore, recipientNativeBalanceAfter);
    assert.strictEqual(
      Ethers.BigNumber.from(depositAmount).sub(depositorXERC20BalanceBefore.toString()).toString(),
      depositorXERC20BalanceAfter.toString()
    );
    assert.strictEqual(
      Ethers.BigNumber.from(depositAmount).add(recipientXERC20BalanceBefore.toString()).toString(),
      recipientXERC20BalanceAfter.toString()
    );
    assert.strictEqual(
      Ethers.BigNumber.from(depositAmount).add(recipientXERC20BalanceBefore.toString()).toString(),
      recipientXERC20BalanceAfter.toString()
    );
  });

  it("should skip executing proposal if deposit nonce is already used", async () => {
    const proposalSignedData = await Helpers.signTypedProposal(
      BridgeInstance.address,
      [proposal]
    );

    // depositorAddress makes initial deposit of depositAmount
    assert.isFalse(await BridgeInstance.paused());
    await TruffleAssert.passes(
      GmpTransferAdapterInstance.deposit(
        originDomainID,
        recipientAddress,
        XERC20Instance.address,
        depositAmount,
        {
          from: depositorAddress,
          value: fee
        }
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
      GmpTransferAdapterInstance.deposit(
        originDomainID,
        recipientAddress,
        XERC20Instance.address,
        depositAmount,
        {
          from: depositorAddress,
          value: fee
        }
      )
    );

    const recipientBalanceBefore = await web3.eth.getBalance(recipientAddress);

    const proposalTx = await BridgeInstance.executeProposal(
      proposal,
      proposalSignedData,
      {from: relayer1Address}
    );

    TruffleAssert.eventEmitted(proposalTx, "ProposalExecution", (event) => {
      return (
        event.originDomainID.toNumber() === originDomainID &&
        event.depositNonce.toNumber() === expectedDepositNonce &&
        event.dataHash === dataHash &&
        event.handlerResponse === Ethers.utils.defaultAbiCoder.encode(
          ["bool", "uint256", "bytes32"],
          [true, handlerResponseLength, contractCallReturndata]
        )
      );
    });

    // check that deposit nonce has been marked as used in bitmap
    assert.isTrue(
      await BridgeInstance.isProposalExecuted(
        originDomainID,
        expectedDepositNonce
      )
    );


    // check that recipient native token balance hasn't changed
    const recipientBalanceAfter = await web3.eth.getBalance(recipientAddress);
    assert.strictEqual(recipientBalanceBefore, recipientBalanceAfter);
  });

  it(`should fail to executeProposal if signed Proposal has different
    chainID than the one on which it should be executed`, async () => {
    const proposalSignedData =
      await Helpers.mockSignTypedProposalWithInvalidChainID(
        BridgeInstance.address,
        [proposal]
      );

    // depositorAddress makes initial deposit of depositAmount
    assert.isFalse(await BridgeInstance.paused());
    await TruffleAssert.passes(
      GmpTransferAdapterInstance.deposit(
        originDomainID,
        recipientAddress,
        XERC20Instance.address,
        depositAmount,
        {
          from: depositorAddress,
          value: fee
        }
      )
    );

    await Helpers.expectToRevertWithCustomError(
      BridgeInstance.executeProposal(proposal, proposalSignedData, {
        from: relayer1Address,
      }),
      "InvalidProposalSigner()"
    );
  });
});
