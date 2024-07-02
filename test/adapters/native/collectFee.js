// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");

const Helpers = require("../../helpers");

const NativeTokenHandlerContract = artifacts.require("NativeTokenHandler");
const NativeTokenAdapterContract = artifacts.require("NativeTokenAdapter");
const BasicFeeHandlerContract = artifacts.require("BasicFeeHandler");
const FeeHandlerRouterContract = artifacts.require("FeeHandlerRouter");

contract("Bridge - [collect fee - native token]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const adminAddress = accounts[0];
  const depositorAddress = accounts[1];

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
      BasicFeeHandlerInstance.address,
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
      destinationDomainID,
      resourceID,
      BasicFeeHandlerInstance.address
    ),

    // set MPC address to unpause the Bridge
    await BridgeInstance.endKeygen(Helpers.mpcAddress);
  });

  it("Native token fee should be successfully deducted", async () => {
    const depositorBalanceBefore = await web3.eth.getBalance(depositorAddress);
    const adapterBalanceBefore = await web3.eth.getBalance(NativeTokenAdapterInstance.address);

    await TruffleAssert.passes(
      NativeTokenAdapterInstance.deposit(
      destinationDomainID,
      btcRecipientAddress,
        {
          from: depositorAddress,
          value: depositAmount,
        }
      ));

    // check that correct ETH amount is successfully transferred to the adapter
    const adapterBalanceAfter = await web3.eth.getBalance(NativeTokenAdapterInstance.address);
    assert.strictEqual(
      new Ethers.BigNumber.from(transferredAmount).add(adapterBalanceBefore).toString(), adapterBalanceAfter
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
