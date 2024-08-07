// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const Ethers = require("ethers");
const Helpers = require("../../helpers");

const GmpTransferAdapterContract = artifacts.require("GmpTransferAdapter");
const GmpHandlerContract = artifacts.require(
  "GmpHandler"
);
const BasicFeeHandlerContract = artifacts.require("BasicFeeHandler");
const FeeHandlerRouterContract = artifacts.require("FeeHandlerRouter");
const XERC20FactoryContract = artifacts.require("XERC20Factory");
const XERC20Contract = artifacts.require("XERC20");
const XERC20LockboxContract = artifacts.require("XERC20Lockbox");


contract("Gmp transfer adapter - [Withdraw]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;

  const adminAccount = accounts[0];
  const depositorAddress = accounts[1];
  const nonAdminAddress = accounts[2];
  const recipientAddress = accounts[3];

  const resourceID = "0x0000000000000000000000000000000000000000000000000000000000000500";
  const depositAmount = 10;
  const fee = Ethers.utils.parseEther("0.1");
  const transferredAmount = 10
  const mintingLimit = 500;
  const burningLimit = 500;
  const withdrawAmount = Ethers.utils.parseEther("1")

  const assertOnlyAdmin = (method) => {
    return Helpers.expectToRevertWithCustomError(
      method(),
      "CallerNotAdmin()"
    );
  };

  let BridgeInstance;
  let GmpTransferAdapterInstance;
  let BasicFeeHandlerInstance;
  let FeeHandlerRouterInstance;
  let depositFunctionSignature;
  let GmpHandlerInstance;
  let XERC20LockboxInstance;
  let XERC20Instance;

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
    GmpTransferAdapterInstance = await GmpTransferAdapterContract.new(
      BridgeInstance.address,
      GmpHandlerInstance.address,
      resourceID,
    );

    XERC20FactoryInstance = await XERC20FactoryContract.new();
    const XERC20DeployResponse = await XERC20FactoryInstance.deployXERC20(
      "sygmaETH",
      "sETH",
      [mintingLimit],
      [burningLimit],
      [GmpTransferAdapterInstance.address]
    );
    // set XERC20 contract instance address to the address deployed via XERC20Factory
    const deployedXERC20Address = XERC20DeployResponse.logs[0].args._xerc20
    XERC20Instance = await XERC20Contract.at(deployedXERC20Address)
    const lockboxDeployResponse = await XERC20FactoryInstance.deployLockbox(
      XERC20Instance.address,
      Ethers.constants.AddressZero,
      true
    );
    // set Lockbox contract instance address to the address deployed via XERC20Factory
    const lockboxAddress = lockboxDeployResponse.logs[0].args._lockbox
    XERC20LockboxInstance = await XERC20LockboxContract.at(lockboxAddress);

    await XERC20LockboxInstance.depositNativeTo(depositorAddress, {value: transferredAmount});
    await XERC20Instance.increaseAllowance(
      GmpTransferAdapterInstance.address,
      depositAmount,
      {
        from: depositorAddress
      }
    );

    await BridgeInstance.adminChangeFeeHandler(FeeHandlerRouterInstance.address),
    await FeeHandlerRouterInstance.adminSetResourceHandler(
      originDomainID,
      resourceID,
      BasicFeeHandlerInstance.address
    ),
    await BasicFeeHandlerInstance.changeFee(originDomainID, resourceID, fee);

    depositFunctionSignature = Helpers.getFunctionSignature(
      GmpTransferAdapterInstance,
      "executeProposal"
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
      to: GmpTransferAdapterInstance.address,
      value: "1000000000000000000"
    })
  });

  it("should fail if withdraw is called by non admin", async () => {
    const adapterBalanceBefore = await web3.eth.getBalance(GmpTransferAdapterInstance.address);

    await assertOnlyAdmin(() =>
      GmpTransferAdapterInstance.withdraw(
        recipientAddress,
        withdrawAmount,
        {
          from: nonAdminAddress
        }
      )
    );

    const adapterBalanceAfter = await web3.eth.getBalance(GmpTransferAdapterInstance.address);
    assert.strictEqual(
      Ethers.BigNumber.from(adapterBalanceBefore).toString(),
      adapterBalanceAfter.toString()
    );
  });

  it("should successfully withdraw if called by admin", async () => {
    const recipientBalanceBefore = await web3.eth.getBalance(recipientAddress);
    const adapterBalanceBefore = await web3.eth.getBalance(GmpTransferAdapterInstance.address);

    await GmpTransferAdapterInstance.withdraw(
        recipientAddress,
        withdrawAmount,
        {
          from: adminAccount
        }
      )

    const recipientBalanceAfter = await web3.eth.getBalance(recipientAddress);
    const adapterBalanceAfter = await web3.eth.getBalance(GmpTransferAdapterInstance.address);
    assert.strictEqual(
      Ethers.BigNumber.from(recipientBalanceBefore).add(withdrawAmount).toString(),
      Ethers.BigNumber.from(recipientBalanceAfter).toString()
    );
    assert.strictEqual(
      Ethers.BigNumber.from(adapterBalanceBefore).add(recipientBalanceBefore).toString(),
      Ethers.BigNumber.from(adapterBalanceAfter).add(recipientBalanceAfter).toString()
    );
  });
});
