// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
const Ethers = require("ethers");
const Helpers = require("../../../../helpers");
const DynamicFeeHandlerContract = artifacts.require("DynamicERC20FeeHandlerEVMV2");
const FeeHandlerRouterContract = artifacts.require("FeeHandlerRouter");
const ERC20MintableContract = artifacts.require("ERC20PresetMinterPauser");
const TwapOracleContract = artifacts.require("TwapOracle");

const FACTORY_ABI = require('@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json').abi;
const FACTORY_BYTECODE = require('@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json').bytecode;
const POOL_ABI = require('@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json').abi;
const POOL_BYTECODE = require('@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json').bytecode;
const QUOTER_ABI = require('@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json').abi;
const QUOTER_BYTECODE = require('@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json').bytecode;

contract("DynamicFeeHandlerV2 - [calculateFee]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 3;
  const gasUsed = 100000;
  const gasPrice = 200000000000;
  const sender = accounts[0];
  const UNISWAP_V3_FACTORY_ADDRESS = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
  const MATIC_ADDRESS = "0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0";
  const BNB_ADDRESS = "0xB8c77482e45F1F44dE1745F52C74426C631bDD52";

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

  beforeEach(async () => {
    await Promise.all([
      (BridgeInstance = await Helpers.deployBridge(
        destinationDomainID,
        accounts[0]
      )),
      (ERC20MintableInstance = await ERC20MintableContract.new(
        "token",
        "TOK"
      ).then((instance) => (ERC20MintableInstance = instance))),
    ]);
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

    FeeHandlerRouterInstance = await FeeHandlerRouterContract.new(
      BridgeInstance.address
    );
    DynamicFeeHandlerInstance = await DynamicFeeHandlerContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );
    FeeHandlerRouterInstance.adminSetResourceHandler(
      destinationDomainID,
      resourceID,
      DynamicFeeHandlerInstance.address
    ),
    await DynamicFeeHandlerInstance.setFeeOracle(TwapOracleInstance.address);
    await DynamicFeeHandlerInstance.setGasPrice(destinationDomainID, gasPrice); // Polygon gas price is 200 Gwei
    await DynamicFeeHandlerInstance.setWrapTokenAddress(destinationDomainID, MATIC_ADDRESS);
    await DynamicFeeHandlerInstance.setFeeProperties(gasUsed);
  });

  it("should get the correct values", async () => {
    const feeInDestinationToken = gasPrice * gasUsed;
    const res = await FeeHandlerRouterInstance.calculateFee.call(
      sender,
      originDomainID,
      destinationDomainID,
      resourceID,
      "0x00",
      "0x00"
    );

    const input = new Ethers.ethers.BigNumber.from(feeInDestinationToken.toString());
    const out = await QuoterInstance.callStatic.quoteExactInputSingle(MATIC_ADDRESS, WETH_ADDRESS, 500, input, 0);
    expect(res.fee.toNumber()).to.be.within(out*0.99, out*1.01);
  });

  it("should get the correct price for the tokens with no available pool", async () => {
     const bnb_price = Ethers.utils.parseEther("0.18");
     await TwapOracleInstance.setPrice(BNB_ADDRESS, bnb_price);
     const priceOnOracle = await TwapOracleInstance.getPrice(BNB_ADDRESS);
     assert.equal(priceOnOracle.toString(), bnb_price.toString());
  });
});
