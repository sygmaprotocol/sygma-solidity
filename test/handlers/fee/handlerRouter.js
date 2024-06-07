// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const Ethers = require("ethers");

const TruffleAssert = require("truffle-assertions");

const Helpers = require("../../helpers");

const BasicFeeHandlerContract = artifacts.require("BasicFeeHandler");
const FeeHandlerRouterContract = artifacts.require("FeeHandlerRouter");
const ERC20MintableContract = artifacts.require("ERC20PresetMinterPauser");

contract("FeeHandlerRouter", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const feeData = "0x0";
  const nonAdmin = accounts[1];
  const whitelistAddress = accounts[2];
  const nonWhitelistAddress = accounts[3];
  const recipientAddress = accounts[3];
  const bridgeAddress = accounts[4];

  const assertOnlyAdmin = (method, ...params) => {
    return TruffleAssert.reverts(
      method(...params, {from: nonAdmin}),
      "sender doesn't have admin role"
    );
  };

  let FeeHandlerRouterInstance;
  let BasicFeeHandlerInstance;
  let ERC20MintableInstance;
  let resourceID;

  beforeEach(async () => {
    await Promise.all([
      ERC20MintableContract.new("token", "TOK").then(
        (instance) => (ERC20MintableInstance = instance)
      ),
    ]);

    FeeHandlerRouterInstance = await FeeHandlerRouterContract.new(
      bridgeAddress
    );
    BasicFeeHandlerInstance = await BasicFeeHandlerContract.new(
      bridgeAddress,
      FeeHandlerRouterInstance.address
    );

    resourceID = Helpers.createResourceID(
      ERC20MintableInstance.address,
      originDomainID
    );
  });

  it("[sanity] should return fee handler router type", async () => {
    assert.equal(await FeeHandlerRouterInstance.feeHandlerType.call(), "router");
  });

  it("should successfully set handler to resourceID", async () => {
    const feeHandlerAddress = accounts[1];
    assert.equal(
      await FeeHandlerRouterInstance._domainResourceIDToFeeHandlerAddress.call(
        destinationDomainID,
        resourceID
      ),
      "0x0000000000000000000000000000000000000000"
    );
    await FeeHandlerRouterInstance.adminSetResourceHandler(
      destinationDomainID,
      resourceID,
      feeHandlerAddress
    );
    const newFeeHandler =
      await FeeHandlerRouterInstance._domainResourceIDToFeeHandlerAddress(
        destinationDomainID,
        resourceID
      );
    assert.equal(newFeeHandler, feeHandlerAddress);
  });

  it("should require admin role to set handler for resourceID", async () => {
    const feeHandlerAddress = accounts[1];
    await assertOnlyAdmin(
      FeeHandlerRouterInstance.adminSetResourceHandler,
      destinationDomainID,
      resourceID,
      feeHandlerAddress
    );
  });

  it("should successfully set whitelist on an address", async () => {
    assert.equal(
      await FeeHandlerRouterInstance._whitelist.call(
        whitelistAddress
      ),
      false
    );

    const whitelistTx = await FeeHandlerRouterInstance.adminSetWhitelist(
      whitelistAddress,
      true
    );
    assert.equal(
      await FeeHandlerRouterInstance._whitelist.call(
        whitelistAddress
      ),
      true
    );
    TruffleAssert.eventEmitted(whitelistTx, "WhitelistChanged", (event) => {
      return (
        event.whitelistAddress === whitelistAddress &&
        event.isWhitelisted === true
      );
    });
  });

  it("should require admin role to set whitelist address", async () => {
    await assertOnlyAdmin(
      FeeHandlerRouterInstance.adminSetWhitelist,
      whitelistAddress,
      true
    );
  });

  it("should return fee 0 if address whitelisted", async () => {
    await FeeHandlerRouterInstance.adminSetWhitelist(
      whitelistAddress,
      true
    );
    await FeeHandlerRouterInstance.adminSetResourceHandler(
      destinationDomainID,
      resourceID,
      BasicFeeHandlerInstance.address
    );
    await BasicFeeHandlerInstance.changeFee(destinationDomainID, resourceID, Ethers.utils.parseEther("0.5"));

    const depositData = Helpers.createERCDepositData(100, 20, recipientAddress);
    let res = await FeeHandlerRouterInstance.calculateFee.call(
      whitelistAddress,
      originDomainID,
      destinationDomainID,
      resourceID,
      depositData,
      feeData
    );
    assert.equal(web3.utils.fromWei(res[0], "ether"), "0")
    res = await FeeHandlerRouterInstance.calculateFee.call(
      nonWhitelistAddress,
      originDomainID,
      destinationDomainID,
      resourceID,
      depositData,
      feeData
    );
    assert.equal(web3.utils.fromWei(res[0], "ether"), "0.5")
  });

  it("should revert if whitelisted address provides fee", async () => {
    await FeeHandlerRouterInstance.adminSetWhitelist(
      whitelistAddress,
      true
    );
    await FeeHandlerRouterInstance.adminSetResourceHandler(
      destinationDomainID,
      resourceID,
      BasicFeeHandlerInstance.address
    );
    await BasicFeeHandlerInstance.changeFee(destinationDomainID, resourceID, Ethers.utils.parseEther("0.5"));

    const depositData = Helpers.createERCDepositData(100, 20, recipientAddress);
    await Helpers.expectToRevertWithCustomError(
      FeeHandlerRouterInstance.collectFee(
        whitelistAddress,
        originDomainID,
        destinationDomainID,
        resourceID,
        depositData,
        feeData,
        {
          from: bridgeAddress,
          value: Ethers.utils.parseEther("0.5").toString()
        }
      ),
      "IncorrectFeeSupplied(uint256)"
    );
    await TruffleAssert.passes(
      FeeHandlerRouterInstance.collectFee(
        nonWhitelistAddress,
        originDomainID,
        destinationDomainID,
        resourceID,
        depositData,
        feeData,
        {
          from: bridgeAddress,
          value: Ethers.utils.parseEther("0.5").toString()
        }
      ),
    );
  });

  it("should not collect fee from whitelisted address", async () => {
    await FeeHandlerRouterInstance.adminSetWhitelist(
      whitelistAddress,
      true
    );
    await FeeHandlerRouterInstance.adminSetResourceHandler(
      destinationDomainID,
      resourceID,
      BasicFeeHandlerInstance.address
    );
    await BasicFeeHandlerInstance.changeFee(destinationDomainID, resourceID, Ethers.utils.parseEther("0.5"));

    const depositData = Helpers.createERCDepositData(100, 20, recipientAddress);
    await TruffleAssert.passes(
      FeeHandlerRouterInstance.collectFee(
        whitelistAddress,
        originDomainID,
        destinationDomainID,
        resourceID,
        depositData,
        feeData,
        {
          from: bridgeAddress,
          value: "0"
        }
      ),
    );
  });
});
