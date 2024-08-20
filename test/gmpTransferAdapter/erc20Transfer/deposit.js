// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");
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
const ERC20MintableContract = artifacts.require("ERC20PresetMinterPauser");


contract("Gmp transfer adapter - [Deposit XERC20 - wrapped ERC20 token]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const expectedDepositNonce = 1;

  const depositorAddress = accounts[1];
  const recipientAddress = accounts[3];

  const destinationMaxFee = 950000;
  const resourceID = "0x0000000000000000000000000000000000000000000000000000000000000500";
  const depositAmount = 10;
  const fee = Ethers.utils.parseEther("0.1");
  const mintingLimit = 500;
  const burningLimit = 500;



  let BridgeInstance;
  let GmpTransferAdapterInstance;
  let BasicFeeHandlerInstance;
  let FeeHandlerRouterInstance;
  let depositFunctionSignature;
  let GmpHandlerInstance;
  let XERC20LockboxInstance;
  let XERC20Instance;
  let ERC20MintableInstance;

  beforeEach(async () => {
    await Promise.all([
      (BridgeInstance = await Helpers.deployBridge(
        destinationDomainID,
        accounts[0]
      )),
      ERC20MintableContract.new("token", "TOK").then(
        (instance) => (ERC20MintableInstance = instance)
      ),
    ]);

    await ERC20MintableInstance.mint(depositorAddress, depositAmount);

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
      ERC20MintableInstance.address,
      false
    );
    // set Lockbox contract instance address to the address deployed via XERC20Factory
    const lockboxAddress = lockboxDeployResponse.logs[0].args._lockbox
    XERC20LockboxInstance = await XERC20LockboxContract.at(lockboxAddress);

    await ERC20MintableInstance.increaseAllowance(
      XERC20LockboxInstance.address,
      depositAmount,
      {
        from: depositorAddress
      }
    );
    await XERC20LockboxInstance.depositTo(
      depositorAddress,
      depositAmount,
      {
        from: depositorAddress
      }
    );
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
  });

  it("deposit can be made successfully and depositor tokens are burnt", async () => {
    const depositorXERC20BalanceBefore = await XERC20Instance.balanceOf(depositorAddress);

    await TruffleAssert.passes(
      GmpTransferAdapterInstance.deposit(
        originDomainID,
        recipientAddress,
        XERC20Instance.address,
        depositAmount,
        {
          from: depositorAddress,
          value: fee,
        }
      )
    );
    const depositorXERC20BalanceAfter = await XERC20Instance.balanceOf(depositorAddress);
    assert.strictEqual(
      Ethers.BigNumber.from(depositAmount).sub(depositorXERC20BalanceBefore.toString()).toString(),
      depositorXERC20BalanceAfter.toString()
    );
  });

  it("depositEvent is emitted with expected values", async () => {
    const preparedExecutionData = await GmpTransferAdapterInstance.prepareDepositData(
      recipientAddress,
      XERC20Instance.address,
      depositAmount
    );
    const depositData = Helpers.createGmpDepositData(
      depositFunctionSignature,
      GmpTransferAdapterInstance.address,
      destinationMaxFee,
      GmpTransferAdapterInstance.address,
      preparedExecutionData,
      false
    );

    const depositTx = await GmpTransferAdapterInstance.deposit(
      originDomainID,
      recipientAddress,
      XERC20Instance.address,
      depositAmount,
      {
        from: depositorAddress,
        value: fee,
      }
    );

    const internalTx = await TruffleAssert.createTransactionResult(
      BridgeInstance,
      depositTx.tx
    );

    TruffleAssert.eventEmitted(internalTx, "Deposit", (event) => {
      return (
        event.destinationDomainID.toNumber() === originDomainID &&
        event.resourceID === resourceID.toLowerCase() &&
        event.depositNonce.toNumber() === expectedDepositNonce &&
        event.user === GmpTransferAdapterInstance.address &&
        event.data === depositData &&
        event.handlerResponse == null
      );
    });
  });
});
