// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");

const Helpers = require("../../../helpers");

const DefaultMessageReceiverContract = artifacts.require("DefaultMessageReceiver");
const ERC20HandlerContract = artifacts.require("ERC20Handler");
const PercentageFeeHandlerContract = artifacts.require("PercentageERC20FeeHandler");
const FeeHandlerRouterContract = artifacts.require("FeeHandlerRouter");
const ERC20MintableContract = artifacts.require("ERC20PresetMinterPauser");
const ERC721MintableContract = artifacts.require("ERC721MinterBurnerPauser");


contract("Bridge - [decimal conversion - erc20 token]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const adminAddress = accounts[0];
  const depositorAddress = accounts[1];
  const evmRecipientAddress = accounts[2];
  const relayer1Address = accounts[3];
  const returnBytesLength = 128;

  const expectedDepositNonce = 1;
  const resourceID = "0x0000000000000000000000000000000000000000000000000000000000000650";
  const originDecimalPlaces = 8;
  const bridgeDefaultDecimalPlaces = 18;
  const initialTokenAmount = Ethers.utils.parseUnits("100", originDecimalPlaces);
  const depositAmount = Ethers.utils.parseUnits("10", originDecimalPlaces);
  const fee = 100000; // BPS
  const feeAmount = Ethers.utils.parseUnits("1", originDecimalPlaces);
  const convertedTransferAmount = Ethers.utils.parseUnits("10", bridgeDefaultDecimalPlaces);
  const transactionId = "0x0000000000000000000000000000000000000000000000000000000000000001";
  const executionGasAmount = 30000000;
  const amountToMint = 1;
  const feeData = "0x";

  const AbiCoder = new Ethers.utils.AbiCoder();
  const expectedHandlerResponse = AbiCoder.encode(
    ["uint256"],
    [convertedTransferAmount]
  );

  let BridgeInstance;
  let DefaultMessageReceiverInstance;
  let ERC20HandlerInstance;
  let PercentageFeeHandlerInstance;
  let FeeHandlerRouterInstance;
  let depositProposalData;
  let ERC20MintableInstance;
  let ERC721MintableInstance;


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
    PercentageFeeHandlerInstance = await PercentageFeeHandlerContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );
    DefaultMessageReceiverInstance = await DefaultMessageReceiverContract.new([], 100000);
    ERC20HandlerInstance = await ERC20HandlerContract.new(
      BridgeInstance.address,
      DefaultMessageReceiverInstance.address,
    );
    ERC20MintableInstance = await ERC20MintableContract.new(
      "token",
      "TOK"
    );
    ERC721MintableInstance = await ERC721MintableContract.new("token721", "TOK721", "")
    await ERC20MintableInstance.mint(depositorAddress, initialTokenAmount);
    await ERC20MintableInstance.mint(ERC20HandlerInstance.address, initialTokenAmount);

    await BridgeInstance.adminSetResource(
        ERC20HandlerInstance.address,
        resourceID,
        ERC20MintableInstance.address,
        originDecimalPlaces
      );
    await BridgeInstance.adminSetBurnable(
      ERC20HandlerInstance.address,
      ERC20MintableInstance.address
    );
    await PercentageFeeHandlerInstance.changeFee(destinationDomainID, resourceID, fee);
    await BridgeInstance.adminChangeFeeHandler(FeeHandlerRouterInstance.address);
    await FeeHandlerRouterInstance.adminSetResourceHandler(
      destinationDomainID,
      resourceID,
      PercentageFeeHandlerInstance.address
    );

    await DefaultMessageReceiverInstance.grantRole(
      await DefaultMessageReceiverInstance.SYGMA_HANDLER_ROLE(),
      ERC20HandlerInstance.address
    );

    await ERC721MintableInstance.grantRole(
      await ERC721MintableInstance.MINTER_ROLE(),
      DefaultMessageReceiverInstance.address
    );

    await ERC20MintableInstance.grantRole(
      await ERC20MintableInstance.MINTER_ROLE(),
      DefaultMessageReceiverInstance.address
    );

    await ERC20MintableInstance.grantRole(
      await ERC20MintableInstance.MINTER_ROLE(),
      ERC20HandlerInstance.address
    );

    await ERC20MintableInstance.approve(
      PercentageFeeHandlerInstance.address,
      feeAmount,
      {from: depositorAddress}
    );
    await ERC20MintableInstance.approve(
      ERC20HandlerInstance.address,
      depositAmount,
      {from: depositorAddress}
    );

    const mintableERC721Iface = new Ethers.utils.Interface(
      ["function mint(address to, uint256 tokenId, string memory _data)"]
    );
    const actions = [{
      nativeValue: 0,
      callTo: ERC721MintableInstance.address,
      approveTo: Ethers.constants.AddressZero,
      tokenSend: Ethers.constants.AddressZero,
      tokenReceive: Ethers.constants.AddressZero,
      data: mintableERC721Iface.encodeFunctionData("mint", [evmRecipientAddress, "5", ""]),
    }]
    message = Helpers.createMessageCallData(
      transactionId,
      actions,
      evmRecipientAddress
    );

    depositProposalData = Helpers.createOptionalContractCallDepositData(
      depositAmount,
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

    // set MPC address to unpause the Bridge
    await BridgeInstance.endKeygen(Helpers.mpcAddress);
  });


  it("[sanity] decimals value is set if args are provided to 'adminSetResource'", async () => {
    const ERC20Decimals = (await ERC20HandlerInstance._tokenContractAddressToTokenProperties.call(
      ERC20MintableInstance.address
    )).decimals;

    assert.strictEqual(ERC20Decimals.isSet, true);
    assert.strictEqual(ERC20Decimals["externalDecimals"], "8");
  });

  it("Deposit converts sent token amount with 8 decimals to 18 decimal places", async () => {
    const depositTx = await BridgeInstance.deposit(
      destinationDomainID,
      resourceID,
      depositProposalData,
      feeData,
      {
        from: depositorAddress,
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
        event.user === depositorAddress &&
        event.data === depositProposalData &&
        event.handlerResponse === expectedHandlerResponse
      );
    });
  });

  it("Proposal execution converts sent token amount with 18 decimals to 8 decimal places", async () => {
    const proposalData = Helpers.createOptionalContractCallDepositData(
      convertedTransferAmount, // 18 decimals
      Ethers.constants.AddressZero,
      executionGasAmount,
      message
    );

    const dataHash = Ethers.utils.keccak256(
      ERC20HandlerInstance.address + proposalData.substr(2)
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

    const recipientBalanceBefore = await ERC721MintableInstance.balanceOf(evmRecipientAddress);

    const proposalTx = await BridgeInstance.executeProposal(
      proposal,
      proposalSignedData,
      {
        from: relayer1Address,
        gas: executionGasAmount
      }
    );

    TruffleAssert.eventEmitted(proposalTx, "ProposalExecution", (event) => {
      return (
        event.originDomainID.toNumber() === originDomainID &&
        event.depositNonce.toNumber() === expectedDepositNonce &&
        event.dataHash === dataHash &&
        event.handlerResponse === Ethers.utils.defaultAbiCoder.encode(
          ["address", "address", "uint256", "uint16", "uint256"],
          [
            ERC20MintableInstance.address,
            DefaultMessageReceiverInstance.address,
            convertedTransferAmount,
            returnBytesLength,
            0
          ]
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

    // check that ERC721 token is transferred to recipient address
    const recipientBalanceAfter = await ERC721MintableInstance.balanceOf(evmRecipientAddress);
    assert.strictEqual(new Ethers.BigNumber.from(amountToMint).add(
      Number(recipientBalanceBefore)).toString(),
      recipientBalanceAfter.toString()
    );
  });
});
