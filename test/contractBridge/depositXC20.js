/**
 * Copyright 2020 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */

const TruffleAssert = require("truffle-assertions");

const Helpers = require("../helpers");

const XC20HandlerContract = artifacts.require("XC20Handler");
const XC20TestContract = artifacts.require("XC20Test");
const XC20TestContractMock = artifacts.require("XC20TestMock");

contract("Bridge - [deposit - XRC20]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const adminAddress = accounts[0];
  const depositorAddress = accounts[1];
  const recipientAddress = accounts[2];

  const originChainInitialTokenAmount = 100;
  const depositAmount = 10;
  const expectedDepositNonce = 1;
  const feeData = "0x";
  const emptySetResourceData = "0x";

  let BridgeInstance;
  let OriginXC20TestInstance;
  let OriginXC20TestInstanceMock;
  let OriginXC20HandlerInstance;
  let depositData;
  let initialResourceIDs;

  beforeEach(async () => {
    await Promise.all([
      (BridgeInstance = await Helpers.deployBridge(
        originDomainID,
        adminAddress
      )),
      XC20TestContract.new().then(
        (instance) => (OriginXC20TestInstance = instance)
      ),
      XC20TestContractMock.new().then(
        (instance) => (OriginXC20TestInstanceMock = instance)
      ),
    ]);

    const resourceID1 = Helpers.createResourceID(
      OriginXC20TestInstance.address,
      originDomainID
    );
    const resourceID2 = Helpers.createResourceID(
      OriginXC20TestInstanceMock.address,
      originDomainID
    );

    initialResourceIDs = [resourceID1, resourceID2];

    OriginXC20HandlerInstance = await XC20HandlerContract.new(
      BridgeInstance.address
    );

    await Promise.all([
      BridgeInstance.adminSetResource(
        OriginXC20HandlerInstance.address,
        initialResourceIDs[0],
        OriginXC20TestInstance.address,
        emptySetResourceData
      ),
      BridgeInstance.adminSetResource(
        OriginXC20HandlerInstance.address,
        initialResourceIDs[1],
        OriginXC20TestInstanceMock.address,
        emptySetResourceData
      ),
      OriginXC20TestInstance.mint(
        depositorAddress,
        originChainInitialTokenAmount
      ),
      OriginXC20TestInstanceMock.mint(
        depositorAddress,
        originChainInitialTokenAmount
      ),
    ]);
    await OriginXC20TestInstance.approve(
      OriginXC20HandlerInstance.address,
      depositAmount,
      {from: depositorAddress}
    );
    await OriginXC20TestInstanceMock.approve(
      OriginXC20HandlerInstance.address,
      depositAmount,
      {from: depositorAddress}
    );

    depositData = Helpers.createERCDepositData(
      depositAmount,
      20,
      recipientAddress
    );

    // set MPC address to unpause the Bridge
    await BridgeInstance.endKeygen(Helpers.mpcAddress);
  });

  describe("lock/release strategy", async () => {
    it("[sanity] test depositorAddress' balance", async () => {
      const originChainDepositorBalance =
        await OriginXC20TestInstance.balanceOf(depositorAddress);
      assert.strictEqual(
        originChainDepositorBalance.toNumber(),
        originChainInitialTokenAmount
      );
    });

    it("XC20 deposit can be made", async () => {
      await TruffleAssert.passes(
        BridgeInstance.deposit(
          destinationDomainID,
          initialResourceIDs[0],
          depositData,
          feeData,
          {from: depositorAddress}
        )
      );
    });

    it("_depositCounts should be increments from 0 to 1", async () => {
      await BridgeInstance.deposit(
        destinationDomainID,
        initialResourceIDs[0],
        depositData,
        feeData,
        {from: depositorAddress}
      );

      const depositCount = await BridgeInstance._depositCounts.call(
        destinationDomainID
      );
      assert.strictEqual(depositCount.toNumber(), expectedDepositNonce);
    });

    it("XC20 can be deposited with correct balances", async () => {
      await BridgeInstance.deposit(
        destinationDomainID,
        initialResourceIDs[0],
        depositData,
        feeData,
        {from: depositorAddress}
      );

      const originChainDepositorBalance =
        await OriginXC20TestInstance.balanceOf(depositorAddress);
      assert.strictEqual(
        originChainDepositorBalance.toNumber(),
        originChainInitialTokenAmount - depositAmount
      );

      const originChainHandlerBalance = await OriginXC20TestInstance.balanceOf(
        OriginXC20HandlerInstance.address
      );
      assert.strictEqual(originChainHandlerBalance.toNumber(), depositAmount);
    });

    it("Deposit event is fired with expected value", async () => {
      // set allowance to 2 * depositAmount since 2 deposits are made in this test
      await OriginXC20TestInstance.approve(
        OriginXC20HandlerInstance.address,
        depositAmount * 2,
        {from: depositorAddress}
      );

      let depositTx = await BridgeInstance.deposit(
        destinationDomainID,
        initialResourceIDs[0],
        depositData,
        feeData,
        {from: depositorAddress}
      );

      TruffleAssert.eventEmitted(depositTx, "Deposit", (event) => {
        return (
          event.destinationDomainID.toNumber() === destinationDomainID &&
          event.resourceID === initialResourceIDs[0].toLowerCase() &&
          event.depositNonce.toNumber() === expectedDepositNonce
        );
      });

      depositTx = await BridgeInstance.deposit(
        destinationDomainID,
        initialResourceIDs[0],
        depositData,
        feeData,
        {from: depositorAddress}
      );

      TruffleAssert.eventEmitted(depositTx, "Deposit", (event) => {
        return (
          event.destinationDomainID.toNumber() === destinationDomainID &&
          event.resourceID === initialResourceIDs[0].toLowerCase() &&
          event.depositNonce.toNumber() === expectedDepositNonce + 1
        );
      });
    });

    it("deposit requires resourceID that is mapped to a handler", async () => {
      await Helpers.expectToRevertWithCustomError(
        BridgeInstance.deposit(
          destinationDomainID,
          "0x0",
          depositData,
          feeData,
          {from: depositorAddress}
        ),
        "ResourceIDNotMappedToHandler()"
      );
    });

    it("Deposit destination domain can not be current bridge domain ", async () => {
      await Helpers.expectToRevertWithCustomError(
        BridgeInstance.deposit(originDomainID, "0x0", depositData, feeData, {
          from: depositorAddress,
        }),
        "DepositToCurrentDomain()"
      );
    });

    it("should if XC20Safe contract call fails", async () => {
      await TruffleAssert.reverts(
        BridgeInstance.deposit(
          destinationDomainID,
          initialResourceIDs[1],
          depositData,
          feeData,
          {from: depositorAddress}
        ),
        "ERC20: operation did not succeed"
      );
    });
  });

  describe("mint/burn strategy", async () => {
    beforeEach(async () => {
      await BridgeInstance.adminSetBurnable(
        OriginXC20HandlerInstance.address,
        OriginXC20TestInstance.address
      );
    });

    it("[sanity] test depositorAddress' balance", async () => {
      const originChainDepositorBalance =
        await OriginXC20TestInstance.balanceOf(depositorAddress);
      assert.strictEqual(
        originChainDepositorBalance.toNumber(),
        originChainInitialTokenAmount
      );
    });

    it("XC20 deposit can be made", async () => {
      await TruffleAssert.passes(
        BridgeInstance.deposit(
          destinationDomainID,
          initialResourceIDs[0],
          depositData,
          feeData,
          {from: depositorAddress}
        )
      );
    });

    it("_depositCounts should be increments from 0 to 1", async () => {
      await BridgeInstance.deposit(
        destinationDomainID,
        initialResourceIDs[0],
        depositData,
        feeData,
        {from: depositorAddress}
      );

      const depositCount = await BridgeInstance._depositCounts.call(
        destinationDomainID
      );
      assert.strictEqual(depositCount.toNumber(), expectedDepositNonce);
    });

    it("XC20 can be deposited with correct balances", async () => {
      await BridgeInstance.deposit(
        destinationDomainID,
        initialResourceIDs[0],
        depositData,
        feeData,
        {from: depositorAddress}
      );

      const originChainDepositorBalance =
        await OriginXC20TestInstance.balanceOf(depositorAddress);
      assert.strictEqual(
        originChainDepositorBalance.toNumber(),
        originChainInitialTokenAmount - depositAmount
      );

      const originChainHandlerAllowance = await OriginXC20TestInstance.allowance(
        depositorAddress,
        OriginXC20HandlerInstance.address
      );
      assert.strictEqual(originChainHandlerAllowance.toNumber(), depositAmount);
    });

    it("Deposit event is fired with expected value", async () => {
      let depositTx = await BridgeInstance.deposit(
        destinationDomainID,
        initialResourceIDs[0],
        depositData,
        feeData,
        {from: depositorAddress}
      );

      TruffleAssert.eventEmitted(depositTx, "Deposit", (event) => {
        return (
          event.destinationDomainID.toNumber() === destinationDomainID &&
          event.resourceID === initialResourceIDs[0].toLowerCase() &&
          event.depositNonce.toNumber() === expectedDepositNonce
        );
      });

      depositTx = await BridgeInstance.deposit(
        destinationDomainID,
        initialResourceIDs[0],
        depositData,
        feeData,
        {from: depositorAddress}
      );

      TruffleAssert.eventEmitted(depositTx, "Deposit", (event) => {
        return (
          event.destinationDomainID.toNumber() === destinationDomainID &&
          event.resourceID === initialResourceIDs[0].toLowerCase() &&
          event.depositNonce.toNumber() === expectedDepositNonce + 1
        );
      });
    });

    it("deposit requires initialResourceIDs[0] that is mapped to a handler", async () => {
      await Helpers.expectToRevertWithCustomError(
        BridgeInstance.deposit(
          destinationDomainID,
          "0x0",
          depositData,
          feeData,
          {from: depositorAddress}
        ),
        "ResourceIDNotMappedToHandler()"
      );
    });

    it("Deposit destination domain can not be current bridge domain ", async () => {
      await Helpers.expectToRevertWithCustomError(
        BridgeInstance.deposit(originDomainID, "0x0", depositData, feeData, {
          from: depositorAddress,
        }),
        "DepositToCurrentDomain()"
      );
    });
  });
});
