import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

import { ethers } from "hardhat";
import { assert, expect } from "chai";
import {
  deployBridge,
  createResourceID,
  createERCDepositData,
} from "../../helpers";
import type {
  Bridge,
  ERC20Handler,
  ERC20PresetMinterPauser,
} from "../../../typechain-types";

describe("E2E ERC20 - Same Chain", () => {
  const originDomainID = 1;
  const destinationDomainID = 2;

  const initialTokenAmount = 100;
  const depositAmount = 10;
  const expectedDepositNonce = 1;
  const feeData = "0x";
  const emptySetResourceData = "0x";

  let bridgeInstance: Bridge;
  let ERC20MintableInstance: ERC20PresetMinterPauser;
  let ERC20HandlerInstance: ERC20Handler;
  let depositorAccount: HardhatEthersSigner;
  let recipientAccount: HardhatEthersSigner;
  let relayer1: HardhatEthersSigner;

  let resourceID: string;
  let depositData: string;
  let depositProposalData;

  let proposal: {
    originDomainID: number;
    depositNonce: number;
    resourceID: string;
    data: string;
  };

  beforeEach(async () => {
    [, depositorAccount, recipientAccount, relayer1] =
      await ethers.getSigners();

    bridgeInstance = await deployBridge(destinationDomainID);
    const ERC20MintableContract = await ethers.getContractFactory(
      "ERC20PresetMinterPauser",
    );
    ERC20MintableInstance = await ERC20MintableContract.deploy("Token", "TOK");
    const ERC20HandlerContract =
      await ethers.getContractFactory("ERC20Handler");
    ERC20HandlerInstance = await ERC20HandlerContract.deploy(
      await bridgeInstance.getAddress(),
    );
    resourceID = createResourceID(
      await ERC20MintableInstance.getAddress(),
      originDomainID,
    );

    await Promise.all([
      ERC20MintableInstance.mint(depositorAccount, initialTokenAmount),
      bridgeInstance.adminSetResource(
        await ERC20HandlerInstance.getAddress(),
        resourceID,
        await ERC20MintableInstance.getAddress(),
        emptySetResourceData,
      ),
    ]);

    await ERC20MintableInstance.connect(depositorAccount).approve(
      await ERC20HandlerInstance.getAddress(),
      depositAmount,
    );

    depositData = createERCDepositData(
      depositAmount,
      20,
      await recipientAccount.getAddress(),
    );
    depositProposalData = createERCDepositData(
      depositAmount,
      20,
      await recipientAccount.getAddress(),
    );

    proposal = {
      originDomainID: originDomainID,
      depositNonce: expectedDepositNonce,
      data: depositProposalData,
      resourceID: resourceID,
    };
  });

  it("[sanity] depositorAccount' balance should be equal to initialTokenAmount", async () => {
    const depositorBalance =
      await ERC20MintableInstance.balanceOf(depositorAccount);
    assert.strictEqual(depositorBalance, BigInt(initialTokenAmount));
  });

  it("[sanity] await ERC20HandlerInstance.getAddress() should have an allowance of depositAmount from depositorAccount", async () => {
    const handlerAllowance = await ERC20MintableInstance.allowance(
      depositorAccount,
      await ERC20HandlerInstance.getAddress(),
    );
    assert.strictEqual(handlerAllowance, BigInt(depositAmount));
  });

  it("depositAmount of Destination ERC20 should be transferred to recipientAccount", async () => {
    // depositorAccount makes initial deposit of depositAmount
    assert.isFalse(await bridgeInstance.paused());
    await expect(
      bridgeInstance
        .connect(depositorAccount)
        .deposit(originDomainID, resourceID, depositData, feeData),
    ).not.to.be.reverted;

    // Handler should have a balance of depositAmount
    const handlerBalance = await ERC20MintableInstance.balanceOf(
      await ERC20HandlerInstance.getAddress(),
    );
    assert.strictEqual(handlerBalance, BigInt(depositAmount));

    // relayer2 executes the proposal
    await expect(bridgeInstance.connect(relayer1).executeProposal(proposal)).not
      .to.be.reverted;

    // Assert ERC20 balance was transferred from depositorAccount
    const depositorBalance =
      await ERC20MintableInstance.balanceOf(depositorAccount);
    assert.strictEqual(
      depositorBalance,
      BigInt(initialTokenAmount - depositAmount),
    );

    // // Assert ERC20 balance was transferred to recipientAccount
    const recipientBalance =
      await ERC20MintableInstance.balanceOf(recipientAccount);
    assert.strictEqual(recipientBalance, BigInt(depositAmount));
  });
});
