// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");

const Helpers = require("../../helpers");

const NativeTokenHandlerContract = artifacts.require("NativeTokenHandler");
const NativeTokenAdapterContract = artifacts.require("NativeTokenAdapter");
const BasicFeeHandlerContract = artifacts.require("BasicFeeHandler");
const FeeHandlerRouterContract = artifacts.require("FeeHandlerRouter");

contract("Bridge - [decimal conversion - native token]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const adminAddress = accounts[0];
  const depositorAddress = accounts[1];
  const evmRecipientAddress = accounts[2];
  const relayer1Address = accounts[3];

  const expectedDepositNonce = 1;
  const resourceID = "0x0000000000000000000000000000000000000000000000000000000000000650";
  const btcRecipientAddress = "bc1qs0fcdq73vgurej48yhtupzcv83un2p5qhsje7n";
  const originDecimalPlaces = 8;
  const depositAmount = Ethers.utils.parseUnits("1", originDecimalPlaces);
  const fee = Ethers.utils.parseUnits("0.1", originDecimalPlaces);
  const transferredAmount = depositAmount.sub(fee);
  const convertedTransferAmount = Ethers.utils.parseEther("0.9");

  const AbiCoder = new Ethers.utils.AbiCoder();
  const expectedDepositData = Helpers.createBtcDepositData(transferredAmount, btcRecipientAddress);
  const expectedHandlerResponse = AbiCoder.encode(
    ["uint256"],
    [convertedTransferAmount]
  );

  let BridgeInstance;
  let NativeTokenHandlerInstance;
  let BasicFeeHandlerInstance;
  let FeeHandlerRouterInstance;
  let NativeTokenAdapterInstance;
  let depositProposalData;

  beforeEach(async () => {
    await Promise.all([
      (BridgeInstance = await Helpers.deployBridge(
        originDomainID,
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
        originDecimalPlaces
      );
    await BasicFeeHandlerInstance.changeFee(destinationDomainID, resourceID, fee);
    await BridgeInstance.adminChangeFeeHandler(FeeHandlerRouterInstance.address);
    await FeeHandlerRouterInstance.adminSetResourceHandler(
      destinationDomainID,
      resourceID,
      BasicFeeHandlerInstance.address
    ),

    depositProposalData = Helpers.createERCDepositData(
      transferredAmount,
      20,
      btcRecipientAddress
    );

    proposal = {
      originDomainID: originDomainID,
      depositNonce: expectedDepositNonce,
      resourceID: resourceID,
      data: depositProposalData,
    };

    // set MPC address to unpause the Bridge
    await BridgeInstance.endKeygen(Helpers.mpcAddress);

    // send ETH to destination adapter for transfers
    await web3.eth.sendTransaction({
      from: depositorAddress,
      to: NativeTokenHandlerInstance.address,
      value: "1000000000000000000"
    })
  });


  it("[sanity] decimals value is set if args are provided to 'adminSetResource'", async () => {
    const NativeTokenDecimals = (await NativeTokenHandlerInstance._tokenContractAddressToTokenProperties.call(
      NativeTokenHandlerInstance.address
    )).decimals;

    assert.strictEqual(NativeTokenDecimals.isSet, true);
    assert.strictEqual(NativeTokenDecimals["externalDecimals"], "8");
  });

  it("Deposit converts sent token amount with 8 decimals to 18 decimal places", async () => {
    const depositTx = await NativeTokenAdapterInstance.deposit(destinationDomainID, btcRecipientAddress, {
      from: depositorAddress,
      value: depositAmount
    })

    await TruffleAssert.passes(depositTx);

    const internalTx = await TruffleAssert.createTransactionResult(
      BridgeInstance,
      depositTx.tx
    );

    TruffleAssert.eventEmitted(internalTx, "Deposit", (event) => {
      return (
        event.destinationDomainID.toNumber() === destinationDomainID &&
        event.resourceID === resourceID.toLowerCase() &&
        event.depositNonce.toNumber() === expectedDepositNonce &&
        event.user === NativeTokenAdapterInstance.address &&
        event.data === expectedDepositData &&
        event.handlerResponse === expectedHandlerResponse
      );
    });
  });

  it("Proposal execution converts sent token amount with 18 decimals to 8 decimal places", async () => {
    const expectedRecipientTransferAmount = Ethers.utils.parseUnits("0.9", originDecimalPlaces);
    const proposalData = Helpers.createERCDepositData(
      convertedTransferAmount, // 18 decimals
      20,
      evmRecipientAddress
    );

    const dataHash = Ethers.utils.keccak256(
      NativeTokenHandlerInstance.address + proposalData.substr(2)
    );

    const proposal = {
      originDomainID: originDomainID,
      depositNonce: expectedDepositNonce,
      resourceID: resourceID,
      data: proposalData,
    };

    const proposalSignedData = await Helpers.signTypedProposal(
      BridgeInstance.address,
      [proposal]
    );

    const recipientBalanceBefore = await web3.eth.getBalance(evmRecipientAddress);

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
          [NativeTokenHandlerInstance.address, evmRecipientAddress, expectedRecipientTransferAmount]
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
    const recipientBalanceAfter = await web3.eth.getBalance(evmRecipientAddress);
    assert.strictEqual(transferredAmount.add(recipientBalanceBefore).toString(), recipientBalanceAfter);
  });
});
