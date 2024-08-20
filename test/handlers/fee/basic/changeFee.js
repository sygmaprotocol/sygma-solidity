// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");

const Helpers = require("../../../helpers");

const BasicFeeHandlerContract = artifacts.require("BasicFeeHandler");
const FeeHandlerRouterContract = artifacts.require("FeeHandlerRouter");
const ERC20MintableContract = artifacts.require("ERC20PresetMinterPauser");

contract("BasicFeeHandler - [changeFee]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const nonAdmin = accounts[1];

  const assertOnlyAdmin = (method, ...params) => {
    return Helpers.reverts(
      method(...params, {from: nonAdmin}),
      "sender doesn't have admin role"
    );
  };

  let BridgeInstance;
  let OriginERC20MintableInstance;
  let resourceID;


  beforeEach(async () => {
    BridgeInstance = await Helpers.deployBridge(originDomainID, accounts[0]);
    FeeHandlerRouterInstance = await FeeHandlerRouterContract.new(
      BridgeInstance.address
    );

    OriginERC20MintableInstance = await ERC20MintableContract.new("token", "TOK")
    resourceID = Helpers.createResourceID(
      OriginERC20MintableInstance.address,
      originDomainID
    )
  });

  it("[sanity] contract should be deployed successfully", async () => {
    TruffleAssert.passes(
      await BasicFeeHandlerContract.new(
        BridgeInstance.address,
        FeeHandlerRouterInstance.address
      )
    );
  });

  it("should set fee", async () => {
    const BasicFeeHandlerInstance = await BasicFeeHandlerContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );
    const fee = Ethers.utils.parseEther("0.05");
    const tx = await BasicFeeHandlerInstance.changeFee(destinationDomainID, resourceID, fee);
    TruffleAssert.eventEmitted(
      tx,
      "FeeChanged",
      (event) => web3.utils.fromWei(event.newFee, "ether") === "0.05"
    );
    const newFee = await BasicFeeHandlerInstance._domainResourceIDToFee(destinationDomainID, resourceID);
    assert.equal(web3.utils.fromWei(newFee, "ether"), "0.05");
  });

  it("should not set the same fee", async () => {
    const BasicFeeHandlerInstance = await BasicFeeHandlerContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );
    await Helpers.reverts(
      BasicFeeHandlerInstance.changeFee(destinationDomainID, resourceID, 0),
      "Current fee is equal to new fee"
    );
  });

  it("should require admin role to change fee", async () => {
    const BasicFeeHandlerInstance = await BasicFeeHandlerContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );
    await assertOnlyAdmin(BasicFeeHandlerInstance.changeFee, destinationDomainID, resourceID, 1);
  });
});
