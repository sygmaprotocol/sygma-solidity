/**
 * Copyright 2022 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");

const Helpers = require("../../../helpers");

const ERC20MintableContract = artifacts.require("ERC20PresetMinterPauser");
const ERC20HandlerContract = artifacts.require("ERC20Handler");
const DynamicFeeHandlerContract = artifacts.require("DynamicERC20FeeHandlerEVM");
const FeeHandlerRouterContract = artifacts.require("FeeHandlerRouter");

contract("DynamicERC20FeeHandlerEVM - [collectFee]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const oracle = new Ethers.Wallet.createRandom();
  const recipientAddress = accounts[2];
  const tokenAmount = Ethers.utils.parseEther("1");
  const fee = Ethers.utils.parseEther("0.05");
  const depositorAddress = accounts[1];

  const gasUsed = 100000;
  const feePercent = 500;
  const emptySetResourceData = "0x";
  const msgGasLimit = 0;

  let BridgeInstance;
  let DynamicFeeHandlerInstance;
  let resourceID;
  let depositData;

  let FeeHandlerRouterInstance;
  let ERC20HandlerInstance;
  let ERC20MintableInstance;

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
      )),
      (ERC20MintableInstance = ERC20MintableContract.new(
        "ERC20Token",
        "ERC20TOK"
      ).then((instance) => (ERC20MintableInstance = instance))),
    ]);

    ERC20HandlerInstance = await ERC20HandlerContract.new(
      BridgeInstance.address
    );
    FeeHandlerRouterInstance = await FeeHandlerRouterContract.new(
      BridgeInstance.address
    );
    DynamicFeeHandlerInstance = await DynamicFeeHandlerContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );

    await DynamicFeeHandlerInstance.setFeeOracle(oracle.address);
    await DynamicFeeHandlerInstance.setFeeProperties(gasUsed, feePercent);

    resourceID = Helpers.createResourceID(
      ERC20MintableInstance.address,
      originDomainID
    );

    await Promise.all([
      BridgeInstance.adminSetResource(
        ERC20HandlerInstance.address,
        resourceID,
        ERC20MintableInstance.address,
        emptySetResourceData
      ),
      ERC20MintableInstance.mint(depositorAddress, tokenAmount + fee),
      ERC20MintableInstance.approve(ERC20HandlerInstance.address, tokenAmount, {
        from: depositorAddress,
      }),
      ERC20MintableInstance.approve(DynamicFeeHandlerInstance.address, fee, {
        from: depositorAddress,
      }),
      BridgeInstance.adminChangeFeeHandler(FeeHandlerRouterInstance.address),
      FeeHandlerRouterInstance.adminSetResourceHandler(
        destinationDomainID,
        resourceID,
        DynamicFeeHandlerInstance.address
      ),
    ]);

    depositData = Helpers.createERCDepositData(
      tokenAmount,
      20,
      recipientAddress
    );

    // set MPC address to unpause the Bridge
    await BridgeInstance.endKeygen(Helpers.mpcAddress);
  });

  it("should collect fee in tokens", async () => {
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

    const balanceBefore = (
      await ERC20MintableInstance.balanceOf(
        DynamicFeeHandlerInstance.address
      )
    ).toString();

    const depositTx = await BridgeInstance.deposit(
      destinationDomainID,
      resourceID,
      depositData,
      feeData,
      {
        from: depositorAddress,
      }
    );
    TruffleAssert.eventEmitted(depositTx, "Deposit", (event) => {
      return (
        event.destinationDomainID.toNumber() === destinationDomainID &&
        event.resourceID === resourceID.toLowerCase()
      );
    });
    const internalTx = await TruffleAssert.createTransactionResult(
      DynamicFeeHandlerInstance,
      depositTx.tx
    );
    TruffleAssert.eventEmitted(internalTx, "FeeCollected", (event) => {
      return (
        event.sender === depositorAddress &&
        event.fromDomainID.toNumber() === originDomainID &&
        event.destinationDomainID.toNumber() === destinationDomainID &&
        event.resourceID === resourceID.toLowerCase() &&
        event.fee.toString() === fee.toString() &&
        event.tokenAddress === ERC20MintableInstance.address
      );
    });
    const balanceAfter = (
      await ERC20MintableInstance.balanceOf(
        DynamicFeeHandlerInstance.address
      )
    ).toString();
    assert.equal(balanceAfter, fee.add(balanceBefore).toString());
  });

  it("deposit should revert if msg.value != 0", async () => {
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
          value: Ethers.utils.parseEther("0.5").toString(),
        }
      ),
      "msg.value != 0"
    );
  });

  it("deposit should revert if fee collection fails", async () => {
    const depositData = Helpers.createERCDepositData(
      tokenAmount,
      20,
      recipientAddress
    );
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
    await ERC20MintableInstance.approve(
      DynamicFeeHandlerInstance.address,
      0,
      {from: depositorAddress}
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
    const depositData = Helpers.createERCDepositData(
      tokenAmount,
      20,
      recipientAddress
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
    await ERC20MintableInstance.approve(
      DynamicFeeHandlerInstance.address,
      0,
      {from: depositorAddress}
    );
    await TruffleAssert.reverts(
      DynamicFeeHandlerInstance.collectFee(
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
    const depositData = Helpers.createERCDepositData(
      tokenAmount,
      20,
      recipientAddress
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
    await ERC20MintableInstance.approve(
      DynamicFeeHandlerInstance.address,
      0,
      {from: depositorAddress}
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
      DynamicFeeHandlerInstance.address
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

    const balanceBefore = (
      await ERC20MintableInstance.balanceOf(
        DynamicFeeHandlerInstance.address
      )
    ).toString();

    const depositTx = await BridgeInstance.deposit(
      destinationDomainID,
      resourceID,
      depositData,
      feeData,
      {
        from: depositorAddress,
      }
    );
    TruffleAssert.eventEmitted(depositTx, "Deposit", (event) => {
      return (
        event.destinationDomainID.toNumber() === destinationDomainID &&
        event.resourceID === resourceID.toLowerCase()
      );
    });
    const internalTx = await TruffleAssert.createTransactionResult(
      DynamicFeeHandlerInstance,
      depositTx.tx
    );
    TruffleAssert.eventEmitted(internalTx, "FeeCollected", (event) => {
      return (
        event.sender === depositorAddress &&
        event.fromDomainID.toNumber() === originDomainID &&
        event.destinationDomainID.toNumber() === destinationDomainID &&
        event.resourceID === resourceID.toLowerCase() &&
        event.fee.toString() === fee.toString() &&
        event.tokenAddress === ERC20MintableInstance.address
      );
    });
    const balanceAfter = (
      await ERC20MintableInstance.balanceOf(
        DynamicFeeHandlerInstance.address
      )
    ).toString();
    assert.equal(balanceAfter, fee.add(balanceBefore).toString());
  });
});
