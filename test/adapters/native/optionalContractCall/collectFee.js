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

contract("Bridge - [collect fee - native token]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const adminAddress = accounts[0];
  const depositorAddress = accounts[1];
  const evmRecipientAddress = accounts[2];

  const expectedDepositNonce = 1;
  const emptySetResourceData = "0x";
  const resourceID = "0x0000000000000000000000000000000000000000000000000000000000000650";
  const depositAmount = Ethers.utils.parseEther("1");
  const fee = Ethers.utils.parseEther("0.1");
  const transferredAmount = depositAmount.sub(fee);
  const executionGasAmount = 30000000;
  const transactionId = "0x0000000000000000000000000000000000000000000000000000000000000001";

  let BridgeInstance;
  let DefaultMessageReceiverInstance;
  let NativeTokenHandlerInstance;
  let BasicFeeHandlerInstance;
  let FeeHandlerRouterInstance;
  let NativeTokenAdapterInstance;
  let message;

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
        emptySetResourceData
      );
    await BasicFeeHandlerInstance.changeFee(destinationDomainID, resourceID, fee);
    await BridgeInstance.adminChangeFeeHandler(FeeHandlerRouterInstance.address),
    await FeeHandlerRouterInstance.adminSetResourceHandler(
      destinationDomainID,
      resourceID,
      BasicFeeHandlerInstance.address
    ),

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

    // set MPC address to unpause the Bridge
    await BridgeInstance.endKeygen(Helpers.mpcAddress);
  });

  it("Native token fee should be successfully deducted", async () => {
    const depositorBalanceBefore = await web3.eth.getBalance(depositorAddress);
    const adapterBalanceBefore = await web3.eth.getBalance(NativeTokenAdapterInstance.address);
    const handlerBalanceBefore = await web3.eth.getBalance(NativeTokenHandlerInstance.address);

    await TruffleAssert.passes(
      NativeTokenAdapterInstance.depositToEVMWithMessage(
        destinationDomainID,
        Ethers.constants.AddressZero,
        executionGasAmount,
        message,
        {
          from: depositorAddress,
          value: depositAmount,
        }
      ));

    // check that correct ETH amount is successfully transferred to the adapter
    const adapterBalanceAfter = await web3.eth.getBalance(NativeTokenAdapterInstance.address);
    const handlerBalanceAfter = await web3.eth.getBalance(NativeTokenHandlerInstance.address);
    assert.strictEqual(
      new Ethers.BigNumber.from(transferredAmount).add(handlerBalanceBefore).toString(), handlerBalanceAfter
    );

    // check that adapter funds are transferred to the native handler contracts
    assert.strictEqual(
      adapterBalanceBefore,
      adapterBalanceAfter
    );

    // check that depositor before and after balances align
    const depositorBalanceAfter = await web3.eth.getBalance(depositorAddress);
    expect(
      Number(Ethers.utils.formatEther(new Ethers.BigNumber.from(depositorBalanceBefore).sub(depositAmount)))
    ).to.be.within(
      Number(Ethers.utils.formatEther(depositorBalanceAfter))*0.99,
      Number(Ethers.utils.formatEther(depositorBalanceAfter))*1.01
    )
  });
});
