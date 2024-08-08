// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");

const Helpers = require("../../../helpers");

const PercentageFeeHandlerContract = artifacts.require("PercentageERC20FeeHandler");
const FeeHandlerRouterContract = artifacts.require("FeeHandlerRouter");
const ERC20MintableContract = artifacts.require("ERC20PresetMinterPauser");


contract("PercentageFeeHandler - [change fee and bounds]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const nonAdmin = accounts[1];

  let resourceID;

  const assertOnlyAdmin = (method, ...params) => {
    return Helpers.reverts(
      method(...params, {from: nonAdmin}),
      "sender doesn't have admin role"
    );
  };

  let BridgeInstance;

  beforeEach(async () => {
    await Promise.all([
      (BridgeInstance = await Helpers.deployBridge(
        originDomainID,
        accounts[0]
      )),
      ERC20MintableContract.new("token", "TOK").then(
        (instance) => (ERC20MintableInstance = instance)
      ),
    ]);

    FeeHandlerRouterInstance = await FeeHandlerRouterContract.new(
      BridgeInstance.address
    );

    resourceID = Helpers.createResourceID(
      ERC20MintableInstance.address,
      originDomainID
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
    const tx = await PercentageFeeHandlerInstance.changeFee(destinationDomainID, resourceID, fee);
    TruffleAssert.eventEmitted(
      tx,
      "FeeChanged",
      (event) => {
        return Ethers.utils.formatUnits(event.newFee.toString()) === "25.0"
      }
    );
    const newFee = await PercentageFeeHandlerInstance._domainResourceIDToFee(destinationDomainID, resourceID);
    assert.equal(Ethers.utils.formatUnits(newFee.toString()), "25.0");
  });

  it("should not set the same fee", async () => {
    const PercentageFeeHandlerInstance = await PercentageFeeHandlerContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );
    await Helpers.reverts(
      PercentageFeeHandlerInstance.changeFee(destinationDomainID, resourceID, 0),
      "Current fee is equal to new fee"
    );
  });

  it("should require admin role to change fee", async () => {
    const PercentageFeeHandlerInstance = await PercentageFeeHandlerContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );
    await assertOnlyAdmin(PercentageFeeHandlerInstance.changeFee, destinationDomainID, resourceID, 1);
  });

  it("should set fee bounds", async () => {
    const PercentageFeeHandlerInstance = await PercentageFeeHandlerContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );
    const tx = await PercentageFeeHandlerInstance.changeFeeBounds(resourceID, 50, 100);
    TruffleAssert.eventEmitted(
      tx,
      "FeeBoundsChanged",
      (event) => {
        return event.newLowerBound.toString() === "50" &&
        event.newUpperBound.toString() === "100"
      }
    );
    const newLowerBound = (await PercentageFeeHandlerInstance._resourceIDToFeeBounds.call(resourceID)).lowerBound
    const newUpperBound = (await PercentageFeeHandlerInstance._resourceIDToFeeBounds.call(resourceID)).upperBound
    assert.equal(newLowerBound.toString(), "50");
    assert.equal(newUpperBound.toString(), "100");
  });

  it("should not set the same fee bounds", async () => {
    const PercentageFeeHandlerInstance = await PercentageFeeHandlerContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );
    await PercentageFeeHandlerInstance.changeFeeBounds(resourceID, 25, 50)
    await Helpers.reverts(
      PercentageFeeHandlerInstance.changeFeeBounds(resourceID, 25, 50),
      "Current bounds are equal to new bounds"
    );
  });

  it("should fail to set lower bound larger than upper bound ", async () => {
    const PercentageFeeHandlerInstance = await PercentageFeeHandlerContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );
    await Helpers.reverts(
      PercentageFeeHandlerInstance.changeFeeBounds(resourceID, 50, 25),
      "Upper bound must be larger than lower bound or 0"
    );
  });

  it("should set only lower bound", async () => {
    const newLowerBound = 30;
    const PercentageFeeHandlerInstance = await PercentageFeeHandlerContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );
    await PercentageFeeHandlerInstance.changeFeeBounds(resourceID, 25, 50);
    await PercentageFeeHandlerInstance.changeFeeBounds(resourceID, newLowerBound, 50);
    const currentLowerBound = (await PercentageFeeHandlerInstance._resourceIDToFeeBounds.call(resourceID)).lowerBound;
    assert.equal(currentLowerBound, newLowerBound);
  });

  it("should set only upper bound", async () => {
    const newUpperBound = 100;
    const PercentageFeeHandlerInstance = await PercentageFeeHandlerContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );
    await PercentageFeeHandlerInstance.changeFeeBounds(resourceID, 25, 50);
    await PercentageFeeHandlerInstance.changeFeeBounds(resourceID, 25, newUpperBound);
    const currentUpperBound = (await PercentageFeeHandlerInstance._resourceIDToFeeBounds.call(resourceID)).upperBound;
    assert.equal(newUpperBound, currentUpperBound);
  });

  it("should require admin role to change fee bunds", async () => {
    const PercentageFeeHandlerInstance = await PercentageFeeHandlerContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );
    await assertOnlyAdmin(PercentageFeeHandlerInstance.changeFeeBounds, resourceID, 50, 100);
  });
});
