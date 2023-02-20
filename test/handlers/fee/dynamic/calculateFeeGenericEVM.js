/**
 * Copyright 2022 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");

const Helpers = require("../../../helpers");

const ERC20MintableContract = artifacts.require("ERC20PresetMinterPauser");
const ERC20HandlerContract = artifacts.require("ERC20Handler");
const DynamicGenericFeeHandlerEVMContract = artifacts.require("DynamicGenericFeeHandlerEVM");
const FeeHandlerRouterContract = artifacts.require("FeeHandlerRouter");

contract("DynamicGenericFeeHandlerEVM - [calculateFee]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 1;
  const oracle = new Ethers.Wallet.createRandom();
  const sender = accounts[0];
  const recipientAddress = accounts[1];
  const gasUsed = 100000;
  const feePercent = 0;
  const emptySetResourceData = "0x";
  const msgGasLimit = 2300000;
  const ter = 0; // Not used
  const feeDataAmount = 0; // Not used

  let BridgeInstance;
  let DynamicGenericFeeHandlerEVMInstance;
  let resourceID;
  let FeeHandlerRouterInstance;

  /**
      Message:
      ber * 10^18:  uint256
      ter * 10^18:  uint256 (not used)
      dstGasPrice:  uint256
      expiresAt:    uint256
      fromDomainID: uint8 encoded as uint256
      toDomainID:   uint8 encoded as uint256
      resourceID:   bytes32
      msgGasLimit:  uint256
      sig:          bytes(65 bytes)

      total in bytes:
      message:
      32 * 8  = 256
      message + sig:
      256 + 65 = 321

      amount: uint256 (not used)
      total: 353
  */

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

    ERC20HandlerInstance = await ERC20HandlerContract.new(
      BridgeInstance.address
    );
    FeeHandlerRouterInstance = await FeeHandlerRouterContract.new(
      BridgeInstance.address
    );
    DynamicGenericFeeHandlerEVMInstance = await DynamicGenericFeeHandlerEVMContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );

    resourceID = Helpers.createResourceID(
      ERC20MintableInstance.address,
      originDomainID
    );

    await Promise.all([
      DynamicGenericFeeHandlerEVMInstance.setFeeOracle(oracle.address),
      DynamicGenericFeeHandlerEVMInstance.setFeeProperties(gasUsed, feePercent),
      BridgeInstance.adminSetResource(
        ERC20HandlerInstance.address,
        resourceID,
        ERC20MintableInstance.address,
        emptySetResourceData
      ),
      BridgeInstance.adminChangeFeeHandler(FeeHandlerRouterInstance.address),
      FeeHandlerRouterInstance.adminSetResourceHandler(
        destinationDomainID,
        resourceID,
        DynamicGenericFeeHandlerEVMInstance.address
      ),
    ]);
  });

  it("should calculate amount of fee with msgGasLimit and return token address", async () => {
    const tokenAmount = 100;
    const depositData = Helpers.createERCDepositData(
      tokenAmount,
      20,
      recipientAddress
    );

    const oracleResponse = {
      ber: Ethers.utils.parseEther("0.000533"),
      ter,
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
      feeDataAmount
    );
    const res = await FeeHandlerRouterInstance.calculateFee.call(
      sender,
      originDomainID,
      destinationDomainID,
      resourceID,
      depositData,
      feeData
    );
    assert.equal(Ethers.utils.formatEther(res.fee.toString()), "0.000036777");
    assert.equal(res.tokenAddress, ERC20MintableInstance.address);
  });

  it("should return percent fee", async () => {
    const feePercent = 1000; // 10%
    await DynamicGenericFeeHandlerEVMInstance.setFeeProperties(gasUsed, feePercent);
    const msgGasLimit = 3000000;
    const tokenAmount = Ethers.utils.parseEther("1");
    const depositData = Helpers.createERCDepositData(
      tokenAmount,
      20,
      recipientAddress
    );
    const oracleResponse = {
      ber: Ethers.utils.parseEther("0.0005"),
      ter,
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
      feeDataAmount
    );
    const res = await FeeHandlerRouterInstance.calculateFee.call(
      sender,
      originDomainID,
      destinationDomainID,
      resourceID,
      depositData,
      feeData
    );
    assert.equal(web3.utils.fromWei(res.fee, "ether"), "0.0000495");
    assert.equal(res.tokenAddress, ERC20MintableInstance.address);
  });

  it("should not calculate fee if fee data is misformed", async () => {
    const tokenAmount = 100;
    const depositData = Helpers.createERCDepositData(
      tokenAmount,
      20,
      recipientAddress
    );

    const oracleResponse = {
      ber: Ethers.utils.parseEther("0.0005"),
      ter,
      dstGasPrice: Ethers.utils.parseUnits("30000000000", "wei"),
      expiresAt: Math.floor(new Date().valueOf() / 1000) + 500,
      fromDomainID: originDomainID,
      toDomainID: destinationDomainID,
      resourceID,
      msgGasLimit,
    };

    const feeData =
      Helpers.createOracleFeeData(
        oracleResponse,
        oracle.privateKey,
        feeDataAmount
      ) + "11";
    await TruffleAssert.reverts(
      FeeHandlerRouterInstance.calculateFee(
        sender,
        originDomainID,
        destinationDomainID,
        resourceID,
        depositData,
        feeData
      ),
      "Incorrect feeData length"
    );
  });

  it("should not calculate fee if deposit data differ from fee data", async () => {
    const otherDestinationDomainID = 3;
    const tokenAmount = 100;
    const depositData = Helpers.createERCDepositData(
      tokenAmount,
      20,
      recipientAddress
    );

    const oracleResponse = {
      ber: Ethers.utils.parseEther("0.0005"),
      ter,
      dstGasPrice: Ethers.utils.parseUnits("30000000000", "wei"),
      expiresAt: Math.floor(new Date().valueOf() / 1000) + 500,
      fromDomainID: originDomainID,
      toDomainID: otherDestinationDomainID,
      resourceID,
      msgGasLimit,
    };

    const feeData = Helpers.createOracleFeeData(
      oracleResponse,
      oracle.privateKey,
      feeDataAmount
    );
    await TruffleAssert.reverts(
      FeeHandlerRouterInstance.calculateFee(
        sender,
        originDomainID,
        destinationDomainID,
        resourceID,
        depositData,
        feeData
      ),
      "Incorrect deposit params"
    );
  });

  it("should not calculate fee if oracle signature is incorrect", async () => {
    const tokenAmount = 100;
    const depositData = Helpers.createERCDepositData(
      tokenAmount,
      20,
      recipientAddress
    );

    const oracleResponse = {
      ber: Ethers.utils.parseEther("0.0005"),
      ter,
      dstGasPrice: Ethers.utils.parseUnits("30000000000", "wei"),
      expiresAt: Math.floor(new Date().valueOf() / 1000) + 500,
      fromDomainID: originDomainID,
      toDomainID: destinationDomainID,
      resourceID,
      msgGasLimit,
    };

    const oracle2 = new Ethers.Wallet.createRandom();

    const feeData = Helpers.createOracleFeeData(
      oracleResponse,
      oracle2.privateKey,
      feeDataAmount
    );
    await TruffleAssert.reverts(
      FeeHandlerRouterInstance.calculateFee(
        sender,
        originDomainID,
        destinationDomainID,
        resourceID,
        depositData,
        feeData
      ),
      "Invalid signature"
    );
  });

  it("should not calculate fee if oracle data are outdated", async () => {
    const gasUsed = 100000;
    const feePercent = 500;
    await DynamicGenericFeeHandlerEVMInstance.setFeeProperties(gasUsed, feePercent);

    const tokenAmount = Ethers.utils.parseEther("1");
    const depositData = Helpers.createERCDepositData(
      tokenAmount,
      20,
      recipientAddress
    );
    const oracleResponse = {
      ber: Ethers.utils.parseEther("0.000533"),
      ter,
      dstGasPrice: Ethers.utils.parseUnits("30000000000", "wei"),
      expiresAt: Math.floor(new Date().valueOf() / 1000) - 500,
      fromDomainID: originDomainID,
      toDomainID: destinationDomainID,
      resourceID,
      msgGasLimit,
    };
    const feeData = Helpers.createOracleFeeData(
      oracleResponse,
      oracle.privateKey,
      feeDataAmount
    );
    await TruffleAssert.reverts(
      FeeHandlerRouterInstance.calculateFee(
        sender,
        originDomainID,
        destinationDomainID,
        resourceID,
        depositData,
        feeData
      ),
      "Obsolete oracle data"
    );
  });

  it("should not calculate amount of fee if msgGasLimit == 0", async () => {
    const tokenAmount = 100;
    const depositData = Helpers.createERCDepositData(
      tokenAmount,
      20,
      recipientAddress
    );

    const oracleResponse = {
      ber: Ethers.utils.parseEther("0.000533"),
      ter,
      dstGasPrice: Ethers.utils.parseUnits("30000000000", "wei"),
      expiresAt: Math.floor(new Date().valueOf() / 1000) + 500,
      fromDomainID: originDomainID,
      toDomainID: destinationDomainID,
      resourceID,
      msgGasLimit: 0,
    };

    const feeData = Helpers.createOracleFeeData(
      oracleResponse,
      oracle.privateKey,
      feeDataAmount
    );
    await TruffleAssert.reverts(
      FeeHandlerRouterInstance.calculateFee(
        sender,
        originDomainID,
        destinationDomainID,
        resourceID,
        depositData,
        feeData
      ),
      "msgGasLimit == 0"
    );
  });
});
