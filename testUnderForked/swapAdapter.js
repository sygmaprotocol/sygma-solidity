// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");

const Helpers = require("../test/helpers");

const ERC20HandlerContract = artifacts.require("ERC20Handler");
const DefaultMessageReceiverContract = artifacts.require("DefaultMessageReceiver"); 
const FeeHandlerRouterContract = artifacts.require("FeeHandlerRouter"); 
const BasicFeeHandlerContract = artifacts.require("BasicFeeHandler"); 
const NativeTokenAdapterContract = artifacts.require("NativeTokenAdapter");  
const NativeTokenHandlerContract = artifacts.require("NativeTokenHandler");  
const SwapAdapterContract = artifacts.require("SwapAdapter");
const ERC20MintableContract = artifacts.require("ERC20PresetMinterPauser");

contract("SwapAdapter", async (accounts) => {
  // Fee handler is mocked by BasicFeeHandler
  // deploy bridge, ERC20Handler, NativeTokenHandler, BasicFeeHandler, SwapAdapter
  // use SwapRouter, USDC, WETH, user with USDC, user with ETH from mainnet fork
  const recipientAddress = accounts[2];
  const tokenAmount = Ethers.utils.parseEther("1");
  const fee = Ethers.utils.parseEther("0.05");
  const depositorAddress = accounts[1];
  const emptySetResourceData = "0x";
  const originDomainID = 1;
  const destinationDomainID = 3;
  const gasUsed = 100000;
  const gasPrice = 200000000000;
  const sender = accounts[0];
  const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
  const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const USDC_OWNER_ADDRESS =  "0x7713974908Be4BEd47172370115e8b1219F4A5f0";
  const UNISWAP_SWAP_ROUTER_ADDRESS = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";
  const resourceID_USDC = Helpers.createResourceID(
    USDC_ADDRESS,
    originDomainID
  );
  const resourceID_Native = "0x0000000000000000000000000000000000000000000000000000000000000650";

  const addressUsdc = "0x7713974908Be4BEd47172370115e8b1219F4A5f0";


  let BridgeInstance;
  let DefaultMessageReceiverInstance;
  let BasicFeeHandlerInstance;
  let ERC20HandlerInstance;
  let NativeTokenAdapterInstance;
  let NativeTokenHandlerInstance;
  let SwapAdapterInstance;
  let usdc;
  let usdcOwner;

  beforeEach(async () => {
    const provider = new Ethers.providers.JsonRpcProvider();
    usdcOwner = await provider.getSigner(USDC_OWNER_ADDRESS);

    BridgeInstance = await Helpers.deployBridge(
        originDomainID,
        accounts[0]
      );
    DefaultMessageReceiverInstance = await DefaultMessageReceiverContract.new([], 100000);
    ERC20HandlerInstance = await ERC20HandlerContract.new(
      BridgeInstance.address,
      DefaultMessageReceiverInstance.address
    );
    FeeHandlerRouterInstance = await FeeHandlerRouterContract.new(
      BridgeInstance.address
    );
    BasicFeeHandlerInstance = await BasicFeeHandlerContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );
    NativeTokenAdapterInstance = await NativeTokenAdapterContract.new(
      BridgeInstance.address,
      resourceID_Native
    );
    NativeTokenHandlerInstance = await NativeTokenHandlerContract.new(
      BridgeInstance.address,
      NativeTokenAdapterInstance.address,
      DefaultMessageReceiverInstance.address
    );
    SwapAdapterInstance = await SwapAdapterContract.new(
      BridgeInstance.address,
      resourceID_Native,
      WETH_ADDRESS,
      UNISWAP_SWAP_ROUTER_ADDRESS,
      NativeTokenAdapterInstance.address
    );
    usdc = await ERC20MintableContract.at(USDC_ADDRESS);

    // TODO: Set resourceIds
  });

  it.only("should swap tokens to ETH and bridge ETH", async () => {
    const pathTokens = [USDC_ADDRESS, WETH_ADDRESS];
    const pathFees = [500, 500];
    const amount = 1000000;
    const amountOutMinimum = Ethers.utils.parseUnits("200000", "gwei");
    await SwapAdapterInstance.setTokenResourceID(USDC_ADDRESS, resourceID_USDC);
    // TODO: impersonate account
    await usdc.approve(SwapAdapterInstance.address, amount, {from: USDC_OWNER_ADDRESS});
    const tx = await SwapAdapterInstance.depositTokensToEth(
      destinationDomainID,
      recipientAddress.address,
      USDC_ADDRESS,
      amount,
      amountOutMinimum,
      pathTokens,
      pathFees,
      {from: USDC_OWNER_ADDRESS}
    );

  });

  it("should swap ETH to tokens and bridge tokens", async () => {
  });
});

