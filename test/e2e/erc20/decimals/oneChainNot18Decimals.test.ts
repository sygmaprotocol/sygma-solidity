// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

import { expect, assert } from "chai";
import { ethers } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import {
  deployBridgeContracts,
  createResourceID,
  createERCDepositData,
  getDepositEventData,
} from "../../../helpers";
import type {
  Bridge,
  ERC20Handler,
  ERC20PresetMinterPauser,
} from "../../../../typechain-types";

describe("E2E ERC20 - Two EVM Chains, one with decimal places == 18, other with != 18", () => {
  const originDomainID = 1;
  const destinationDomainID = 2;

  const originDecimalPlaces = BigInt(20);
  const destinationDecimalPlaces = 18;
  const bridgeDefaultDecimalPlaces = 18;
  const initialTokenAmount = ethers.parseUnits("100", originDecimalPlaces);
  const originDepositAmount = ethers.parseUnits("14", originDecimalPlaces);
  const destinationDepositAmount = ethers.parseUnits(
    "14",
    destinationDecimalPlaces,
  );
  const relayerConvertedAmount = ethers.parseUnits(
    "14",
    bridgeDefaultDecimalPlaces,
  );
  const expectedDepositNonce = 1;
  const feeData = "0x";
  const emptySetResourceData = "0x";

  let depositorAccount: HardhatEthersSigner;
  let recipientAccount: HardhatEthersSigner;
  let originDepositData: string;
  let originResourceID: string;
  let originBridgeInstance: Bridge;
  let originERC20MintableInstance: ERC20PresetMinterPauser;
  let originERC20HandlerInstance: ERC20Handler;
  let originRelayer1: HardhatEthersSigner;

  let destinationBridgeInstance: Bridge;
  let originRouterInstance: Router;
  let originExecutorInstance: Executor;
  let destinationRouterInstance: Router;
  let destinationExecutorInstance: Executor;
  let destinationDepositData: string;
  let destinationResourceID: string;
  let destinationERC20MintableInstance: ERC20PresetMinterPauser;
  let destinationERC20HandlerInstance: ERC20Handler;
  let destinationRelayer1: HardhatEthersSigner;

  let destinationDepositProposalData: string;
  let destinationDomainProposal: {
    originDomainID: number;
    depositNonce: number;
    data: string;
    resourceID: string;
  };

  beforeEach(async () => {
    [
      ,
      depositorAccount,
      recipientAccount,
      originRelayer1,
      destinationRelayer1,
    ] = await ethers.getSigners();

    [originBridgeInstance, originRouterInstance, originExecutorInstance] =
      await deployBridgeContracts(originDomainID);
    [
      destinationBridgeInstance,
      destinationRouterInstance,
      destinationExecutorInstance,
    ] = await deployBridgeContracts(destinationDomainID);
    const ERC20MintableContract = await ethers.getContractFactory(
      "ERC20PresetMinterPauserDecimals",
    );
    originERC20MintableInstance = await ERC20MintableContract.deploy(
      "Token",
      "TOK",
      originDecimalPlaces,
    );
    destinationERC20MintableInstance = await ERC20MintableContract.deploy(
      "Token",
      "TOK",
      destinationDecimalPlaces,
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
      .approve(
        await originERC20HandlerInstance.getAddress(),
        originDepositAmount,
      ),
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
        // set decimal places for handler and token
        ethers.toBeHex(originDecimalPlaces),
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
      originDepositAmount.toString(),
      20,
      await recipientAccount.getAddress(),
    );

    destinationDepositData = createERCDepositData(
      destinationDepositAmount.toString(),
      20,
      await depositorAccount.getAddress(),
    );
    destinationDepositProposalData = createERCDepositData(
      relayerConvertedAmount.toString(),
      20,
      await depositorAccount.getAddress(),
    );

    destinationDomainProposal = {
      originDomainID: destinationDomainID,
      depositNonce: expectedDepositNonce,
      data: destinationDepositProposalData,
      resourceID: originResourceID,
    };
  });

  it("[sanity] check token contract decimals match set decimals on handlers", async () => {
    const originTokenContractDecimals =
      await originERC20MintableInstance.decimals();
    const originDecimalsSetOnHandler = (
      await originERC20HandlerInstance._tokenContractAddressToTokenProperties(
        await originERC20MintableInstance.getAddress(),
      )
    ).decimals;

    const destinationDecimalsSetOnHandler = (
      await destinationERC20HandlerInstance._tokenContractAddressToTokenProperties(
        await destinationERC20MintableInstance.getAddress(),
      )
    ).decimals;

    assert.strictEqual(
      originTokenContractDecimals.toString(),
      originDecimalsSetOnHandler["externalDecimals"].toString(),
    );
    assert.isFalse(destinationDecimalsSetOnHandler["isSet"]);
    assert.strictEqual(
      "0",
      destinationDecimalsSetOnHandler["externalDecimals"].toString(),
    );
  });

  it(`E2E: depositAmount of Origin ERC20 owned by depositAddress to Destination ERC20
        owned by recipientAccount and back again`, async () => {
    let depositorBalance;
    let recipientBalance;

    // depositorAccount makes initial deposit of depositAmount
    const originDepositTx = await originRouterInstance
      .connect(depositorAccount)
      .deposit(
        destinationDomainID,
        originResourceID,
        originDepositData,
        feeData,
      );
    await expect(originDepositTx).not.to.be.reverted;

    const originDomainProposal = {
      originDomainID: originDomainID,
      depositNonce: expectedDepositNonce,
      data: await getDepositEventData(originDepositTx),
      resourceID: destinationResourceID,
    };

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
      depositorBalance.toString(),
      (initialTokenAmount - originDepositAmount).toString(),
      "originDepositAmount wasn't transferred from depositorAccount",
    );

    // Assert ERC20 balance was transferred to recipientAccount
    recipientBalance =
      await destinationERC20MintableInstance.balanceOf(recipientAccount);
    assert.strictEqual(
      recipientBalance.toString(),
      destinationDepositAmount.toString(),
      "originDepositAmount wasn't transferred to recipientAccount",
    );

    // At this point a representation of OriginERC20Mintable has been transferred from
    // depositor to the recipient using Both Bridges and DestinationERC20Mintable.
    // Next we will transfer DestinationERC20Mintable back to the depositor

    await destinationERC20MintableInstance
      .connect(recipientAccount)
      .approve(
        await destinationERC20HandlerInstance.getAddress(),
        destinationDepositAmount,
      );

    // recipientAccount makes a deposit of the received depositAmount
    const depositTx = await destinationRouterInstance
      .connect(recipientAccount)
      .deposit(
        originDomainID,
        destinationResourceID,
        destinationDepositData,
        feeData,
      );
    await expect(depositTx).not.to.be.reverted;

    // check that handlerResponse is empty - deposits from networks with 18 decimal
    // places shouldn't return handlerResponse
    await expect(depositTx)
      .to.emit(destinationRouterInstance, "Deposit")
      .withArgs(
        originDomainID,
        destinationResourceID.toLowerCase(),
        expectedDepositNonce,
        await recipientAccount.getAddress(),
        destinationDepositData.toLowerCase(),
      );

    // Recipient should have a balance of 0 (deposit amount)
    recipientBalance =
      await destinationERC20MintableInstance.balanceOf(recipientAccount);
    assert.strictEqual(recipientBalance.toString(), "0");

    // destinationRelayer1 executes the proposal
    await expect(
      originExecutorInstance
        .connect(originRelayer1)
        .executeProposal(destinationDomainProposal),
    ).not.to.be.reverted;

    // Assert ERC20 balance was transferred from recipientAccount
    recipientBalance =
      await destinationERC20MintableInstance.balanceOf(recipientAccount);
    assert.strictEqual(recipientBalance.toString(), "0");

    // Assert ERC20 balance was transferred to recipientAccount
    depositorBalance =
      await originERC20MintableInstance.balanceOf(depositorAccount);
    assert.strictEqual(
      depositorBalance.toString(),
      initialTokenAmount.toString(),
    );
  });
});
