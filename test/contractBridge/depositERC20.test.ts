// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { assert, expect } from "chai";
import { ethers } from "hardhat";
import type {
  Bridge,
  ERC20Handler,
  ERC20PresetMinterPauser,
} from "../../typechain-types";
import {
  createERCDepositData,
  createResourceID,
  deployBridge,
} from "../helpers";

describe("Bridge - [deposit - ERC20]", () => {
  const originDomainID = 1;
  const destinationDomainID = 2;

  const originChainInitialTokenAmount = 100;
  const depositAmount = 10;
  const expectedDepositNonce = 1;
  const feeData = "0x";
  const emptySetResourceData = "0x";

  let bridgeInstance: Bridge;
  let ERC20MintableInstance1: ERC20PresetMinterPauser;
  let ERC20MintableInstance2: ERC20PresetMinterPauser;
  let ERC20HandlerInstance: ERC20Handler;
  let depositorAccount: HardhatEthersSigner;
  let recipientAccount: HardhatEthersSigner;

  let resourceID1: string;
  let resourceID2: string;
  let depositData: string;

  beforeEach(async () => {
    [, depositorAccount, recipientAccount] = await ethers.getSigners();

    bridgeInstance = await deployBridge(Number(originDomainID));
    const ERC20MintableContract = await ethers.getContractFactory(
      "ERC20PresetMinterPauser",
    );
    const ERC20PresetMinterPauserMock = await ethers.getContractFactory(
      "ERC20PresetMinterPauserMock",
    );
    ERC20MintableInstance1 = await ERC20MintableContract.deploy("Token", "TOK");
    ERC20MintableInstance2 = await ERC20PresetMinterPauserMock.deploy(
      "Token",
      "TOK",
    );
    const ERC20HandlerContract =
      await ethers.getContractFactory("ERC20Handler");
    ERC20HandlerInstance = await ERC20HandlerContract.deploy(
      await bridgeInstance.getAddress(),
    );

    resourceID1 = createResourceID(
      await ERC20MintableInstance1.getAddress(),
      originDomainID,
    );
    resourceID2 = createResourceID(
      await ERC20MintableInstance2.getAddress(),
      originDomainID,
    );

    await Promise.all([
      bridgeInstance.adminSetResource(
        await ERC20HandlerInstance.getAddress(),
        resourceID1,
        await ERC20MintableInstance1.getAddress(),
        emptySetResourceData,
      ),
      bridgeInstance.adminSetResource(
        await ERC20HandlerInstance.getAddress(),
        resourceID2,
        await ERC20MintableInstance2.getAddress(),
        emptySetResourceData,
      ),
      ERC20MintableInstance1.mint(
        depositorAccount,
        originChainInitialTokenAmount,
      ),
      ERC20MintableInstance2.mint(
        depositorAccount,
        originChainInitialTokenAmount,
      ),
    ]);
    await ERC20MintableInstance1.connect(depositorAccount).approve(
      await ERC20HandlerInstance.getAddress(),
      depositAmount * 2,
    );
    await ERC20MintableInstance2.connect(depositorAccount).approve(
      await ERC20HandlerInstance.getAddress(),
      depositAmount,
    );

    depositData = createERCDepositData(
      depositAmount,
      20,
      await recipientAccount.getAddress(),
    );
  });

  it("[sanity] test depositorAccount' balance", async () => {
    const originChainDepositorBalance =
      await ERC20MintableInstance1.balanceOf(depositorAccount);
    assert.strictEqual(
      originChainDepositorBalance,
      BigInt(originChainInitialTokenAmount),
    );
  });

  it("[sanity] test await ERC20HandlerInstance.getAddress()' allowance", async () => {
    const originChainHandlerAllowance = await ERC20MintableInstance1.allowance(
      depositorAccount,
      await ERC20HandlerInstance.getAddress(),
    );
    assert.strictEqual(originChainHandlerAllowance, BigInt(depositAmount * 2));
  });

  it("ERC20 deposit can be made", async () => {
    await expect(
      bridgeInstance
        .connect(depositorAccount)
        .deposit(destinationDomainID, resourceID1, depositData, feeData),
    ).not.to.be.reverted;
  });

  it("_depositCounts should be increments from 0 to 1", async () => {
    await bridgeInstance
      .connect(depositorAccount)
      .deposit(destinationDomainID, resourceID1, depositData, feeData);

    const depositCount =
      await bridgeInstance._depositCounts(destinationDomainID);
    assert.strictEqual(depositCount, BigInt(expectedDepositNonce));
  });

  it("ERC20 can be deposited with correct balances", async () => {
    await bridgeInstance
      .connect(depositorAccount)
      .deposit(destinationDomainID, resourceID1, depositData, feeData);

    const originChainDepositorBalance =
      await ERC20MintableInstance1.balanceOf(depositorAccount);
    assert.strictEqual(
      originChainDepositorBalance,
      BigInt(originChainInitialTokenAmount - depositAmount),
    );

    const originChainHandlerBalance = await ERC20MintableInstance1.balanceOf(
      await ERC20HandlerInstance.getAddress(),
    );
    assert.strictEqual(originChainHandlerBalance, BigInt(depositAmount));
  });

  it("Deposit event is fired with expected value", async () => {
    const depositTx1 = bridgeInstance
      .connect(depositorAccount)
      .deposit(destinationDomainID, resourceID1, depositData, feeData);

    await expect(depositTx1)
      .to.emit(bridgeInstance, "Deposit")
      .withArgs(
        destinationDomainID,
        resourceID1.toLowerCase(),
        expectedDepositNonce,
        await depositorAccount.getAddress(),
        depositData.toLowerCase(),
        "0x",
      );

    const depositTx2 = bridgeInstance
      .connect(depositorAccount)
      .deposit(destinationDomainID, resourceID1, depositData, feeData);

    await expect(depositTx2)
      .to.emit(bridgeInstance, "Deposit")
      .withArgs(
        destinationDomainID,
        resourceID1,
        expectedDepositNonce + 1,
        await depositorAccount.getAddress(),
        depositData.toLowerCase(),
        "0x",
      );
  });

  it("deposit requires resourceID that is mapped to a handler", async () => {
    await expect(
      bridgeInstance
        .connect(depositorAccount)
        .deposit(
          destinationDomainID,
          ethers.zeroPadValue("0x01", 32),
          depositData,
          feeData,
        ),
    ).to.be.rejectedWith("ResourceIDNotMappedToHandler()");
  });

  it("Deposit destination domain can not be current bridge domain ", async () => {
    await expect(
      bridgeInstance
        .connect(depositorAccount)
        .deposit(originDomainID, resourceID1, depositData, feeData),
    ).to.be.rejectedWith("DepositToCurrentDomain()");
  });

  it("should revert if ERC20Safe contract call fails", async () => {
    await expect(
      bridgeInstance
        .connect(depositorAccount)
        .deposit(destinationDomainID, resourceID2, depositData, feeData),
    ).to.be.revertedWith("ERC20: operation did not succeed");
  });
});
