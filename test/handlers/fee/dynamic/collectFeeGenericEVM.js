/**
 * Copyright 2022 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");

const Helpers = require("../../../helpers");

const PermissionlessGenericHandlerContract = artifacts.require("PermissionlessGenericHandler");
const DynamicGenericFeeHandlerEVMContract = artifacts.require("DynamicGenericFeeHandlerEVM");
const FeeHandlerRouterContract = artifacts.require("FeeHandlerRouter");
const TestStoreContract = artifacts.require("TestStore");


contract("DynamicGenericFeeHandlerEVM - [collectFee]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const sender = accounts[0];
  const oracle = new Ethers.Wallet.createRandom();
  const tokenAmount = Ethers.utils.parseEther("1");
  const depositorAddress = accounts[1];

  const emptySetResourceData = "0x";
  const destinationMaxFee = 2000000;
  const msgGasLimit = 2300000;
  const hashOfTestStore = Ethers.utils.keccak256("0xc0ffee");

  let BridgeInstance;
  let DynamicGenericFeeHandlerEVMInstance;
  let FeeHandlerRouterInstance;
  let PermissionlessGenericHandlerInstance;
  let TestStoreInstance;

  let resourceID;
  let depositData;
  let depositFunctionSignature;

  /*
        feeData structure:
            ber*10^18:      uint256
            ter*10^18:      uint256
            dstGasPrice:    uint256
            expiresAt:      uint256
            fromDomainID:   uint8 encoded as uint256
            toDomainID:     uint8 encoded as uint256
            resourceID:     bytes32
            msgGasLimit:    uint256
            sig:            bytes(65 bytes)

        total in bytes:
        message:
            32 * 8  = 256
        message + sig:
            256 + 65 = 321

            amount: uint256
        total feeData length: 353
    */

  beforeEach(async () => {
    await Promise.all([
      (BridgeInstance = await Helpers.deployBridge(
        originDomainID,
        accounts[0]
      ))
    ]);

    PermissionlessGenericHandlerInstance = await PermissionlessGenericHandlerContract.new(
      BridgeInstance.address
    );
    FeeHandlerRouterInstance = await FeeHandlerRouterContract.new(
      BridgeInstance.address
    );
    DynamicGenericFeeHandlerEVMInstance = await DynamicGenericFeeHandlerEVMContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );
    TestStoreInstance = await TestStoreContract.new();

    resourceID = Helpers.createResourceID(
      TestStoreInstance.address,
      originDomainID
    );

    depositFunctionSignature = Helpers.getFunctionSignature(
      TestStoreInstance,
      "storeWithDepositor"
    );

    await Promise.all([
      BridgeInstance.adminSetResource(
        PermissionlessGenericHandlerInstance.address,
        resourceID,
        TestStoreInstance.address,
        emptySetResourceData
      ),
      BridgeInstance.adminChangeFeeHandler(FeeHandlerRouterInstance.address),
      FeeHandlerRouterInstance.adminSetResourceHandler(
        destinationDomainID,
        resourceID,
        DynamicGenericFeeHandlerEVMInstance.address
      ),
    ]);

    depositData = Helpers.createPermissionlessGenericDepositData(
      depositFunctionSignature,
      TestStoreInstance.address,
      destinationMaxFee,
      depositorAddress,
      hashOfTestStore
    );

    await DynamicGenericFeeHandlerEVMInstance.setFeeOracle(oracle.address);

    // set MPC address to unpause the Bridge
    await BridgeInstance.endKeygen(Helpers.mpcAddress);
  });

  it("should collect fee in native tokens", async () => {
    const oracleResponse = {
      ber: Ethers.utils.parseEther("0.000533"),
      ter: Ethers.utils.parseEther("1.63934"),
      dstGasPrice: Ethers.utils.parseUnits("30000000000", "wei"),
      expiresAt: Math.floor(new Date().valueOf() / 1000) + 500,
      fromDomainID: originDomainID,
      toDomainID: destinationDomainID,
      resourceID,
      msgGasLimit,
    };

    const feeData = Helpers.createOracleFeeData(
      oracleResponse,
      oracle.privateKey,
      tokenAmount
    );

    const {fee} = await FeeHandlerRouterInstance.calculateFee.call(
      sender,
      originDomainID,
      destinationDomainID,
      resourceID,
      depositData,
      feeData
    );

    const balanceBefore = await web3.eth.getBalance(
      DynamicGenericFeeHandlerEVMInstance.address
    );

    const depositTx = await BridgeInstance.deposit(
      destinationDomainID,
      resourceID,
      depositData,
      feeData,
      {
        from: depositorAddress,
        value: Ethers.utils.parseEther("0.000036777"),
      }
    );

    TruffleAssert.eventEmitted(depositTx, "Deposit", (event) => {
      return (
        event.destinationDomainID.toNumber() === destinationDomainID &&
        event.resourceID === resourceID.toLowerCase()
      );
    });

    const internalTx = await TruffleAssert.createTransactionResult(
      DynamicGenericFeeHandlerEVMInstance,
      depositTx.tx
    );

    TruffleAssert.eventEmitted(internalTx, "FeeCollected", (event) => {
      return (
        event.sender === depositorAddress &&
        event.fromDomainID.toNumber() === originDomainID &&
        event.destinationDomainID.toNumber() === destinationDomainID &&
        event.resourceID === resourceID.toLowerCase() &&
        event.fee.toString() === fee.toString() &&
        event.tokenAddress === Ethers.constants.AddressZero
      );
    });
    const balanceAfter = await web3.eth.getBalance(
      DynamicGenericFeeHandlerEVMInstance.address
    );

    assert.equal(balanceAfter, Ethers.BigNumber.from(fee.toString()).add(balanceBefore).toString());
  });

  it("deposit should revert if invalid fee (msg.value) amount supplied", async () => {
    const oracleResponse = {
      ber: Ethers.utils.parseEther("0.000533"),
      ter: Ethers.utils.parseEther("1.63934"),
      dstGasPrice: Ethers.utils.parseUnits("30000000000", "wei"),
      expiresAt: Math.floor(new Date().valueOf() / 1000) + 500,
      fromDomainID: originDomainID,
      toDomainID: destinationDomainID,
      resourceID,
      msgGasLimit,
    };

    const feeData = Helpers.createOracleFeeData(
      oracleResponse,
      oracle.privateKey,
      tokenAmount
    );

    await TruffleAssert.reverts(
      BridgeInstance.deposit(
        destinationDomainID,
        resourceID,
        depositData,
        feeData,
        {
          from: depositorAddress,
          value: Ethers.utils.parseEther("1.0"),
        }
      ),
      "Incorrect fee supplied"
    );
  });

  it("deposit should revert if fee collection fails", async () => {
    const oracleResponse = {
      ber: Ethers.utils.parseEther("0.000533"),
      ter: Ethers.utils.parseEther("1.63934"),
      dstGasPrice: Ethers.utils.parseUnits("30000000000", "wei"),
      expiresAt: Math.floor(new Date().valueOf() / 1000) + 500,
      fromDomainID: originDomainID,
      toDomainID: originDomainID,
      resourceID,
      msgGasLimit,
    };

    const feeData = Helpers.createOracleFeeData(
      oracleResponse,
      oracle.privateKey,
      tokenAmount
    );

    await TruffleAssert.reverts(
      BridgeInstance.deposit(
        destinationDomainID,
        resourceID,
        depositData,
        feeData,
        {
          from: depositorAddress,
          value: Ethers.utils.parseEther("0.5").toString(),
        }
      )
    );
  });

  it("deposit should revert if not called by router on DynamicFeeHandler contract", async () => {
    const oracleResponse = {
      ber: Ethers.utils.parseEther("0.000533"),
      ter: Ethers.utils.parseEther("1.63934"),
      dstGasPrice: Ethers.utils.parseUnits("30000000000", "wei"),
      expiresAt: Math.floor(new Date().valueOf() / 1000) + 500,
      fromDomainID: originDomainID,
      toDomainID: destinationDomainID,
      resourceID,
      msgGasLimit,
    };

    const feeData = Helpers.createOracleFeeData(
      oracleResponse,
      oracle.privateKey,
      tokenAmount
    );

    await TruffleAssert.reverts(
      DynamicGenericFeeHandlerEVMInstance.collectFee(
        depositorAddress,
        originDomainID,
        destinationDomainID,
        resourceID,
        depositData,
        feeData,
        {
          from: depositorAddress,
          value: Ethers.utils.parseEther("0.5").toString(),
        }
      ),
      "sender must be bridge or fee router contract"
    );
  });

  it("deposit should revert if not called by bridge on FeeHandlerRouter contract", async () => {
    const oracleResponse = {
      ber: Ethers.utils.parseEther("0.000533"),
      ter: Ethers.utils.parseEther("1.63934"),
      dstGasPrice: Ethers.utils.parseUnits("30000000000", "wei"),
      expiresAt: Math.floor(new Date().valueOf() / 1000) + 500,
      fromDomainID: originDomainID,
      toDomainID: destinationDomainID,
      resourceID,
      msgGasLimit,
    };

    const feeData = Helpers.createOracleFeeData(
      oracleResponse,
      oracle.privateKey,
      tokenAmount
    );

    await TruffleAssert.reverts(
      FeeHandlerRouterInstance.collectFee(
        depositorAddress,
        originDomainID,
        destinationDomainID,
        resourceID,
        depositData,
        feeData,
        {
          from: depositorAddress,
          value: Ethers.utils.parseEther("0.5").toString(),
        }
      ),
      "sender must be bridge contract"
    );
  });

  it("should successfully change fee handler from FeeRouter to DynamicFeeHandler and collect fee", async () => {
    await BridgeInstance.adminChangeFeeHandler(
      DynamicGenericFeeHandlerEVMInstance.address
    );

    const oracleResponse = {
      ber: Ethers.utils.parseEther("0.000533"),
      ter: Ethers.utils.parseEther("1.63934"),
      dstGasPrice: Ethers.utils.parseUnits("30000000000", "wei"),
      expiresAt: Math.floor(new Date().valueOf() / 1000) + 500,
      fromDomainID: originDomainID,
      toDomainID: destinationDomainID,
      resourceID,
      msgGasLimit,
    };

    const feeData = Helpers.createOracleFeeData(
      oracleResponse,
      oracle.privateKey,
      tokenAmount
    );

    const {fee} = await FeeHandlerRouterInstance.calculateFee.call(
      sender,
      originDomainID,
      destinationDomainID,
      resourceID,
      depositData,
      feeData
    );

    const balanceBefore = await web3.eth.getBalance(
      DynamicGenericFeeHandlerEVMInstance.address
    );

    const depositTx = await BridgeInstance.deposit(
      destinationDomainID,
      resourceID,
      depositData,
      feeData,
      {
        from: depositorAddress,
        value: Ethers.utils.parseEther("0.000036777"),
      }
    );

    TruffleAssert.eventEmitted(depositTx, "Deposit", (event) => {
      return (
        event.destinationDomainID.toNumber() === destinationDomainID &&
        event.resourceID === resourceID.toLowerCase()
      );
    });

    const internalTx = await TruffleAssert.createTransactionResult(
      DynamicGenericFeeHandlerEVMInstance,
      depositTx.tx
    );

    TruffleAssert.eventEmitted(internalTx, "FeeCollected", (event) => {
      return (
        event.sender === depositorAddress &&
        event.fromDomainID.toNumber() === originDomainID &&
        event.destinationDomainID.toNumber() === destinationDomainID &&
        event.resourceID === resourceID.toLowerCase() &&
        event.fee.toString() === fee.toString() &&
        event.tokenAddress === Ethers.constants.AddressZero
      );
    });
    const balanceAfter = await web3.eth.getBalance(
      DynamicGenericFeeHandlerEVMInstance.address
    );

    assert.equal(balanceAfter, Ethers.BigNumber.from(fee.toString()).add(balanceBefore).toString());
  });
});
