// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
const Ethers = require("ethers");
const TruffleAssert = require("truffle-assertions");
const Helpers = require("../../../../helpers");
const DynamicFeeHandlerContract = artifacts.require("DynamicERC20FeeHandlerEVMV2");
const FeeHandlerRouterContract = artifacts.require("FeeHandlerRouter");
const TwapOracleContract = artifacts.require("TwapOracle");

const FACTORY_ABI = require('@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json').abi;
const FACTORY_BYTECODE = require('@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json').bytecode;
const POOL_ABI = require('@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json').abi;
const POOL_BYTECODE = require('@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json').bytecode;
const QUOTER_ABI = require('@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json').abi;
const QUOTER_BYTECODE = require('@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json').bytecode;

contract("DynamicFeeHandlerV2 - [admin]", async (accounts) => {
  const initialRelayers = accounts.slice(0, 3);
  const currentFeeHandlerAdmin = accounts[0];

  const assertOnlyAdmin = (method, ...params) => {
    return TruffleAssert.reverts(
      method(...params, {from: initialRelayers[1]}),
      "sender doesn't have admin role"
    );
  };

  const originDomainID = 1;
  const destinationDomainID = 3;
  const gasUsed = 100000;
  const gasPrice = 200000000000;
  const UNISWAP_V3_FACTORY_ADDRESS = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
  const MATIC_ADDRESS = "0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0";

  let ADMIN_ROLE;
  let UniswapFactoryInstance;
  let TwapOracleInstance;
  let BridgeInstance;
  let FeeHandlerRouterInstance;
  let pool_500;
  let pool_3000;
  let pool_10000;
  let QuoterInstance;
  let DynamicFeeHandlerInstance;

  beforeEach(async () => {
    BridgeInstance = await Helpers.deployBridge(originDomainID, accounts[0]);
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

    TwapOracleInstance = await TwapOracleContract.new(UniswapFactoryInstance.address, WETH_ADDRESS, 1);
    await TwapOracleInstance.setFeeTier(WETH_ADDRESS, MATIC_ADDRESS, 500);

    FeeHandlerRouterInstance = await FeeHandlerRouterContract.new(
      BridgeInstance.address
    );
    DynamicFeeHandlerInstance = await DynamicFeeHandlerContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );
    ADMIN_ROLE = await DynamicFeeHandlerInstance.DEFAULT_ADMIN_ROLE();
  });

  it("should set fee oracle and emit 'FeeOracleAddressSet' event", async () => {
    assert.equal(
      await DynamicFeeHandlerInstance.twapOracle.call(),
      "0x0000000000000000000000000000000000000000"
    );
    const setFeeOracleAddressTx = await DynamicFeeHandlerInstance.setFeeOracle(TwapOracleInstance.address);
    const newOracle = await DynamicFeeHandlerInstance.twapOracle.call();
    assert.equal(newOracle, TwapOracleInstance.address);

    TruffleAssert.eventEmitted(setFeeOracleAddressTx, "FeeOracleAddressSet", (event) => {
      return (
        event.feeOracleAddress === newOracle
      );
    });
  });

  it("should require admin role to change fee oracle", async () => {
    await assertOnlyAdmin(
      DynamicFeeHandlerInstance.setFeeOracle,
      TwapOracleInstance.address
    );
  });

  it("should set time window and emit 'TimeWindowUpdated' event", async () => {
    const setTimeWindowTx = await TwapOracleInstance.updateTimeWindow(200);

    TruffleAssert.eventEmitted(setTimeWindowTx, "TimeWindowUpdated", (event) => {
      return (
        event.timeWindow.toNumber() === 200
      );
    });
  });
  
  it("should require admin role to change time window", async () => {
    await assertOnlyAdmin(
      TwapOracleInstance.updateTimeWindow,
      200
    );
  });

  it("should set fee properties and emit 'FeePropertySet' event", async () => {
    assert.equal(await DynamicFeeHandlerInstance._gasUsed.call(), "0");
    const setFeeOraclePropertiesTx = await DynamicFeeHandlerInstance.setFeeProperties(gasUsed);
    assert.equal(await DynamicFeeHandlerInstance._gasUsed.call(), gasUsed);

    TruffleAssert.eventEmitted(setFeeOraclePropertiesTx, "FeePropertySet", (event) => {
      return (
        event.gasUsed.toNumber() === gasUsed
      );
    });
  });

  it("should require admin role to change fee properties", async () => {
    await assertOnlyAdmin(
      DynamicFeeHandlerInstance.setFeeProperties,
      gasUsed
    );
  });

  it("should set fee tier and emit 'FeeTierSet' event", async () => {
    const setFeeTierTx = await TwapOracleInstance.setFeeTier(WETH_ADDRESS, MATIC_ADDRESS, 3000);
    const feeTier = await TwapOracleInstance.feeTiers(WETH_ADDRESS, MATIC_ADDRESS);
    assert.equal(feeTier.toNumber(), 3000);

    TruffleAssert.eventEmitted(setFeeTierTx, "FeeTierSet", (event) => {
      return (
        event.tokenA === WETH_ADDRESS,
        event.tokenB === MATIC_ADDRESS,
        event.feeTier.toNumber() === 3000
      );
    });
  });

  it("should require admin role to set fee tier", async () => {
    await assertOnlyAdmin(
      TwapOracleInstance.setFeeTier,
      WETH_ADDRESS,
      MATIC_ADDRESS,
      3000
    );
  });

  it("should revert if new fee tier is not supported", async () => {
    const errorValues = await Helpers.expectToRevertWithCustomError(
      TwapOracleInstance.setFeeTier(
        WETH_ADDRESS,
        MATIC_ADDRESS,
        4000
      ),
      "FeeTierNotSupported()"
    );
  });

  it("DynamicFeeHandler admin should be changed to expectedDynamicFeeHandlerAdmin", async () => {
    const expectedDynamicFeeHandlerAdmin = accounts[1];

    // check current admin
    assert.isTrue(
      await DynamicFeeHandlerInstance.hasRole(
        ADMIN_ROLE,
        currentFeeHandlerAdmin
      )
    );

    await TruffleAssert.passes(
      DynamicFeeHandlerInstance.renounceAdmin(
        expectedDynamicFeeHandlerAdmin
      )
    );
    assert.isTrue(
      await DynamicFeeHandlerInstance.hasRole(
        ADMIN_ROLE,
        expectedDynamicFeeHandlerAdmin
      )
    );

    // check that former admin is no longer admin
    assert.isFalse(
      await DynamicFeeHandlerInstance.hasRole(
        ADMIN_ROLE,
        currentFeeHandlerAdmin
      )
    );
  });
});
