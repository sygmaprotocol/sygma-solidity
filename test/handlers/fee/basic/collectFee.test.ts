// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

import { ethers } from "hardhat";
import { assert, expect } from "chai";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import {
  deployBridge,
  createResourceID,
  createERCDepositData,
} from "../../../helpers";
import type {
  BasicFeeHandler,
  Bridge,
  ERC20Handler,
  ERC20PresetMinterPauser,
  FeeHandlerRouter,
} from "../../../../typechain-types";

describe("BasicFeeHandler - [collectFee]", () => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const depositAmount = 10;
  const feeData = "0x";
  const emptySetResourceData = "0x";
  const expectedDepositNonce = 1;

  let bridgeInstance: Bridge;
  let ERC20MintableInstance: ERC20PresetMinterPauser;
  let basicFeeHandlerInstance: BasicFeeHandler;
  let ERC20HandlerInstance: ERC20Handler;
  let feeHandlerRouterInstance: FeeHandlerRouter;
  let depositorAccount: HardhatEthersSigner;
  let recipientAccount: HardhatEthersSigner;
  let erc20ResourceID: string;
  let erc20depositData: string;

  beforeEach(async () => {
    [, depositorAccount, recipientAccount] = await ethers.getSigners();

    bridgeInstance = await deployBridge(originDomainID);
    const ERC20MintableContract = await ethers.getContractFactory(
      "ERC20PresetMinterPauser",
    );
    ERC20MintableInstance = await ERC20MintableContract.deploy("Token", "TOK");
    const ERC20HandlerContract =
      await ethers.getContractFactory("ERC20Handler");
    ERC20HandlerInstance = await ERC20HandlerContract.deploy(
      await bridgeInstance.getAddress(),
    );
    const FeeHandlerRouterContract =
      await ethers.getContractFactory("FeeHandlerRouter");
    feeHandlerRouterInstance = await FeeHandlerRouterContract.deploy(
      await bridgeInstance.getAddress(),
    );
    const BasicFeeHandlerContract =
      await ethers.getContractFactory("BasicFeeHandler");
    basicFeeHandlerInstance = await BasicFeeHandlerContract.deploy(
      await bridgeInstance.getAddress(),
      await feeHandlerRouterInstance.getAddress(),
    );
    erc20ResourceID = createResourceID(
      await ERC20MintableInstance.getAddress(),
      originDomainID,
    );

    await Promise.all([
      bridgeInstance.adminSetResource(
        await ERC20HandlerInstance.getAddress(),
        erc20ResourceID,
        await ERC20MintableInstance.getAddress(),
        emptySetResourceData,
      ),
      ERC20MintableInstance.mint(depositorAccount, depositAmount),
      ERC20MintableInstance.connect(depositorAccount).approve(
        await ERC20HandlerInstance.getAddress(),
        depositAmount,
      ),
      bridgeInstance.adminChangeFeeHandler(
        await feeHandlerRouterInstance.getAddress(),
      ),
      feeHandlerRouterInstance.adminSetResourceHandler(
        destinationDomainID,
        erc20ResourceID,
        await basicFeeHandlerInstance.getAddress(),
      ),
    ]);

    erc20depositData = createERCDepositData(
      depositAmount,
      20,
      await recipientAccount.getAddress(),
    );
  });

  it("[sanity] ERC20 deposit can be made", async () => {
    await expect(
      bridgeInstance
        .connect(depositorAccount)
        .deposit(
          destinationDomainID,
          erc20ResourceID,
          erc20depositData,
          feeData,
        ),
    ).not.to.be.reverted;
  });

  it("deposit should revert if invalid fee amount supplied", async () => {
    // current fee is set to 0
    assert.deepEqual(await basicFeeHandlerInstance._fee(), BigInt(0));
    const incorrectFee = ethers.parseEther("1.0");

    await expect(
      bridgeInstance
        .connect(depositorAccount)
        .deposit(
          destinationDomainID,
          erc20ResourceID,
          erc20depositData,
          feeData,
          {
            value: incorrectFee,
          },
        ),
    )
      .to.be.revertedWithCustomError(
        basicFeeHandlerInstance,
        "IncorrectFeeSupplied(uint256)",
      )
      .withArgs(incorrectFee);
  });

  it("deposit should pass if valid fee amount supplied for ERC20 deposit", async () => {
    const fee = ethers.parseEther("0.5");
    // current fee is set to 0
    assert.deepEqual(await basicFeeHandlerInstance._fee(), BigInt(0));
    // Change fee to 0.5 ether
    await basicFeeHandlerInstance.changeFee(fee);
    assert.deepEqual(
      ethers.formatEther(await basicFeeHandlerInstance._fee()),
      "0.5",
    );

    const balanceBefore = await ethers.provider.getBalance(
      await basicFeeHandlerInstance.getAddress(),
    );

    const depositTx = bridgeInstance
      .connect(depositorAccount)
      .deposit(
        destinationDomainID,
        erc20ResourceID,
        erc20depositData,
        feeData,
        {
          value: fee,
        },
      );

    await expect(depositTx)
      .to.emit(bridgeInstance, "Deposit")
      .withArgs(
        destinationDomainID,
        erc20ResourceID.toLowerCase(),
        expectedDepositNonce,
        await depositorAccount.getAddress(),
        erc20depositData.toLowerCase(),
        "0x",
      );

    await expect(depositTx)
      .to.emit(basicFeeHandlerInstance, "FeeCollected")
      .withArgs(
        await depositorAccount.getAddress(),
        originDomainID,
        destinationDomainID,
        erc20ResourceID.toLowerCase(),
        fee,
        ethers.ZeroAddress,
      );

    const balanceAfter = await ethers.provider.getBalance(
      await basicFeeHandlerInstance.getAddress(),
    );
    assert.deepEqual(
      balanceAfter,
      BigInt(fee.toString()) + BigInt(balanceBefore),
    );
  });

  it("deposit should revert if fee handler not set and fee supplied", async () => {
    await bridgeInstance.adminChangeFeeHandler(
      "0x0000000000000000000000000000000000000000",
    );

    await expect(
      bridgeInstance
        .connect(depositorAccount)
        .deposit(
          destinationDomainID,
          erc20ResourceID,
          erc20depositData,
          feeData,
          {
            value: ethers.parseEther("1.0"),
          },
        ),
    ).to.be.rejectedWith("no FeeHandler, msg.value != 0");
  });

  it("deposit should pass if fee handler not set and fee not supplied", async () => {
    await expect(
      bridgeInstance
        .connect(depositorAccount)
        .deposit(
          destinationDomainID,
          erc20ResourceID,
          erc20depositData,
          feeData,
        ),
    ).not.to.be.reverted;
  });

  it("deposit should revert if not called by router on BasicFeeHandler contract", async () => {
    const fee = ethers.parseEther("0.5");
    await bridgeInstance.adminChangeFeeHandler(
      await basicFeeHandlerInstance.getAddress(),
    );
    // current fee is set to 0
    assert.deepEqual(await basicFeeHandlerInstance._fee(), BigInt(0));
    // Change fee to 0.5 ether
    await basicFeeHandlerInstance.changeFee(fee);
    assert.deepEqual(
      ethers.formatEther(await basicFeeHandlerInstance._fee()),
      "0.5",
    );

    const balanceBefore = await ethers.provider.getBalance(
      await basicFeeHandlerInstance.getAddress(),
    );

    await expect(
      basicFeeHandlerInstance
        .connect(depositorAccount)
        .collectFee(
          depositorAccount,
          originDomainID,
          destinationDomainID,
          erc20ResourceID,
          erc20depositData,
          feeData,
          {
            value: ethers.parseEther("0.5"),
          },
        ),
    ).to.be.revertedWith("sender must be bridge or fee router contract");

    const balanceAfter = await ethers.provider.getBalance(
      await basicFeeHandlerInstance.getAddress(),
    );
    assert.deepEqual(balanceAfter, balanceBefore);
  });

  it("deposit should revert if not called by bridge on FeeHandlerRouter contract", async () => {
    const fee = ethers.parseEther("0.5");
    await bridgeInstance.adminChangeFeeHandler(
      await basicFeeHandlerInstance.getAddress(),
    );
    // current fee is set to 0
    assert.deepEqual(await basicFeeHandlerInstance._fee(), BigInt(0));
    // Change fee to 0.5 ether
    await basicFeeHandlerInstance.changeFee(fee);
    assert.deepEqual(
      ethers.formatEther(await basicFeeHandlerInstance._fee()),
      "0.5",
    );

    const balanceBefore = await ethers.provider.getBalance(
      await basicFeeHandlerInstance.getAddress(),
    );

    await expect(
      feeHandlerRouterInstance
        .connect(depositorAccount)
        .collectFee(
          depositorAccount,
          originDomainID,
          destinationDomainID,
          erc20ResourceID,
          erc20depositData,
          feeData,
          {
            value: ethers.parseEther("0.5"),
          },
        ),
    ).to.be.revertedWith("sender must be bridge contract");

    const balanceAfter = await ethers.provider.getBalance(
      await basicFeeHandlerInstance.getAddress(),
    );
    assert.deepEqual(balanceAfter, balanceBefore);
  });

  it("should successfully change fee handler from FeeRouter to basicFeeHandlerInstance and collect fee", async () => {
    await bridgeInstance.adminChangeFeeHandler(
      await basicFeeHandlerInstance.getAddress(),
    );

    const fee = ethers.parseEther("0.5");
    // current fee is set to 0
    assert.deepEqual(await basicFeeHandlerInstance._fee(), BigInt(0));
    // Change fee to 0.5 ether
    await basicFeeHandlerInstance.changeFee(fee);
    assert.deepEqual(
      ethers.formatEther(await basicFeeHandlerInstance._fee()),
      "0.5",
    );

    const balanceBefore = await ethers.provider.getBalance(
      await basicFeeHandlerInstance.getAddress(),
    );

    const depositTx = bridgeInstance
      .connect(depositorAccount)
      .deposit(
        destinationDomainID,
        erc20ResourceID,
        erc20depositData.toLowerCase(),
        feeData,
        {
          value: fee,
        },
      );

    await expect(depositTx)
      .to.emit(bridgeInstance, "Deposit")
      .withArgs(
        destinationDomainID,
        erc20ResourceID,
        expectedDepositNonce,
        await depositorAccount.getAddress(),
        erc20depositData.toLowerCase(),
        "0x",
      );

    await expect(depositTx)
      .to.emit(basicFeeHandlerInstance, "FeeCollected")
      .withArgs(
        await depositorAccount.getAddress(),
        originDomainID,
        destinationDomainID,
        erc20ResourceID,
        fee,
        ethers.ZeroAddress,
      );

    const balanceAfter = await ethers.provider.getBalance(
      await basicFeeHandlerInstance.getAddress(),
    );
    assert.deepEqual(
      balanceAfter,
      BigInt(fee.toString()) + BigInt(balanceBefore),
    );
  });
});
