// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

import { ethers } from "hardhat";
import { assert, expect } from "chai";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { deployBridgeContracts, createERCDepositData } from "../helpers";

import { accountProof1, storageProof1 } from "../testingProofs";

import type {
  Bridge,
  Router,
  Executor,
  ERC20Handler,
  ERC20PresetMinterPauser,
  StateRootStorage,
} from "../../typechain-types";

describe("Bridge - [execute proposal - ERC20]", () => {
  const originDomainID = 1;
  const destinationDomainID = 2;

  const initialTokenAmount = 100;
  const depositAmount = 10;
  const expectedDepositNonce = 1;
  const feeData = "0x";
  const emptySetResourceData = "0x";
  const securityModel = 1;
  const slot = 5090531;
  const routerAddress = "0x1a60efB48c61A79515B170CA61C84DD6dCA80418";
  const stateRoot =
    "0xdf5a6882ccba1fd513c68a254fa729e05f769b2fa312011e1f5c38cde69964c7";

  let bridgeInstance: Bridge;
  let routerInstance: Router;
  let executorInstance: Executor;
  let ERC20MintableInstance: ERC20PresetMinterPauser;
  let ERC20HandlerInstance: ERC20Handler;
  let stateRootStorageInstance: StateRootStorage;
  let depositorAccount: HardhatEthersSigner;
  let recipientAccount: HardhatEthersSigner;
  let relayer1: HardhatEthersSigner;

  let resourceID: string;
  let depositData: string;
  let depositProposalData: string;

  let proposal: {
    originDomainID: number;
    securityModel: number;
    depositNonce: number;
    resourceID: string;
    data: string;
    storageProof: Array<string>;
  };

  beforeEach(async () => {
    [, depositorAccount, recipientAccount, relayer1] =
      await ethers.getSigners();

    [
      bridgeInstance,
      routerInstance,
      executorInstance,
      stateRootStorageInstance,
    ] = await deployBridgeContracts(destinationDomainID, routerAddress);
    const ERC20MintableContract = await ethers.getContractFactory(
      "ERC20PresetMinterPauser",
    );
    ERC20MintableInstance = await ERC20MintableContract.deploy("Token", "TOK");
    const ERC20HandlerContract =
      await ethers.getContractFactory("ERC20Handler");
    ERC20HandlerInstance = await ERC20HandlerContract.deploy(
      await bridgeInstance.getAddress(),
      await routerInstance.getAddress(),
      await executorInstance.getAddress(),
    );

    resourceID =
      "0x0000000000000000000000000000000000000000000000000000000000000000";

    await Promise.all([
      ERC20MintableInstance.mint(depositorAccount, initialTokenAmount),
      ERC20MintableInstance.mint(
        await ERC20HandlerInstance.getAddress(),
        initialTokenAmount,
      ),
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
      securityModel: securityModel,
      depositNonce: expectedDepositNonce,
      resourceID: resourceID,
      data: depositProposalData,
      storageProof: storageProof1[0].proof,
    };

    await stateRootStorageInstance.storeStateRoot(
      originDomainID,
      slot,
      stateRoot,
    );
  });

  it("isProposalExecuted returns false if depositNonce is not used", async () => {
    const destinationDomainID = await bridgeInstance._domainID();

    assert.isFalse(
      await executorInstance.isProposalExecuted(
        destinationDomainID,
        expectedDepositNonce,
      ),
    );
  });

  it("should revert ERC20 executeProposal if Bridge is paused", async () => {
    assert.isFalse(await bridgeInstance.paused());
    await expect(bridgeInstance.adminPauseTransfers()).not.to.be.reverted;
    assert.isTrue(await bridgeInstance.paused());
    await expect(
      routerInstance
        .connect(depositorAccount)
        .deposit(
          originDomainID,
          resourceID,
          securityModel,
          depositData,
          feeData,
        ),
    ).to.be.revertedWithCustomError(executorInstance, "BridgeIsPaused()");
  });

  it("should create and execute executeProposal successfully", async () => {
    // depositorAccount makes initial deposit of depositAmount
    assert.isFalse(await bridgeInstance.paused());
    await expect(
      routerInstance
        .connect(depositorAccount)
        .deposit(
          originDomainID,
          resourceID,
          securityModel,
          depositData,
          feeData,
        ),
    ).not.to.be.reverted;
    await expect(
      executorInstance
        .connect(relayer1)
        .executeProposal(proposal, accountProof1, slot),
    ).not.to.be.reverted;

    // check that deposit nonce has been marked as used in bitmap
    assert.isTrue(
      await executorInstance.isProposalExecuted(
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
      routerInstance
        .connect(depositorAccount)
        .deposit(
          originDomainID,
          resourceID,
          securityModel,
          depositData,
          feeData,
        ),
    ).not.to.be.reverted;

    await expect(
      executorInstance
        .connect(depositorAccount)
        .connect(relayer1)
        .executeProposal(proposal, accountProof1, slot),
    ).not.not.be.reverted;

    const skipExecuteTx = await executorInstance
      .connect(relayer1)
      .executeProposal(proposal, accountProof1, slot);
    // check that no ProposalExecution events are emitted
    await expect(skipExecuteTx).not.to.emit(
      executorInstance,
      "ProposalExecution",
    );
  });

  it("executeProposal event should be emitted with expected values", async () => {
    // depositorAccount makes initial deposit of depositAmount
    assert.isFalse(await bridgeInstance.paused());
    await expect(
      routerInstance
        .connect(depositorAccount)
        .deposit(
          originDomainID,
          resourceID,
          securityModel,
          depositData,
          feeData,
        ),
    ).not.to.be.reverted;

    const proposalTx = executorInstance
      .connect(relayer1)
      .executeProposal(proposal, accountProof1, slot);

    await expect(proposalTx)
      .to.emit(executorInstance, "ProposalExecution")
      .withArgs(
        originDomainID,
        expectedDepositNonce,
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
      await executorInstance.isProposalExecuted(
        originDomainID,
        expectedDepositNonce,
      ),
    );

    // check that tokens are transferred to recipient address
    const recipientBalance =
      await ERC20MintableInstance.balanceOf(recipientAccount);
    assert.strictEqual(recipientBalance, BigInt(depositAmount));
  });

  it("should fail if origin domain verified data differs than destination domain data", async () => {
    // depositorAccount makes initial deposit of depositAmount
    assert.isFalse(await bridgeInstance.paused());
    await expect(
      routerInstance
        .connect(depositorAccount)
        .deposit(
          originDomainID,
          resourceID,
          securityModel,
          depositData,
          feeData,
        ),
    ).not.to.be.reverted;

    const invalidDepositNone = 2;
    const invalidProposal = {
      originDomainID: originDomainID,
      securityModel: securityModel,
      depositNonce: invalidDepositNone,
      resourceID: resourceID,
      data: depositProposalData,
      storageProof: storageProof1[0].proof,
    };

    const proposalTx = executorInstance
      .connect(relayer1)
      .executeProposal(invalidProposal, accountProof1, slot);

    await expect(proposalTx).to.be.revertedWith(
      "MerkleTrie: invalid large internal hash",
    );

    // check that deposit nonce has not been marked as used in bitmap
    assert.isFalse(
      await executorInstance.isProposalExecuted(
        originDomainID,
        expectedDepositNonce,
      ),
    );
  });
});
