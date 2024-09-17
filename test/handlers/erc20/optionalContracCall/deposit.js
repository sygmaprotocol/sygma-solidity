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


contract("Bridge - [deposit - erc20 token with contract call]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const adminAddress = accounts[0];
  const depositorAddress = accounts[1];
  const evmRecipientAddress = accounts[2];

  const expectedDepositNonce = 1;
  const emptySetResourceData = "0x";
  const resourceID = "0x0000000000000000000000000000000000000000000000000000000000000650";
  const initialTokenAmount = 100;
  const depositAmount = 10;
  const fee = 1;
  const transactionId = "0x0000000000000000000000000000000000000000000000000000000000000001";
  const executionGasAmount = 30000000;
  const feeData = "0x";

  let BridgeInstance;
  let DefaultMessageReceiverInstance;
  let ERC20HandlerInstance;
  let PercentageFeeHandlerInstance;
  let FeeHandlerRouterInstance;
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

    await BridgeInstance.adminSetResource(
        ERC20HandlerInstance.address,
        resourceID,
        ERC20MintableInstance.address,
        emptySetResourceData
      );

      await ERC20MintableInstance.approve(
        ERC20HandlerInstance.address,
        depositAmount,
        {from: depositorAddress}
      );

    await PercentageFeeHandlerInstance.changeFee(destinationDomainID, resourceID, fee);
    await BridgeInstance.adminChangeFeeHandler(FeeHandlerRouterInstance.address),
    await FeeHandlerRouterInstance.adminSetResourceHandler(
      destinationDomainID,
      resourceID,
      PercentageFeeHandlerInstance.address
    ),

    await ERC20MintableInstance.grantRole(
      await ERC20MintableInstance.MINTER_ROLE(),
      DefaultMessageReceiverInstance.address
    );

    await ERC20MintableInstance.approve(
      ERC20HandlerInstance.address,
      depositAmount,
      {from: depositorAddress}
    );

    // eslint-disable-next-line max-len
    const mintableERC721Iface = new Ethers.utils.Interface(["function mint(address to, uint256 tokenId, string memory _data)"]);
    const actions = [{
      nativeValue: 0,
      callTo: ERC721MintableInstance.address,
      approveTo: DefaultMessageReceiverInstance.address,
      tokenSend: ERC721MintableInstance.address,
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

  it("Native token deposit to EVM with message can be made", async () => {
    await TruffleAssert.passes(
      await BridgeInstance.deposit(
        destinationDomainID,
        resourceID,
        depositProposalData,
        feeData,
        {
          from: depositorAddress,
        }
      )
    );
  });

  it("_depositCounts should be increments from 0 to 1", async () => {
    await BridgeInstance.deposit(
      destinationDomainID,
      resourceID,
      depositProposalData,
      feeData,
      {
        from: depositorAddress,
      }
    );

    const depositCount = await BridgeInstance._depositCounts.call(
      destinationDomainID
    );
    assert.strictEqual(depositCount.toNumber(), expectedDepositNonce);
  });

  it("Deposit event is fired with expected value", async () => {
    const depositTx = await BridgeInstance.deposit(
      destinationDomainID,
      resourceID,
      depositProposalData,
      feeData,
      {
        from: depositorAddress,
      }
    );

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
        event.data === depositProposalData.toLowerCase() &&
        event.handlerResponse === null
      );
    });
  });

  it("Should revert if destination domain is current bridge domain", async () => {
    await Helpers.reverts(
      BridgeInstance.deposit(
        originDomainID,
        resourceID,
        depositProposalData,
        feeData, {
          from: depositorAddress,
        }
      )
    );
  });
});
