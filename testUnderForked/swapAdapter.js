// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");

const Helpers = require("../test/helpers");

const ERC20HandlerContract = artifacts.require("ERC20Handler");
const DefaultMessageReceiverContract = artifacts.require("DefaultMessageReceiver"); 
const FeeHandlerRouterContract = artifacts.require("FeeHandlerRouter"); 
const BasicFeeHandlerContract = artifacts.require("BasicFeeHandler"); 
const NativeTokenHandlerContract = artifacts.require("NativeTokenHandler");  
const SwapAdapterContract = artifacts.require("SwapAdapter");

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
  

  let usdc_owner;
  let eth_owner;

  const addressEth = "0x604981db0C06Ea1b37495265EDa4619c8Eb95A3D";
  

  const addressDai = "0xe5f8086dac91e039b1400febf0ab33ba3487f29a";


  const addressUsdc = "0x7713974908Be4BEd47172370115e8b1219F4A5f0";


  let BridgeInstance;
  let DefaultMessageReceiverInstance;
  let BasicFeeHandlerInstance;
  let ERC20HandlerInstance;
  let NativeTokenHandlerInstance;
  let SwapAdapterInstance;
  let depositData;

  beforeEach(async () => {
    const provider = new Ethers.providers.JsonRpcProvider();
    usdc_owner = await provider.getSigner(USDC_OWNER_ADDRESS);
    buyerForEth = await provider.getSigner(addressEth);
    buyerForDai = await provider.getSigner(addressDai);
    buyerForUsdc = await provider.getSigner(addressUsdc);
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
    NativeTokenHandlerInstance = await NativeTokenHandlerContract.new(
      BridgeInstance.address,
      NativeTokenAdapter, //to deploy
      DefaultMessageReceiverInstance.address
    );
    SwapAdapterInstance = await SwapAdapterContract.new(
      BridgeInstance.address,
      resourceID_Native,
      WETH_ADDRESS,
      UNISWAP_SWAP_ROUTER_ADDRESS
    );
  });

  it.only("should swap tokens to ETH and bridge ETH", async () => {


  });

  it("should swap ETH to tokens and bridge tokens", async () => {
  });
});

