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

describe("Bridge - [execute proposal - ERC20]", () => {
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
  let depositProposalData: string;

  let data = "";
  let dataHash = "";
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
      destinationDomainID,
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

    data = createERCDepositData(
      depositAmount,
      20,
      await recipientAccount.getAddress(),
    );
    dataHash = ethers.keccak256(
      (await ERC20HandlerInstance.getAddress()) + data.substring(2),
    );

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
      resourceID: resourceID,
      data: depositProposalData,
    };
  });

  it("isProposalExecuted returns false if depositNonce is not used", async () => {
    const destinationDomainID = await bridgeInstance._domainID();

    assert.isFalse(
      await bridgeInstance.isProposalExecuted(
        destinationDomainID,
        expectedDepositNonce,
      ),
    );
  });

  it("should create and execute executeProposal successfully", async () => {
    // depositorAccount makes initial deposit of depositAmount
    assert.isFalse(await bridgeInstance.paused());
    await expect(
      bridgeInstance
        .connect(depositorAccount)
        .deposit(originDomainID, resourceID, depositData, feeData),
    ).not.to.be.reverted;

    await expect(bridgeInstance.connect(relayer1).executeProposal(proposal)).not
      .to.be.reverted;

    // check that deposit nonce has been marked as used in bitmap
    assert.isTrue(
      await bridgeInstance.isProposalExecuted(
        originDomainID,
        expectedDepositNonce,
      ),
    );

    // check that tokens are transferred to recipient address
    const recipientBalance =
      await ERC20MintableInstance.balanceOf(recipientAccount);
    assert.strictEqual(recipientBalance, BigInt(depositAmount));
  });

  it("should skip executing proposal if deposit nonce is already used", async () => {
    // depositorAccount makes initial deposit of depositAmount
    assert.isFalse(await bridgeInstance.paused());
    await expect(
      bridgeInstance
        .connect(depositorAccount)
        .deposit(originDomainID, resourceID, depositData, feeData),
    ).not.to.be.reverted;

    await expect(
      bridgeInstance
        .connect(depositorAccount)
        .connect(relayer1)
        .executeProposal(proposal),
    ).not.not.be.reverted;

    const skipExecuteTx = await bridgeInstance
      .connect(relayer1)
      .executeProposal(proposal);
    // check that no ProposalExecution events are emitted
    await expect(skipExecuteTx).not.to.emit(
      bridgeInstance,
      "ProposalExecution",
    );
  });

  it("executeProposal event should be emitted with expected values", async () => {
    // depositorAccount makes initial deposit of depositAmount
    assert.isFalse(await bridgeInstance.paused());
    await expect(
      bridgeInstance
        .connect(depositorAccount)
        .deposit(originDomainID, resourceID, depositData, feeData),
    ).not.to.be.reverted;

    const proposalTx = bridgeInstance
      .connect(relayer1)
      .executeProposal(proposal);

    await expect(proposalTx)
      .to.emit(bridgeInstance, "ProposalExecution")
      .withArgs(
        originDomainID,
        expectedDepositNonce,
        dataHash,
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "address", "uint256"],
          [
            await ERC20MintableInstance.getAddress(),
            await recipientAccount.getAddress(),
            depositAmount,
          ],
        ),
      );

    // check that deposit nonce has been marked as used in bitmap
    assert.isTrue(
      await bridgeInstance.isProposalExecuted(
        originDomainID,
        expectedDepositNonce,
      ),
    );

    // check that tokens are transferred to recipient address
    const recipientBalance =
      await ERC20MintableInstance.balanceOf(recipientAccount);
    assert.strictEqual(recipientBalance, BigInt(depositAmount));
  });
});
