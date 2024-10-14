// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");

const Helpers = require("../test/helpers");

const ERC20MintableContract = artifacts.require("ERC20PresetMinterPauser");
const ERC20HandlerContract = artifacts.require("ERC20Handler");

contract("SwapAdapter - [depositTokensToEth]", async (accounts) => {
  // Fee handler is mocked by BasicFeeHandler
  // deploy bridge, ERC20Handler, NativeTokenHandler, BasicFeeHandler, SwapAdapter
  // use SwapRouter, USDC, WETH, user with USDC, user with ETH from mainnet fork
});

contract("SwapAdapter - [depositEthToTokens]", async (accounts) => {
});
