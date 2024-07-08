// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");
const Helpers = require("../../helpers");

const NativeTokenGmpAdapterContract = artifacts.require("NativeTokenGmpAdapter");
const GmpHandlerContract = artifacts.require(
  "GmpHandler"
);
const BasicFeeHandlerContract = artifacts.require("BasicFeeHandler");
const FeeHandlerRouterContract = artifacts.require("FeeHandlerRouter");

contract("Native token adapter - Gmp handler - [Withdraw]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;

  const adminAddress = accounts[0];
  const depositorAddress = accounts[1];
  const nonAdminAddress = accounts[3];

  const resourceID = "0x0000000000000000000000000000000000000000000000000000000000000500";
  const fee = Ethers.utils.parseEther("0.1");
  const withdrawAmount = Ethers.utils.parseEther("0.01")


  let BridgeInstance;
  let NativeTokenGmpAdapterInstance;
  let BasicFeeHandlerInstance;
  let FeeHandlerRouterInstance;
  let depositFunctionSignature;
  let GmpHandlerInstance;

  beforeEach(async () => {
    await Promise.all([
      (BridgeInstance = await Helpers.deployBridge(
        destinationDomainID,
        accounts[0]
      ))
    ]);


    FeeHandlerRouterInstance = await FeeHandlerRouterContract.new(
      BridgeInstance.address
    );
    BasicFeeHandlerInstance = await BasicFeeHandlerContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );

    GmpHandlerInstance = await GmpHandlerContract.new(BridgeInstance.address);
    NativeTokenGmpAdapterInstance = await NativeTokenGmpAdapterContract.new(
      BridgeInstance.address,
      GmpHandlerInstance.address,
      resourceID
    );

    await BridgeInstance.adminChangeFeeHandler(FeeHandlerRouterInstance.address),
    await FeeHandlerRouterInstance.adminSetResourceHandler(
      originDomainID,
      resourceID,
      BasicFeeHandlerInstance.address
    ),
    await BasicFeeHandlerInstance.changeFee(originDomainID, resourceID, fee);

    depositFunctionSignature = Helpers.getFunctionSignature(
      NativeTokenGmpAdapterInstance,
      "transferFunds"
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

    // set MPC address to unpause the Bridge
    await BridgeInstance.endKeygen(Helpers.mpcAddress);

    // send ETH to destination adapter for transfers
    await web3.eth.sendTransaction({
      from: depositorAddress,
      to: NativeTokenGmpAdapterInstance.address,
      value: "1000000000000000000"
    })
  });

  it("should successfully withdraw if called by admin", async () => {
    const adminBalanceBefore = await web3.eth.getBalance(
      adminAddress
    );

    await TruffleAssert.passes(
      NativeTokenGmpAdapterInstance.withdraw(
        withdrawAmount,
        {
          from: adminAddress,
        }
      )
    );

    const adminBalanceAfter = await web3.eth.getBalance(
      adminAddress
    );

    expect(
      Number(Ethers.utils.formatEther(new Ethers.BigNumber.from(adminBalanceBefore).add(withdrawAmount)))
    ).to.be.within(
      Number(Ethers.utils.formatEther(adminBalanceAfter))*0.99,
      Number(Ethers.utils.formatEther(adminBalanceAfter))*1.01
    )
  });

  it("should revert if withdraw is called by non admin", async () => {
    await Helpers.expectToRevertWithCustomError(
      NativeTokenGmpAdapterInstance.withdraw(
        withdrawAmount,
        {
          from: nonAdminAddress,
        }
      ),
      "SenderNotAdmin()"
    );
  });
});
