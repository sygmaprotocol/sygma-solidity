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

contract("Bridge - [collect fee - erc20 token]", async (accounts) => {
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
  const fee = 100000; // BPS
  const feeAmount = 1;
  const executionGasAmount = 30000000;
  const transactionId = "0x0000000000000000000000000000000000000000000000000000000000000001";
  const feeData = "0x";

  let BridgeInstance;
  let DefaultMessageReceiverInstance;
  let ERC20HandlerInstance;
  let PercentageFeeHandlerInstance;
  let FeeHandlerRouterInstance;
  let ERC721MintableInstance;
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
      "token20",
      "TOK20"
    );
    ERC721MintableInstance = await ERC721MintableContract.new("token721", "TOK721", "")
    await ERC20MintableInstance.mint(depositorAddress, initialTokenAmount);

    await BridgeInstance.adminSetResource(
        ERC20HandlerInstance.address,
        resourceID,
        ERC20MintableInstance.address,
        emptySetResourceData
      );
    await PercentageFeeHandlerInstance.changeFee(destinationDomainID, resourceID, fee);
    await BridgeInstance.adminChangeFeeHandler(FeeHandlerRouterInstance.address),
    await FeeHandlerRouterInstance.adminSetResourceHandler(
      destinationDomainID,
      resourceID,
      PercentageFeeHandlerInstance.address
    ),

    await DefaultMessageReceiverInstance.grantRole(
      await DefaultMessageReceiverInstance.SYGMA_HANDLER_ROLE(),
      ERC20HandlerInstance.address
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

  it("ERC20 token transfer fee should be successfully deducted", async () => {
    const depositorBalanceBefore = await ERC20MintableInstance.balanceOf(depositorAddress);
    const handlerBalanceBefore = await ERC20MintableInstance.balanceOf(ERC20HandlerInstance.address);

    await TruffleAssert.passes(
      BridgeInstance.deposit(
        destinationDomainID,
        resourceID,
        message,
        feeData,
        {
          from: depositorAddress,
        }
      ));

      // check that correct ERC20 token amount is successfully transferred to the handler
      const handlerBalanceAfter = await ERC20MintableInstance.balanceOf(ERC20HandlerInstance.address);
      assert.strictEqual(
        new Ethers.BigNumber.from(feeAmount).add(Number(handlerBalanceBefore)).toString(),
        handlerBalanceAfter.toString()
      );

      // check that depositor before and after balances align
      const depositorBalanceAfter = await ERC20MintableInstance.balanceOf(depositorAddress);
    assert.strictEqual(
      new Ethers.BigNumber.from(Number(depositorBalanceBefore)
      ).sub(feeAmount).toString(), depositorBalanceAfter.toString()
    )
  });
});
