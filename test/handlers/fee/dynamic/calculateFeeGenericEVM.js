// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");

const Helpers = require("../../../helpers");

const PermissionlessGenericHandlerContract = artifacts.require("PermissionlessGenericHandler");
const DynamicGenericFeeHandlerEVMContract = artifacts.require("DynamicGenericFeeHandlerEVM");
const FeeHandlerRouterContract = artifacts.require("FeeHandlerRouter");
const TestStoreContract = artifacts.require("TestStore");

contract("DynamicGenericFeeHandlerEVM - [calculateFee]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 1;
  const oracle = new Ethers.Wallet.createRandom();
  const sender = accounts[0];
  const depositorAddress = accounts[1];
  const emptySetResourceData = "0x";
  const destinationMaxFee = 2000000;
  const msgGasLimit = 2300000;
  const ter = 0; // Not used
  const feeDataAmount = 0; // Not used
  const hashOfTestStore = Ethers.utils.keccak256("0xc0ffee");


  let BridgeInstance;
  let DynamicGenericFeeHandlerEVMInstance;
  let FeeHandlerRouterInstance;

  let resourceID;
  let depositData;
  let depositFunctionSignature;

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

  });

  it("should calculate amount of fee with msgGasLimit and return zero address as token address", async () => {
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
    assert.equal(res.tokenAddress, Ethers.constants.AddressZero);
  });

  it("should return calculated fee", async () => {
    const msgGasLimit = 3000000;

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
    assert.equal(web3.utils.fromWei(res.fee, "ether"), "0.000045");
    assert.equal(res.tokenAddress, Ethers.constants.AddressZero);
  });

  it("should not calculate fee if fee data is misformed", async () => {
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

  it("should not calculate amount of fee if msgGasLimit == 0", async () => {
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
