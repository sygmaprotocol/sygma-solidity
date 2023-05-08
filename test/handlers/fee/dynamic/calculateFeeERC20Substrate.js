/**
 * Copyright 2022 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */

const Ethers = require("ethers");

const Helpers = require("../../../helpers");

const ERC20MintableContract = artifacts.require("ERC20PresetMinterPauser");
const ERC20HandlerContract = artifacts.require("ERC20Handler");
const DynamicERC20FeeHandlerSubstrateContract = artifacts.require("DynamicERC20FeeHandlerSubstrate");
const FeeHandlerRouterContract = artifacts.require("FeeHandlerRouter");

contract("DynamicERC20FeeHandlerSubstrate - [calculateFee]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 1;
  const oracle = new Ethers.Wallet.createRandom();
  const sender = accounts[0];
  const recipientAddress = accounts[1];
  const gasUsed = 100000;
  const feePercent = 500;
  const emptySetResourceData = "0x";
  const msgGasLimit = 0;
  const ber = 0;
  const feeDataAmount = 0; // Not used

  let BridgeInstance;
  let DynamicERC20FeeHandlerSubstrateInstance;
  let resourceID;
  let FeeHandlerRouterInstance;

  /**
      Message:
      ber * 10^18:  uint256 (not used)
      ter * 10^18:  uint256
      inclusionFee: uint256
      expiresAt:    uint256
      fromDomainID: uint8 encoded as uint256
      toDomainID:   uint8 encoded as uint256
      resourceID:   bytes32
      msgGasLimit:  uint256 (not used)
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
    DynamicERC20FeeHandlerSubstrateInstance = await DynamicERC20FeeHandlerSubstrateContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );

    resourceID = Helpers.createResourceID(
      ERC20MintableInstance.address,
      originDomainID
    );

    await Promise.all([
      DynamicERC20FeeHandlerSubstrateInstance.setFeeOracle(oracle.address),
      DynamicERC20FeeHandlerSubstrateInstance.setFeeProperties(gasUsed, feePercent),
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
        DynamicERC20FeeHandlerSubstrateInstance.address
      ),
    ]);
  });

  it("should calculate amount of fee and return token address", async () => {
    const tokenAmount = 100;
    const depositData = Helpers.createERCDepositData(
      tokenAmount,
      20,
      recipientAddress
    );

    const oracleResponse = {
      ber,
      ter: Ethers.utils.parseEther("1.63934"),
      // dstGasPrice is used as inclusionFee for Substrate calculations
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
    assert.equal(res.fee.toString(), "49180200000");
    assert.equal(res.tokenAddress, ERC20MintableInstance.address);
  });

  it("should return percent fee", async () => {
    const tokenAmount = Ethers.utils.parseEther("1");
    const depositData = Helpers.createERCDepositData(
      tokenAmount,
      20,
      recipientAddress
    );
    const oracleResponse = {
      ber,
      ter: Ethers.utils.parseEther("1.63934"),
      // dstGasPrice is used as inclusionFee for Substrate calculations
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
    assert.equal(web3.utils.fromWei(res.fee, "ether"), "0.05");
    assert.equal(res.tokenAddress, ERC20MintableInstance.address);
  });

  it("should return fee to cover tx cost if percent fee does not cover tx cost", async () => {
    const tokenAmount = 100;
    const depositData = Helpers.createERCDepositData(
      tokenAmount,
      20,
      recipientAddress
    );

    const oracleResponse = {
      ber,
      ter: Ethers.utils.parseEther("1.5"),
      // dstGasPrice is used as inclusionFee for Substrate calculations
      dstGasPrice: Ethers.utils.parseEther("0.003"),
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
    assert.equal(Ethers.utils.formatEther(res.fee.toString()), "0.0045");
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
      ber,
      ter: Ethers.utils.parseEther("1.5"),
      // dstGasPrice is used as inclusionFee for Substrate calculations
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
    const errorValues = await Helpers.expectToRevertWithCustomError(
      FeeHandlerRouterInstance.calculateFee(
        sender,
        originDomainID,
        destinationDomainID,
        resourceID,
        depositData,
        feeData
      ),
      "IncorrectFeeDataLength(uint256)"
    );

    assert.equal(errorValues[0].toNumber(), feeData.substring(2).length / 2);
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
      ber,
      ter: Ethers.utils.parseEther("1.5"),
      // dstGasPrice is used as inclusionFee for Substrate calculations
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
    const errorValues = await Helpers.expectToRevertWithCustomError(
      FeeHandlerRouterInstance.calculateFee(
        sender,
        originDomainID,
        destinationDomainID,
        resourceID,
        depositData,
        feeData
      ),
      "IncorrectDepositParams(uint8,uint8,bytes32)"
    );

    assert.equal(errorValues[0], originDomainID);
    assert.equal(errorValues[1], otherDestinationDomainID);
    assert.equal(errorValues[2], resourceID);
  });

  it("should not calculate fee if oracle signature is incorrect", async () => {
    const tokenAmount = 100;
    const depositData = Helpers.createERCDepositData(
      tokenAmount,
      20,
      recipientAddress
    );

    const oracleResponse = {
      ber,
      ter: Ethers.utils.parseEther("1.5"),
      // dstGasPrice is used as inclusionFee for Substrate calculations
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
    await Helpers.expectToRevertWithCustomError(
      FeeHandlerRouterInstance.calculateFee(
        sender,
        originDomainID,
        destinationDomainID,
        resourceID,
        depositData,
        feeData
      ),
      "InvalidSignature()"
    );
  });

  it("should not calculate fee if oracle data are outdated", async () => {
    const gasUsed = 100000;
    const feePercent = 500;
    await DynamicERC20FeeHandlerSubstrateInstance.setFeeProperties(gasUsed, feePercent);

    const tokenAmount = Ethers.utils.parseEther("1");
    const depositData = Helpers.createERCDepositData(
      tokenAmount,
      20,
      recipientAddress
    );
    const oracleResponse = {
      ber,
      ter: Ethers.utils.parseEther("1.63934"),
      // dstGasPrice is used as inclusionFee for Substrate calculations
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
    await Helpers.expectToRevertWithCustomError(
      FeeHandlerRouterInstance.calculateFee(
        sender,
        originDomainID,
        destinationDomainID,
        resourceID,
        depositData,
        feeData
      ),
      "ObsoleteOracleData()"
    );
  });
});
