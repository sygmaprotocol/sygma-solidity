// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");

const Helpers = require("../../../helpers");

const DefaultMessageReceiverContract = artifacts.require("DefaultMessageReceiver");
const NativeTokenHandlerContract = artifacts.require("NativeTokenHandler");
const NativeTokenAdapterContract = artifacts.require("NativeTokenAdapter");
const BasicFeeHandlerContract = artifacts.require("BasicFeeHandler");
const FeeHandlerRouterContract = artifacts.require("FeeHandlerRouter");
const ERC20MintableContract = artifacts.require("ERC20PresetMinterPauser");

contract("Bridge - [decimal conversion - native token]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const adminAddress = accounts[0];
  const depositorAddress = accounts[1];
  const evmRecipientAddress = accounts[2];
  const relayer1Address = accounts[3];

  const expectedDepositNonce = 1;
  const resourceID = "0x0000000000000000000000000000000000000000000000000000000000000650";
  const originDecimalPlaces = 8;
  const depositAmount = Ethers.utils.parseUnits("1", originDecimalPlaces);
  const fee = Ethers.utils.parseUnits("0.1", originDecimalPlaces);
  const transferredAmount = depositAmount.sub(fee);
  const convertedTransferAmount = Ethers.utils.parseEther("0.9");
  const transactionId = "0x0000000000000000000000000000000000000000000000000000000000000001";
  const executionGasAmount = 30000000;


  const AbiCoder = new Ethers.utils.AbiCoder();
  const expectedHandlerResponse = AbiCoder.encode(
    ["uint256"],
    [convertedTransferAmount]
  );

  let BridgeInstance;
  let DefaultMessageReceiverInstance;
  let NativeTokenHandlerInstance;
  let BasicFeeHandlerInstance;
  let FeeHandlerRouterInstance;
  let NativeTokenAdapterInstance;
  let depositProposalData;
  let ERC20MintableInstance;


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
    DefaultMessageReceiverInstance = await DefaultMessageReceiverContract.new([], 100000);
    NativeTokenHandlerInstance = await NativeTokenHandlerContract.new(
      BridgeInstance.address,
      NativeTokenAdapterInstance.address,
      DefaultMessageReceiverInstance.address,
    );
    ERC20MintableInstance = await ERC20MintableContract.new(
      "token",
      "TOK"
    );

    await BridgeInstance.adminSetResource(
        NativeTokenHandlerInstance.address,
        resourceID,
        Ethers.constants.AddressZero,
        originDecimalPlaces
      );
    await BasicFeeHandlerInstance.changeFee(destinationDomainID, resourceID, fee);
    await BridgeInstance.adminChangeFeeHandler(FeeHandlerRouterInstance.address);
    await FeeHandlerRouterInstance.adminSetResourceHandler(
      destinationDomainID,
      resourceID,
      BasicFeeHandlerInstance.address
    );

    await DefaultMessageReceiverInstance.grantRole(
      await DefaultMessageReceiverInstance.SYGMA_HANDLER_ROLE(),
      NativeTokenHandlerInstance.address
    );

    await ERC20MintableInstance.grantRole(
      await ERC20MintableInstance.MINTER_ROLE(),
      DefaultMessageReceiverInstance.address
    );

    const mintableERC20Iface = new Ethers.utils.Interface(["function mint(address to, uint256 amount)"]);
    const actions = [{
      nativeValue: 0,
      callTo: ERC20MintableInstance.address,
      approveTo: DefaultMessageReceiverInstance.address,
      tokenSend: ERC20MintableInstance.address,
      tokenReceive: Ethers.constants.AddressZero,
      data: mintableERC20Iface.encodeFunctionData("mint", [evmRecipientAddress, "20"]),
    }]
    message = Helpers.createMessageCallData(
      transactionId,
      actions,
      evmRecipientAddress
    );

    depositProposalData = Helpers.createOptionalContractCallDepositData(
      transferredAmount,
      Ethers.constants.AddressZero,
      executionGasAmount,
      message
    );

    proposal = {
      originDomainID: originDomainID,
      depositNonce: expectedDepositNonce,
      resourceID: resourceID,
      data: depositProposalData
    };

    // send ETH to destination adapter for transfers
    await web3.eth.sendTransaction({
      from: depositorAddress,
      to: NativeTokenHandlerInstance.address,
      value: "1000000000000000000"
    })

    // set MPC address to unpause the Bridge
    await BridgeInstance.endKeygen(Helpers.mpcAddress);
  });

  it("[sanity] decimals value is set if args are provided to 'adminSetResource'", async () => {
    const NativeTokenDecimals = (await NativeTokenHandlerInstance._tokenContractAddressToTokenProperties.call(
      Ethers.constants.AddressZero
    )).decimals;

    assert.strictEqual(NativeTokenDecimals.isSet, true);
    assert.strictEqual(NativeTokenDecimals["externalDecimals"], "8");
  });

  it("Deposit converts sent token amount with 8 decimals to 18 decimal places", async () => {
    const depositTx = await NativeTokenAdapterInstance.depositToEVMWithMessage(
      destinationDomainID,
      Ethers.constants.AddressZero,
      executionGasAmount,
      message,
      {
        from: depositorAddress,
        value: depositAmount
      }
    );

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
        event.data === depositProposalData &&
        event.handlerResponse === expectedHandlerResponse
      );
    });
  });

  it("Proposal execution converts sent token amount with 18 decimals to 8 decimal places", async () => {
    const expectedRecipientTransferAmount = Ethers.utils.parseUnits("0.9", originDecimalPlaces);
    const proposalData = Helpers.createOptionalContractCallDepositData(
      convertedTransferAmount, // 18 decimals
      Ethers.constants.AddressZero,
      executionGasAmount,
      message
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
      {
        from: relayer1Address,
        gas: executionGasAmount
      }
    );

    const internalHandlerTx = await TruffleAssert.createTransactionResult(
      NativeTokenHandlerInstance,
      proposalTx.tx
    );
    TruffleAssert.eventEmitted(internalHandlerTx, "FundsTransferred", (event) => {
      return (
        event.amount.toNumber() === expectedRecipientTransferAmount.toNumber()
      );
    });

    TruffleAssert.eventEmitted(proposalTx, "ProposalExecution", (event) => {
      return (
        event.originDomainID.toNumber() === originDomainID &&
        event.depositNonce.toNumber() === expectedDepositNonce &&
        event.dataHash === dataHash &&
        event.handlerResponse === Ethers.utils.defaultAbiCoder.encode(
          ["address", "address", "uint256"],
          [Ethers.constants.AddressZero, DefaultMessageReceiverInstance.address, convertedTransferAmount]
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
