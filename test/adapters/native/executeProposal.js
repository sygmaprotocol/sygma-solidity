// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");

const Helpers = require("../../helpers");

const NativeTokenHandlerContract = artifacts.require("NativeTokenHandler");
const NativeTokenAdapterContract = artifacts.require("NativeTokenAdapter");
const BasicFeeHandlerContract = artifacts.require("BasicFeeHandler");
const FeeHandlerRouterContract = artifacts.require("FeeHandlerRouter");

contract("Bridge - [execute proposal - native token]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const adminAddress = accounts[0];
  const depositorAddress = accounts[1];
  const recipientAddress = accounts[2];
  const relayer1Address = accounts[3];

  const expectedDepositNonce = 1;
  const emptySetResourceData = "0x";
  const resourceID = "0x0000000000000000000000000000000000000000000000000000000000000650";
  const btcRecipientAddress = "bc1qs0fcdq73vgurej48yhtupzcv83un2p5qhsje7n";
  const depositAmount = Ethers.utils.parseEther("1");
  const fee = Ethers.utils.parseEther("0.1");
  const transferredAmount = depositAmount.sub(fee);

  let BridgeInstance;
  let NativeTokenHandlerInstance;
  let BasicFeeHandlerInstance;
  let FeeHandlerRouterInstance;
  let NativeTokenAdapterInstance;
  let proposal;
  let depositProposalData;
  let dataHash;

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
    NativeTokenAdapterInstance = await NativeTokenAdapterContract.new(
      BridgeInstance.address,
      resourceID
    );
    NativeTokenHandlerInstance = await NativeTokenHandlerContract.new(
      BridgeInstance.address,
      NativeTokenAdapterInstance.address,
    );

    await BridgeInstance.adminSetResource(
        NativeTokenHandlerInstance.address,
        resourceID,
        NativeTokenHandlerInstance.address,
        emptySetResourceData
      );
    await BasicFeeHandlerInstance.changeFee(destinationDomainID, resourceID, fee);
    await BridgeInstance.adminChangeFeeHandler(FeeHandlerRouterInstance.address),
    await FeeHandlerRouterInstance.adminSetResourceHandler(
      originDomainID,
      resourceID,
      BasicFeeHandlerInstance.address
    ),

    depositProposalData = Helpers.createERCDepositData(
      transferredAmount,
      20,
      recipientAddress
    );

    proposal = {
      originDomainID: originDomainID,
      depositNonce: expectedDepositNonce,
      resourceID: resourceID,
      data: depositProposalData,
    };

    dataHash = Ethers.utils.keccak256(
      NativeTokenHandlerInstance.address + depositProposalData.substr(2)
    );


    // set MPC address to unpause the Bridge
    await BridgeInstance.endKeygen(Helpers.mpcAddress);

    // send ETH to destination adapter for transfers
    await web3.eth.sendTransaction({
      from: depositorAddress,
      to: NativeTokenHandlerInstance.address,
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

    // depositorAddress makes initial deposit of depositAmount
    assert.isFalse(await BridgeInstance.paused());
    await TruffleAssert.passes(
      NativeTokenAdapterInstance.deposit(originDomainID, btcRecipientAddress, {
        from: depositorAddress,
        value: depositAmount
      })
    );

    const recipientBalanceBefore = await web3.eth.getBalance(recipientAddress);

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
    const recipientBalanceAfter = await web3.eth.getBalance(recipientAddress);
    assert.strictEqual(transferredAmount.add(recipientBalanceBefore).toString(), recipientBalanceAfter);
  });

  it("should skip executing proposal if deposit nonce is already used", async () => {
    const proposalSignedData = await Helpers.signTypedProposal(
      BridgeInstance.address,
      [proposal]
    );

    // depositorAddress makes initial deposit of depositAmount
    assert.isFalse(await BridgeInstance.paused());
    await TruffleAssert.passes(
      NativeTokenAdapterInstance.deposit(originDomainID, btcRecipientAddress, {
        from: depositorAddress,
        value: depositAmount
      })
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
      NativeTokenAdapterInstance.deposit(originDomainID, btcRecipientAddress, {
        from: depositorAddress,
        value: depositAmount
      })
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
          ["address", "address", "uint256"],
          [NativeTokenHandlerInstance.address, recipientAddress, transferredAmount]
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


    // check that tokens are transferred to recipient address
    const recipientBalanceAfter = await web3.eth.getBalance(recipientAddress);
    assert.strictEqual(transferredAmount.add(recipientBalanceBefore).toString(), recipientBalanceAfter);
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
      NativeTokenAdapterInstance.deposit(originDomainID, btcRecipientAddress, {
        from: depositorAddress,
        value: depositAmount
      })
    );

    await Helpers.expectToRevertWithCustomError(
      BridgeInstance.executeProposal(proposal, proposalSignedData, {
        from: relayer1Address,
      }),
      "InvalidProposalSigner()"
    );
  });
});
