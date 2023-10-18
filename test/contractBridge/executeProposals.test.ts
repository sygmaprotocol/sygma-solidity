// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

import { ethers } from "hardhat";
import { assert, expect } from "chai";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import {
  deployBridge,
  createResourceID,
  createERCDepositData,
} from "../helpers";
import type {
  Bridge,
  ERC20Handler,
  ERC20PresetMinterPauser,
} from "../../typechain-types";

describe("Bridge - [execute proposals]", () => {
  const destinationDomainID = 1;
  const originDomainID = 2;
  const initialTokenAmount = 100;
  const depositAmount = 10;
  const expectedDepositNonces = [1, 2, 3];
  const feeData = "0x";
  const emptySetResourceData = "0x";

  let bridgeInstance: Bridge;
  let ERC20MintableInstance: ERC20PresetMinterPauser;
  let ERC20HandlerInstance: ERC20Handler;
  let depositorAccount: HardhatEthersSigner;
  let recipientAccount: HardhatEthersSigner;
  let relayer1: HardhatEthersSigner;

  let erc20ResourceID: string;
  let erc20DepositData: string;
  let erc20DepositProposalData: string;
  let erc20DataHash: string;
  let proposalsForExecution: Array<{
    originDomainID: number;
    depositNonce: number;
    resourceID: string;
    data: string;
  }>;

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

    erc20ResourceID = createResourceID(
      await ERC20MintableInstance.getAddress(),
      destinationDomainID,
    );

    await Promise.all([
      ERC20MintableInstance.mint(depositorAccount, initialTokenAmount),
      bridgeInstance.adminSetResource(
        await ERC20HandlerInstance.getAddress(),
        erc20ResourceID,
        await ERC20MintableInstance.getAddress(),
        emptySetResourceData,
      ),
    ]);

    await Promise.all([
      ERC20MintableInstance.connect(depositorAccount).approve(
        await ERC20HandlerInstance.getAddress(),
        depositAmount,
      ),
    ]);

    erc20DepositData = createERCDepositData(
      depositAmount,
      20,
      await recipientAccount.getAddress(),
    );
    erc20DepositProposalData = createERCDepositData(
      depositAmount,
      20,
      await recipientAccount.getAddress(),
    );
    erc20DataHash = ethers.keccak256(
      (await ERC20HandlerInstance.getAddress()) +
        erc20DepositProposalData.substring(2),
    );

    proposalsForExecution = [
      {
        originDomainID: originDomainID,
        depositNonce: expectedDepositNonces[0],
        resourceID: erc20ResourceID,
        data: erc20DepositProposalData,
      },
    ];
  });

  it("should create and execute executeProposal successfully", async () => {
    // depositorAccount makes initial deposit of depositAmount
    assert.isFalse(await bridgeInstance.paused());
    await expect(
      bridgeInstance
        .connect(depositorAccount)
        .deposit(originDomainID, erc20ResourceID, erc20DepositData, feeData),
    ).not.to.be.reverted;

    const executeTx = await bridgeInstance
      .connect(relayer1)
      .executeProposals(proposalsForExecution);

    await expect(executeTx).not.to.be.reverted;

    // check that deposit nonces had been marked as used in bitmap
    expectedDepositNonces.map(async (_, index) => {
      assert.isTrue(
        await bridgeInstance.isProposalExecuted(
          originDomainID,
          expectedDepositNonces[index],
        ),
      );
    });

    // check that tokens are transferred to recipient address
    const recipientERC20Balance =
      await ERC20MintableInstance.balanceOf(recipientAccount);
    assert.strictEqual(recipientERC20Balance, BigInt(depositAmount));
  });

  it("should skip executing proposal if deposit nonce is already used", async () => {
    // depositorAccount makes initial deposit of depositAmount
    assert.isFalse(await bridgeInstance.paused());
    await expect(
      bridgeInstance
        .connect(depositorAccount)
        .deposit(originDomainID, erc20ResourceID, erc20DepositData, feeData),
    ).not.to.be.reverted;

    const executeTx = await bridgeInstance.executeProposals(
      proposalsForExecution,
    );

    await expect(executeTx).not.to.be.reverted;

    // check that deposit nonces had been marked as used in bitmap
    expectedDepositNonces.map(async (_, index) => {
      assert.isTrue(
        await bridgeInstance.isProposalExecuted(
          originDomainID,
          expectedDepositNonces[index],
        ),
      );
    });

    // check that tokens are transferred to recipient address
    const recipientERC20Balance =
      await ERC20MintableInstance.balanceOf(recipientAccount);
    assert.strictEqual(recipientERC20Balance, BigInt(depositAmount));

    const skipExecuteTx = await bridgeInstance
      .connect(relayer1)
      .executeProposals(proposalsForExecution);

    // check that no ProposalExecution events are emitted
    await expect(skipExecuteTx).not.to.emit(
      bridgeInstance,
      "ProposalExecution",
    );
  });

  it("should fail executing proposals if empty array is passed for execution", async () => {
    await expect(
      bridgeInstance.connect(relayer1).executeProposals([]),
    ).to.be.revertedWithCustomError(bridgeInstance, "EmptyProposalsArray()");
  });

  it("executeProposal event should be emitted with expected values", async () => {
    // depositorAccount makes initial deposit of depositAmount
    assert.isFalse(await bridgeInstance.paused());
    await expect(
      bridgeInstance
        .connect(depositorAccount)
        .deposit(originDomainID, erc20ResourceID, erc20DepositData, feeData),
    ).not.to.be.reverted;

    const executeTx = await bridgeInstance
      .connect(relayer1)
      .executeProposals(proposalsForExecution);

    await expect(executeTx)
      .to.emit(bridgeInstance, "ProposalExecution")
      .withArgs(
        originDomainID,
        expectedDepositNonces[0],
        erc20DataHash,
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "address", "uint256"],
          [
            await ERC20MintableInstance.getAddress(),
            await recipientAccount.getAddress(),
            depositAmount,
          ],
        ),
      );

    // check that deposit nonces had been marked as used in bitmap
    expectedDepositNonces.map(async (_, index) => {
      assert.isTrue(
        await bridgeInstance.isProposalExecuted(
          originDomainID,
          expectedDepositNonces[index],
        ),
      );
    });

    // check that tokens are transferred to recipient address
    const recipientERC20Balance =
      await ERC20MintableInstance.balanceOf(recipientAccount);
    assert.strictEqual(recipientERC20Balance, BigInt(depositAmount));
  });
});
