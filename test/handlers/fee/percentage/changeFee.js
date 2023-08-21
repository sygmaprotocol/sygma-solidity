// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");

const Helpers = require("../../../helpers");

const PercentageFeeHandlerContract = artifacts.require("PercentageFeeHandler");
const FeeHandlerRouterContract = artifacts.require("FeeHandlerRouter");

contract("PercentageFeeHandler - [change fee and bounds]", async (accounts) => {
  const domainID = 1;
  const nonAdmin = accounts[1];

  const assertOnlyAdmin = (method, ...params) => {
    return TruffleAssert.reverts(
      method(...params, {from: nonAdmin}),
      "sender doesn't have admin role"
    );
  };

  let BridgeInstance;

  beforeEach(async () => {
    BridgeInstance = await Helpers.deployBridge(domainID, accounts[0]);
    FeeHandlerRouterInstance = await FeeHandlerRouterContract.new(
      BridgeInstance.address
    );
  });

  it("[sanity] contract should be deployed successfully", async () => {
    TruffleAssert.passes(
      await PercentageFeeHandlerContract.new(
        BridgeInstance.address,
        FeeHandlerRouterInstance.address
      )
    );
  });

  it("should set fee", async () => {
    const PercentageFeeHandlerInstance = await PercentageFeeHandlerContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );
    const fee = Ethers.utils.parseUnits("25");
    const tx = await PercentageFeeHandlerInstance.changeFee(fee);
    TruffleAssert.eventEmitted(
      tx,
      "FeeChanged",
      (event) => {
        return Ethers.utils.formatUnits(event.newFee.toString()) === "25.0"
      }
    );
    const newFee = await PercentageFeeHandlerInstance._fee.call();
    assert.equal(Ethers.utils.formatUnits(newFee.toString()), "25.0");
  });

  it("should not set the same fee", async () => {
    const PercentageFeeHandlerInstance = await PercentageFeeHandlerContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );
    await TruffleAssert.reverts(
      PercentageFeeHandlerInstance.changeFee(0),
      "Current fee is equal to new fee"
    );
  });

  it("should require admin role to change fee", async () => {
    const PercentageFeeHandlerInstance = await PercentageFeeHandlerContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );
    await assertOnlyAdmin(PercentageFeeHandlerInstance.changeFee, 1);
  });

  it("should set fee bounds", async () => {
    const PercentageFeeHandlerInstance = await PercentageFeeHandlerContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );
    const tx = await PercentageFeeHandlerInstance.changeFeeBounds(50, 100);
    TruffleAssert.eventEmitted(
      tx,
      "FeeBoundsChanged",
      (event) => {
        return event.newLowerBound.toString() === "50" &&
        event.newUpperBound.toString() === "100"
      }
    );
    const newLowerBound = await PercentageFeeHandlerInstance._lowerBound.call();
    const newUpperBound = await PercentageFeeHandlerInstance._upperBound.call();
    assert.equal(newLowerBound.toString(), "50");
    assert.equal(newUpperBound.toString(), "100");
  });

  it("should not set the same fee bounds", async () => {
    const PercentageFeeHandlerInstance = await PercentageFeeHandlerContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );
    await PercentageFeeHandlerInstance.changeFeeBounds(25, 50)
    await TruffleAssert.reverts(
      PercentageFeeHandlerInstance.changeFeeBounds(25, 65),
      "Current bounds are equal to new bounds"
    );
  });

  it("should require admin role to change fee bunds", async () => {
    const PercentageFeeHandlerInstance = await PercentageFeeHandlerContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );
    await assertOnlyAdmin(PercentageFeeHandlerInstance.changeFeeBounds, 50, 100);
  });
});
