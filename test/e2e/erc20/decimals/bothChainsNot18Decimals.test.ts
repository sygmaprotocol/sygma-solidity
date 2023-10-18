// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

import { ethers } from "hardhat";
import { assert, expect } from "chai";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import {
  deployBridge,
  createResourceID,
  createERCDepositData,
  createDepositProposalDataFromHandlerResponse,
  toHex,
} from "../../../helpers";
import type {
  Bridge,
  ERC20Handler,
  ERC20PresetMinterPauser,
} from "../../../../typechain-types";

describe("E2E ERC20 - Two EVM Chains both with decimal places != 18", () => {
  const originDomainID = 1;
  const destinationDomainID = 2;

  const originDecimalPlaces = BigInt(20);
  const destinationDecimalPlaces = BigInt(14);
  const bridgeDefaultDecimalPlaces = BigInt(18);
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

  let depositorAccount: HardhatEthersSigner;
  let recipientAccount: HardhatEthersSigner;
  let originDepositData: string;
  let originResourceID: string;
  let originBridgeInstance: Bridge;
  let originERC20MintableInstance: ERC20PresetMinterPauser;
  let originERC20HandlerInstance: ERC20Handler;
  let originRelayer1: HardhatEthersSigner;

  let destinationBridgeInstance: Bridge;
  let destinationDepositData: string;
  let destinationResourceID: string;
  let destinationERC20MintableInstance: ERC20PresetMinterPauser;
  let destinationERC20HandlerInstance: ERC20Handler;
  let destinationRelayer1: HardhatEthersSigner;

  beforeEach(async () => {
    [
      ,
      depositorAccount,
      recipientAccount,
      originRelayer1,
      destinationRelayer1,
    ] = await ethers.getSigners();

    originBridgeInstance = await deployBridge(originDomainID);
    destinationBridgeInstance = await deployBridge(destinationDomainID);
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
    );
    destinationERC20HandlerInstance = await ERC20HandlerContract.deploy(
      await destinationBridgeInstance.getAddress(),
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
        // set decimal places for handler and token
        ethers.toBeHex(destinationDecimalPlaces),
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
  });

  it("[sanity] check token contract decimals match set decimals on handlers", async () => {
    const originTokenContractDecimals =
      await originERC20MintableInstance.decimals();
    const originDecimalsSetOnHandler = (
      await originERC20HandlerInstance._tokenContractAddressToTokenProperties(
        await originERC20MintableInstance.getAddress(),
      )
    ).decimals;

    const destinationTokenContractDecimals =
      await destinationERC20MintableInstance.decimals();
    const destinationDecimalsSetOnHandler = (
      await destinationERC20HandlerInstance._tokenContractAddressToTokenProperties(
        await destinationERC20MintableInstance.getAddress(),
      )
    ).decimals;

    assert.strictEqual(
      originTokenContractDecimals,
      originDecimalsSetOnHandler["externalDecimals"],
    );
    assert.strictEqual(
      destinationTokenContractDecimals,
      destinationDecimalsSetOnHandler["externalDecimals"],
    );
  });

  it(`E2E: depositAmount of Origin ERC20 owned by depositAddress to Destination ERC20
        owned by recipientAccount and back again`, async () => {
    let depositorBalance;
    let recipientBalance;

    // depositorAccount makes initial deposit of depositAmount
    const originDepositTx = await originBridgeInstance
      .connect(depositorAccount)
      .deposit(
        destinationDomainID,
        originResourceID,
        originDepositData,
        feeData,
      );

    await expect(originDepositTx).not.to.be.reverted;

    // check that deposited amount converted to 18 decimal places is
    // emitted in handlerResponse
    await expect(originDepositTx)
      .to.emit(originBridgeInstance, "Deposit")
      .withArgs(
        destinationDomainID,
        originResourceID.toLowerCase(),
        expectedDepositNonce,
        await depositorAccount.getAddress(),
        originDepositData.toLowerCase(),
        toHex(relayerConvertedAmount.toString(), 32),
      );

    // this mocks depositProposal data for executing on
    // destination chain which is returned from relayers
    const originDepositProposalData =
      await createDepositProposalDataFromHandlerResponse(
        originDepositTx,
        20,
        await recipientAccount.getAddress(),
      );

    const originDomainProposal = {
      originDomainID: originDomainID,
      depositNonce: expectedDepositNonce,
      data: originDepositProposalData,
      resourceID: destinationResourceID,
    };

    // destinationRelayer1 executes the proposal
    await expect(
      destinationBridgeInstance
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
      recipientBalance,
      destinationDepositAmount,
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
    const destinationDepositTx = await destinationBridgeInstance
      .connect(recipientAccount)
      .deposit(
        originDomainID,
        destinationResourceID,
        destinationDepositData,
        feeData,
      );
    await expect(destinationDepositTx).not.to.be.reverted;

    // check that deposited amount converted to 18 decimal places is
    // emitted in handlerResponse
    await expect(destinationDepositTx)
      .to.emit(destinationBridgeInstance, "Deposit")
      .withArgs(
        originDomainID,
        destinationResourceID.toLowerCase(),
        expectedDepositNonce,
        await recipientAccount.getAddress(),
        destinationDepositData.toLowerCase(),
        toHex(relayerConvertedAmount.toString(), 32),
      );

    // this mocks depositProposal data for executing on
    // destination chain which is returned from relayers
    const destinationDepositProposalData =
      await createDepositProposalDataFromHandlerResponse(
        destinationDepositTx,
        20,
        await depositorAccount.getAddress(),
      );

    const destinationDomainProposal = {
      originDomainID: destinationDomainID,
      depositNonce: expectedDepositNonce,
      data: destinationDepositProposalData,
      resourceID: originResourceID,
    };

    // Recipient should have a balance of 0 (deposit amount)
    recipientBalance =
      await destinationERC20MintableInstance.balanceOf(recipientAccount);
    assert.strictEqual(recipientBalance.toString(), "0");

    // originRelayer1 executes the proposal
    await expect(
      originBridgeInstance
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
