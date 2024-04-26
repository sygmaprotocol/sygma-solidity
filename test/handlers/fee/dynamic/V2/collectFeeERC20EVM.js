// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");

const Helpers = require("../../../../helpers");

const ERC20MintableContract = artifacts.require("ERC20PresetMinterPauser");
const ERC20HandlerContract = artifacts.require("ERC20Handler");
const DynamicFeeHandlerContract = artifacts.require("DynamicERC20FeeHandlerEVMV2");
const FeeHandlerRouterContract = artifacts.require("FeeHandlerRouter");
const TwapOracleContract = artifacts.require("TwapOracle");

const FACTORY_ABI = require('@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json').abi;
const FACTORY_BYTECODE = require('@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json').bytecode;
const POOL_ABI = require('@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json').abi;
const POOL_BYTECODE = require('@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json').bytecode;
const QUOTER_ABI = require('@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json').abi;
const QUOTER_BYTECODE = require('@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json').bytecode;

contract("DynamicERC20FeeHandlerEVMV2 - [collectFee]", async (accounts) => {
  const recipientAddress = accounts[2];
  const tokenAmount = Ethers.utils.parseEther("1");
  // const fee = Ethers.utils.parseEther("0.05");
  const depositorAddress = accounts[1];
  const emptySetResourceData = "0x";
  const msgGasLimit = 0;
  const originDomainID = 1;
  const destinationDomainID = 3;
  const gasUsed = 100000;
  const gasPrice = 200000000000;
  const sender = accounts[0];
  const UNISWAP_V3_FACTORY_ADDRESS = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
  const MATIC_ADDRESS = "0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0";

  let UniswapFactoryInstance;
  let TwapOracleInstance;
  let BridgeInstance;
  let FeeHandlerRouterInstance;
  let pool_500;
  let pool_3000;
  let pool_10000;
  let QuoterInstance;
  let DynamicFeeHandlerInstance;
  let resourceID;
  let ERC20HandlerInstance;
  let ERC20MintableInstance;
  let depositData;

  beforeEach(async () => {
    await Promise.all([
      (BridgeInstance = await Helpers.deployBridge(
        originDomainID,
        accounts[0]
      )),
      (ERC20MintableInstance = ERC20MintableContract.new(
        "ERC20Token",
        "ERC20TOK"
      ).then((instance) => (ERC20MintableInstance = instance))),
    ]);

    ERC20HandlerInstance = await ERC20HandlerContract.new(
      BridgeInstance.address
    );
    FeeHandlerRouterInstance = await FeeHandlerRouterContract.new(
      BridgeInstance.address
    );
    DynamicFeeHandlerInstance = await DynamicFeeHandlerContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );

    resourceID = Helpers.createResourceID(
      ERC20MintableInstance.address,
      originDomainID
    );

    const provider = new Ethers.providers.JsonRpcProvider();
    const signer = provider.getSigner();
    UniswapFactoryInstance = new Ethers.ethers.ContractFactory(new Ethers.ethers.utils.Interface(FACTORY_ABI), FACTORY_BYTECODE, signer);
    UniswapFactoryInstance = await UniswapFactoryInstance.attach(UNISWAP_V3_FACTORY_ADDRESS);

    QuoterInstance = new Ethers.ethers.ContractFactory(new Ethers.ethers.utils.Interface(QUOTER_ABI), QUOTER_BYTECODE, signer);
    QuoterInstance = await QuoterInstance.deploy(UniswapFactoryInstance.address, WETH_ADDRESS);

    const poolFactory = new Ethers.ethers.ContractFactory(new Ethers.ethers.utils.Interface(POOL_ABI), POOL_BYTECODE, signer);
    pool_500 = await UniswapFactoryInstance.getPool(WETH_ADDRESS, MATIC_ADDRESS, 500);
    pool_500 = await poolFactory.attach(pool_500);
    pool_3000 = await UniswapFactoryInstance.getPool(WETH_ADDRESS, MATIC_ADDRESS, 3000);
    pool_3000 = await poolFactory.attach(pool_3000);
    pool_10000 = await UniswapFactoryInstance.getPool(WETH_ADDRESS, MATIC_ADDRESS, 10000);
    pool_10000 = await poolFactory.attach(pool_10000);

    TwapOracleInstance = await TwapOracleContract.new(UniswapFactoryInstance.address, WETH_ADDRESS);
    await TwapOracleInstance.setPool(MATIC_ADDRESS, 500, 100);

    await FeeHandlerRouterInstance.adminSetResourceHandler(
      destinationDomainID,
      resourceID,
      DynamicFeeHandlerInstance.address
    );
    await DynamicFeeHandlerInstance.setFeeOracle(TwapOracleInstance.address);
    await DynamicFeeHandlerInstance.setGasPrice(destinationDomainID, gasPrice); // Polygon gas price is 200 Gwei
    await DynamicFeeHandlerInstance.setWrapTokenAddress(destinationDomainID, MATIC_ADDRESS);
    await DynamicFeeHandlerInstance.setFeeProperties(gasUsed);

    await Promise.all([
      BridgeInstance.adminSetResource(
        ERC20HandlerInstance.address,
        resourceID,
        ERC20MintableInstance.address,
        emptySetResourceData
      ),
      ERC20MintableInstance.mint(depositorAddress, tokenAmount),
      ERC20MintableInstance.approve(ERC20HandlerInstance.address, tokenAmount, {
        from: depositorAddress,
      }),
      BridgeInstance.adminChangeFeeHandler(FeeHandlerRouterInstance.address),
      FeeHandlerRouterInstance.adminSetResourceHandler(
        destinationDomainID,
        resourceID,
        DynamicFeeHandlerInstance.address
      ),
    ]);

    depositData = Helpers.createERCDepositData(
      tokenAmount,
      20,
      recipientAddress
    );

    // set MPC address to unpause the Bridge
    await BridgeInstance.endKeygen(Helpers.mpcAddress);
  });

  it("should collect fee in native coins", async () => {
    const feeData = "0x00";
    const balanceBefore = await web3.eth.getBalance(
        DynamicFeeHandlerInstance.address
    );
    const res = await FeeHandlerRouterInstance.calculateFee.call(
      sender,
      originDomainID,
      destinationDomainID,
      resourceID,
      depositData,
      "0x00"
    );

    const fee = res.fee;
    const depositTx = await BridgeInstance.deposit(
      destinationDomainID,
      resourceID,
      depositData,
      feeData,
      {
        from: depositorAddress,
        value: fee,
      }
    );
    TruffleAssert.eventEmitted(depositTx, "Deposit", (event) => {
      return (
        event.destinationDomainID.toNumber() === destinationDomainID &&
        event.resourceID === resourceID.toLowerCase()
      );
    });
    const internalTx = await TruffleAssert.createTransactionResult(
      DynamicFeeHandlerInstance,
      depositTx.tx
    );
    TruffleAssert.eventEmitted(internalTx, "FeeCollected", (event) => {
      return (
        event.sender === depositorAddress &&
        event.fromDomainID.toNumber() === originDomainID &&
        event.destinationDomainID.toNumber() === destinationDomainID &&
        event.resourceID === resourceID.toLowerCase() &&
        event.fee.toString() === fee.toString() &&
        event.tokenAddress === Ethers.constants.AddressZero
      );
    });
    const balanceAfter = await web3.eth.getBalance(
      DynamicFeeHandlerInstance.address
    );
    assert.equal(balanceAfter, Ethers.BigNumber.from(fee.toString()).add(balanceBefore));
  });

  it("deposit should revert if invalid fee (msg.value) amount supplied", async () => {
    const res = await FeeHandlerRouterInstance.calculateFee.call(
      sender,
      originDomainID,
      destinationDomainID,
      resourceID,
      depositData,
      "0x00"
    );

    const expectedFee = res.fee;
    const fee = Ethers.BigNumber.from(expectedFee.toString()).div(2);

    const errorValues = await Helpers.expectToRevertWithCustomError(
      BridgeInstance.deposit(
        destinationDomainID,
        resourceID,
        depositData,
        "0x00",
        {
          from: depositorAddress,
          value: fee,
        }
      ),
      "IncorrectFeeSupplied(uint256)"
    );

    assert.equal(errorValues[0].toString(), fee.toString());
  });

  it("deposit should not revert if exceed fee (msg.value) amount supplied", async () => {
    const exceedFee = Ethers.utils.parseEther("1.0");

    const depositTx = await BridgeInstance.deposit(
      destinationDomainID,
      resourceID,
      depositData,
      "0x00",
      {
        from: depositorAddress,
        value: exceedFee,
      }
    );
    TruffleAssert.eventEmitted(depositTx, "Deposit", (event) => {
      return (
        event.destinationDomainID.toNumber() === destinationDomainID &&
        event.resourceID === resourceID.toLowerCase()
      );
    });
  });

  it("should successfully change fee handler from FeeRouter to DynamicFeeHandler and collect fee", async () => {
    await BridgeInstance.adminChangeFeeHandler(
      DynamicFeeHandlerInstance.address
    );

    const balanceBefore = await web3.eth.getBalance(
      DynamicFeeHandlerInstance.address
    );

    const res = await FeeHandlerRouterInstance.calculateFee.call(
      sender,
      originDomainID,
      destinationDomainID,
      resourceID,
      depositData,
      "0x00"
    );
    const fee = res.fee;

    const depositTx = await BridgeInstance.deposit(
      destinationDomainID,
      resourceID,
      depositData,
      "0x00",
      {
        from: depositorAddress,
        value: fee,
      }
    );

    TruffleAssert.eventEmitted(depositTx, "Deposit", (event) => {
      return (
        event.destinationDomainID.toNumber() === destinationDomainID &&
        event.resourceID === resourceID.toLowerCase()
      );
    });

    const internalTx = await TruffleAssert.createTransactionResult(
      DynamicFeeHandlerInstance,
      depositTx.tx
    );

    TruffleAssert.eventEmitted(internalTx, "FeeCollected", (event) => {
      return (
        event.sender === depositorAddress &&
        event.fromDomainID.toNumber() === originDomainID &&
        event.destinationDomainID.toNumber() === destinationDomainID &&
        event.resourceID === resourceID.toLowerCase() &&
        event.fee.toString() === fee.toString() &&
        event.tokenAddress === Ethers.constants.AddressZero
      );
    });
    const balanceAfter = await web3.eth.getBalance(
      DynamicFeeHandlerInstance.address
    );

    assert.equal(balanceAfter, Ethers.BigNumber.from(fee.toString()).add(balanceBefore));
  });
});
