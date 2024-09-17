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


contract("Bridge - [deposit - native token]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const adminAddress = accounts[0];
  const depositorAddress = accounts[1];
  const evmRecipientAddress = accounts[2];

  const expectedDepositNonce = 1;
  const emptySetResourceData = "0x";
  const resourceID = "0x0000000000000000000000000000000000000000000000000000000000000650";
  const btcRecipientAddress = "bc1qs0fcdq73vgurej48yhtupzcv83un2p5qhsje7n";
  const depositAmount = Ethers.utils.parseEther("1");
  const fee = Ethers.utils.parseEther("0.1");
  const transferredAmount = depositAmount.sub(fee);
  const transactionId = "0x0000000000000000000000000000000000000000000000000000000000000001";
  const executionGasAmount = 30000000;

  let BridgeInstance;
  let DefaultMessageReceiverInstance;
  let NativeTokenHandlerInstance;
  let BasicFeeHandlerInstance;
  let FeeHandlerRouterInstance;
  let NativeTokenAdapterInstance;
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
        NativeTokenHandlerInstance.address,
        emptySetResourceData
      );
    await BasicFeeHandlerInstance.changeFee(destinationDomainID, resourceID, fee);
    await BridgeInstance.adminChangeFeeHandler(FeeHandlerRouterInstance.address),
    await FeeHandlerRouterInstance.adminSetResourceHandler(
      destinationDomainID,
      resourceID,
      BasicFeeHandlerInstance.address
    ),

    // set MPC address to unpause the Bridge
    await BridgeInstance.endKeygen(Helpers.mpcAddress);
  });

  it("Native token deposit can be made", async () => {
    await TruffleAssert.passes(
      await NativeTokenAdapterInstance.deposit(
        destinationDomainID,
        btcRecipientAddress,
        {
          from: depositorAddress,
          value: depositAmount,
        }
      )
    );
  });

  it("Native token deposit to EVM can be made", async () => {
    await TruffleAssert.passes(
      await NativeTokenAdapterInstance.depositToEVM(
        destinationDomainID,
        evmRecipientAddress,
        {
          from: depositorAddress,
          value: depositAmount,
        }
      )
    );
  });

  it("Native token deposit to EVM with message can be made", async () => {
    const mintableERC20Iface = new Ethers.utils.Interface(["function mint(address to, uint256 amount)"]);
    const actions = [{
      nativeValue: Ethers.utils.parseEther("0.1"),
      callTo: ERC20MintableInstance.address,
      approveTo: NativeTokenHandlerInstance.address,
      tokenSend: ERC20MintableInstance.address,
      tokenReceive: ERC20MintableInstance.address,
      data: mintableERC20Iface.encodeFunctionData("mint", [evmRecipientAddress, "20"]),
    }];
    const message = Helpers.createMessageCallData(
      transactionId,
      actions,
      DefaultMessageReceiverInstance.address
    );

    await TruffleAssert.passes(
      await NativeTokenAdapterInstance.depositToEVMWithMessage(
        destinationDomainID,
        Ethers.constants.AddressZero,
        executionGasAmount,
        message,
        {
          from: depositorAddress,
          value: depositAmount,
        }
      )
    );
  });

  it("Native token general deposit can be made", async () => {
    const addressLength = 20;
    const depositData = Helpers.abiEncode(["uint256", "address"], [addressLength, evmRecipientAddress])
    await TruffleAssert.passes(
      await NativeTokenAdapterInstance.depositGeneral(
        destinationDomainID,
        depositData,
        {
          from: depositorAddress,
          value: depositAmount,
        }
      )
    );
  });

  it("_depositCounts should be increments from 0 to 1", async () => {
    await NativeTokenAdapterInstance.deposit(
      destinationDomainID,
      btcRecipientAddress,
      {
        from: depositorAddress,
        value: depositAmount,
      }
    );

    const depositCount = await BridgeInstance._depositCounts.call(
      destinationDomainID
    );
    assert.strictEqual(depositCount.toNumber(), expectedDepositNonce);
  });

  it("Deposit event is fired with expected value", async () => {
    const depositTx = await NativeTokenAdapterInstance.deposit(
      destinationDomainID,
      btcRecipientAddress,
      {
        from: depositorAddress,
        value: depositAmount,
      }
    );

    const internalTx = await TruffleAssert.createTransactionResult(
      BridgeInstance,
      depositTx.tx
    );

    const depositData = Helpers.createBtcDepositData(transferredAmount, btcRecipientAddress);

    TruffleAssert.eventEmitted(internalTx, "Deposit", (event) => {
      return (
        event.destinationDomainID.toNumber() === destinationDomainID &&
        event.resourceID === resourceID.toLowerCase() &&
        event.depositNonce.toNumber() === expectedDepositNonce &&
        event.user === NativeTokenAdapterInstance.address &&
        event.data === depositData &&
        event.handlerResponse === null
      );
    });
  });

  it("Should revert if destination domain is current bridge domain", async () => {
    await Helpers.reverts(
      NativeTokenAdapterInstance.deposit(originDomainID, btcRecipientAddress, {
        from: depositorAddress,
        value: depositAmount
      })
    );
  });

  it("Should revert if sender is not native token adapter", async () => {
    const invalidAdapterAddress = accounts[2];
    const NativeTokenHandlerInstance = await NativeTokenHandlerContract.new(
      BridgeInstance.address,
      invalidAdapterAddress,
      DefaultMessageReceiverInstance.address,
    );

    await BridgeInstance.adminSetResource(
      NativeTokenHandlerInstance.address,
      resourceID,
      NativeTokenHandlerInstance.address,
      emptySetResourceData
    );

    await Helpers.reverts(
      NativeTokenAdapterInstance.deposit(destinationDomainID, btcRecipientAddress, {
        from: depositorAddress,
        value: depositAmount
      })
    );
  });
});
