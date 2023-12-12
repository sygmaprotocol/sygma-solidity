// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

import { ethers } from "hardhat";
import { assert, expect } from "chai";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import {
  deployBridgeContracts,
  createResourceID,
  createERCDepositData,
} from "../../helpers";
import type {
  Bridge,
  Router,
  Executor,
  ERC20Handler,
  ERC20PresetMinterPauser,
} from "../../../typechain-types";

describe("E2E ERC20 - Two EVM Chains", () => {
  const originDomainID = 1;
  const destinationDomainID = 2;

  const initialTokenAmount = 100;
  const depositAmount = 10;
  const expectedDepositNonce = 1;
  const feeData = "0x";
  const emptySetResourceData = "0x";

  let depositorAccount: HardhatEthersSigner;
  let recipientAccount: HardhatEthersSigner;
  let originDepositData: string;
  let originResourceID: string;
  let originBridgeInstance: Bridge;
  let originRouterInstance: Router;
  let originExecutorInstance: Executor;
  let originERC20MintableInstance: ERC20PresetMinterPauser;
  let originERC20HandlerInstance: ERC20Handler;
  let originRelayer1: HardhatEthersSigner;

  let destinationBridgeInstance: Bridge;
  let destinationRouterInstance: Router;
  let destinationExecutorInstance: Executor;
  let destinationDepositData: string;
  let destinationResourceID: string;
  let destinationERC20MintableInstance: ERC20PresetMinterPauser;
  let destinationERC20HandlerInstance: ERC20Handler;
  let destinationRelayer1: HardhatEthersSigner;

  let originDomainProposal: {
    originDomainID: number;
    depositNonce: number;
    data: string;
    resourceID: string;
  };
  let destinationDomainProposal: {
    originDomainID: number;
    depositNonce: number;
    data: string;
    resourceID: string;
  };

  beforeEach(async () => {
    [depositorAccount, recipientAccount, originRelayer1, destinationRelayer1] =
      await ethers.getSigners();

    [originBridgeInstance, originRouterInstance, originExecutorInstance] =
      await deployBridgeContracts(originDomainID);
    [
      destinationBridgeInstance,
      destinationRouterInstance,
      destinationExecutorInstance,
    ] = await deployBridgeContracts(destinationDomainID);
    const ERC20MintableContract = await ethers.getContractFactory(
      "ERC20PresetMinterPauser",
    );
    originERC20MintableInstance = await ERC20MintableContract.deploy(
      "Token",
      "TOK",
    );
    destinationERC20MintableInstance = await ERC20MintableContract.deploy(
      "Token",
      "TOK",
    );
    const ERC20HandlerContract =
      await ethers.getContractFactory("ERC20Handler");
    originERC20HandlerInstance = await ERC20HandlerContract.deploy(
      await originBridgeInstance.getAddress(),
      await originRouterInstance.getAddress(),
      await originExecutorInstance.getAddress(),
    );
    destinationERC20HandlerInstance = await ERC20HandlerContract.deploy(
      await destinationBridgeInstance.getAddress(),
      await destinationRouterInstance.getAddress(),
      await destinationExecutorInstance.getAddress(),
    );

    originResourceID = createResourceID(
      await originERC20MintableInstance.getAddress(),
      originDomainID,
    );

    destinationResourceID = createResourceID(
      await destinationERC20MintableInstance.getAddress(),
      originDomainID,
    );

    await originERC20MintableInstance.mint(
      depositorAccount,
      initialTokenAmount,
    );

    await originERC20MintableInstance
      .connect(depositorAccount)
      .approve(await originERC20HandlerInstance.getAddress(), depositAmount),
      await originERC20MintableInstance.grantRole(
        await originERC20MintableInstance.MINTER_ROLE(),
        await originERC20HandlerInstance.getAddress(),
      ),
      await destinationERC20MintableInstance.grantRole(
        await destinationERC20MintableInstance.MINTER_ROLE(),
        await destinationERC20HandlerInstance.getAddress(),
      ),
      await originBridgeInstance.adminSetResource(
        await originERC20HandlerInstance.getAddress(),
        originResourceID,
        await originERC20MintableInstance.getAddress(),
        emptySetResourceData,
      ),
      await originBridgeInstance.adminSetBurnable(
        await originERC20HandlerInstance.getAddress(),
        await originERC20MintableInstance.getAddress(),
      ),
      await destinationBridgeInstance.adminSetResource(
        await destinationERC20HandlerInstance.getAddress(),
        destinationResourceID,
        await destinationERC20MintableInstance.getAddress(),
        emptySetResourceData,
      ),
      await destinationBridgeInstance.adminSetBurnable(
        await destinationERC20HandlerInstance.getAddress(),
        await destinationERC20MintableInstance.getAddress(),
      );

    originDepositData = createERCDepositData(
      depositAmount,
      20,
      await recipientAccount.getAddress(),
    );

    destinationDepositData = createERCDepositData(
      depositAmount,
      20,
      await depositorAccount.getAddress(),
    );
    originDomainProposal = {
      originDomainID: originDomainID,
      depositNonce: expectedDepositNonce,
      data: originDepositData,
      resourceID: destinationResourceID,
    };

    destinationDomainProposal = {
      originDomainID: destinationDomainID,
      depositNonce: expectedDepositNonce,
      data: destinationDepositData,
      resourceID: originResourceID,
    };
  });

  it("[sanity] depositorAccount' balance should be equal to initialTokenAmount", async () => {
    const depositorBalance =
      await originERC20MintableInstance.balanceOf(depositorAccount);
    assert.strictEqual(depositorBalance, BigInt(initialTokenAmount));
  });

  it("[sanity] await originERC20HandlerInstance.getAddress() should have an allowance of depositAmount from depositorAccount", async () => {
    const handlerAllowance = await originERC20MintableInstance.allowance(
      depositorAccount,
      await originERC20HandlerInstance.getAddress(),
    );
    assert.strictEqual(handlerAllowance, BigInt(depositAmount));
  });

  it("[sanity] await destinationERC20HandlerInstance.getAddress()  should have minterRole for destinationERC20MintableInstance", async () => {
    const isMinter = await destinationERC20MintableInstance.hasRole(
      await destinationERC20MintableInstance.MINTER_ROLE(),
      await destinationERC20HandlerInstance.getAddress(),
    );
    assert.isTrue(isMinter);
  });

  it(`E2E: depositAmount of Origin ERC20 owned by depositAddress to Destination ERC20
      owned by recipientAccount and back again`, async () => {
    let depositorBalance;
    let recipientBalance;

    // depositorAccount makes initial deposit of depositAmount
    await expect(
      originRouterInstance
        .connect(depositorAccount)
        .deposit(
          destinationDomainID,
          originResourceID,
          originDepositData,
          feeData,
        ),
    ).not.to.be.reverted;

    // destinationRelayer1 executes the proposal
    await expect(
      destinationExecutorInstance
        .connect(destinationRelayer1)
        .executeProposal(originDomainProposal),
    ).not.to.be.reverted;

    // Assert ERC20 balance was transferred from depositorAccount
    depositorBalance =
      await originERC20MintableInstance.balanceOf(depositorAccount);
    assert.strictEqual(
      depositorBalance,
      BigInt(initialTokenAmount) - BigInt(depositAmount),
      "depositAmount wasn't transferred from depositorAccount",
    );

    // Assert ERC20 balance was transferred to recipientAccount
    recipientBalance =
      await destinationERC20MintableInstance.balanceOf(recipientAccount);
    assert.strictEqual(
      recipientBalance,
      BigInt(depositAmount),
      "depositAmount wasn't transferred to recipientAccount",
    );

    // At this point a representation of OriginERC20Mintable has been transferred from
    // depositor to the recipient using Both Bridges and DestinationERC20Mintable.
    // Next we will transfer DestinationERC20Mintable back to the depositor

    await destinationERC20MintableInstance
      .connect(recipientAccount)
      .approve(
        await destinationERC20HandlerInstance.getAddress(),
        depositAmount,
      );

    // recipientAccount makes a deposit of the received depositAmount
    await expect(
      destinationRouterInstance
        .connect(recipientAccount)
        .deposit(
          originDomainID,
          destinationResourceID,
          destinationDepositData,
          feeData,
        ),
    ).not.to.be.reverted;

    // Recipient should have a balance of 0 (deposit amount - deposit amount)
    recipientBalance =
      await destinationERC20MintableInstance.balanceOf(recipientAccount);
    assert.strictEqual(recipientBalance, BigInt(0));

    // destinationRelayer1 executes the proposal
    await expect(
      originExecutorInstance
        .connect(originRelayer1)
        .executeProposal(destinationDomainProposal),
    ).not.to.be.reverted;

    // Assert ERC20 balance was transferred from recipientAccount
    recipientBalance =
      await destinationERC20MintableInstance.balanceOf(recipientAccount);
    assert.strictEqual(recipientBalance, BigInt(0));

    // Assert ERC20 balance was transferred to recipientAccount
    depositorBalance =
      await originERC20MintableInstance.balanceOf(depositorAccount);
    assert.strictEqual(depositorBalance, BigInt(initialTokenAmount));
  });
});
