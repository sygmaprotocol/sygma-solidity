// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

import { ethers } from "hardhat";
import { expect } from "chai";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import {
  deployBridge,
  createResourceID,
  createPermissionlessGenericDepositData,
} from "../../helpers";
import type {
  Bridge,
  PermissionlessGenericHandler,
  TestStore,
} from "../../../typechain-types";

describe("PermissionlessGenericHandler - [deposit]", () => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const expectedDepositNonce = 1;

  const feeData = "0x";
  const destinationMaxFee = BigInt("900000");
  const hashOfTestStore = ethers.keccak256("0xc0ffee");
  const emptySetResourceData = "0x";

  let bridgeInstance: Bridge;
  let permissionlessGenericHandlerInstance: PermissionlessGenericHandler;
  let testStoreInstance: TestStore;
  let depositorAccount: HardhatEthersSigner;
  let invalidDepositorAccount: HardhatEthersSigner;

  let resourceID: string;
  let depositFunctionSignature: string;
  let depositData: string;

  beforeEach(async () => {
    [, depositorAccount, invalidDepositorAccount] = await ethers.getSigners();

    bridgeInstance = await deployBridge(originDomainID);
    const PermissionlessGenericHandlerContract =
      await ethers.getContractFactory("PermissionlessGenericHandler");
    permissionlessGenericHandlerInstance =
      await PermissionlessGenericHandlerContract.deploy(
        await bridgeInstance.getAddress(),
      );
    const TestStoreContract = await ethers.getContractFactory("TestStore");
    testStoreInstance = await TestStoreContract.deploy();

    resourceID = createResourceID(
      await testStoreInstance.getAddress(),
      originDomainID,
    );

    await bridgeInstance.adminSetResource(
      await permissionlessGenericHandlerInstance.getAddress(),
      resourceID,
      testStoreInstance.getAddress(),
      emptySetResourceData,
    );

    depositFunctionSignature =
      testStoreInstance.interface.getFunction("storeWithDepositor").selector;

    depositData = createPermissionlessGenericDepositData(
      depositFunctionSignature,
      await testStoreInstance.getAddress(),
      destinationMaxFee,
      await depositorAccount.getAddress(),
      hashOfTestStore,
    );
  });

  it("deposit can be made successfully", async () => {
    await expect(
      bridgeInstance
        .connect(depositorAccount)
        .deposit(destinationDomainID, resourceID, depositData, feeData),
    ).not.to.be.reverted;
  });

  it("depositEvent is emitted with expected values", async () => {
    const depositTx = await bridgeInstance
      .connect(depositorAccount)
      .deposit(destinationDomainID, resourceID, depositData, feeData);

    await expect(depositTx)
      .to.emit(bridgeInstance, "Deposit")
      .withArgs(
        destinationDomainID,
        resourceID.toLowerCase(),
        expectedDepositNonce,
        await depositorAccount.getAddress(),
        depositData.toLowerCase(),
        "0x",
      );
  });

  it("deposit data should be of required length", async () => {
    // Min length is 76 bytes
    const invalidDepositData = "0x" + "aa".repeat(75);

    await expect(
      bridgeInstance
        .connect(depositorAccount)
        .deposit(destinationDomainID, resourceID, invalidDepositData, feeData),
    ).to.be.revertedWith("Incorrect data length");
  });

  it("should revert if metadata encoded depositor does not match deposit depositor", async () => {
    const invalidDepositData = createPermissionlessGenericDepositData(
      depositFunctionSignature,
      await testStoreInstance.getAddress(),
      destinationMaxFee,
      await invalidDepositorAccount.getAddress(),
      hashOfTestStore,
    );

    await expect(
      bridgeInstance
        .connect(depositorAccount)
        .deposit(destinationDomainID, resourceID, invalidDepositData, feeData),
    ).to.be.revertedWith("incorrect depositor in deposit data");
  });

  it("should revert if max fee exceeds 1000000", async () => {
    const invalidMaxFee = BigInt(1000001);
    const invalidDepositData = createPermissionlessGenericDepositData(
      depositFunctionSignature,
      await testStoreInstance.getAddress(),
      invalidMaxFee,
      await depositorAccount.getAddress(),
      hashOfTestStore,
    );

    await expect(
      bridgeInstance
        .connect(depositorAccount)
        .deposit(destinationDomainID, resourceID, invalidDepositData, feeData, {
          from: depositorAccount,
        }),
    ).to.be.revertedWith("requested fee too large");
  });
});
