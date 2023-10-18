// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

import { ethers } from "hardhat";
import { assert, expect } from "chai";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { hashMessage } from "ethers";
import {
  createERCDepositData,
  createResourceID,
  decimalToPaddedBinary,
  deployBridge,
  blankFunctionDepositorOffset,
  blankFunctionSig,
  createPermissionlessGenericDepositData,
  constructGenericHandlerSetResourceData,
} from "../helpers";
import type {
  Bridge,
  ERC20PresetMinterPauser,
  HandlerRevert,
  PermissionlessGenericHandler,
  TestStore,
} from "../../typechain-types";

describe("Bridge - [execute - FailedHandlerExecution]", () => {
  const originDomainID = 1;

  const initialTokenAmount = 100;
  const depositAmount = 10;
  const expectedDepositNonces = [1, 2, 3, 4, 5, 6];
  const emptySetResourceData = "0x";
  const destinationMaxFee = BigInt(2000000);
  const handlerResponseLength = 64;
  const hashOfTestStore = ethers.keccak256("0xc0ffee");
  const contractCallReturndata = ethers.ZeroHash;

  let bridgeInstance: Bridge;
  let ERC20MintableInstance: ERC20PresetMinterPauser;
  let ERC20HandlerInstance: HandlerRevert;
  let permissionlessGenericHandlerInstance: PermissionlessGenericHandler;
  let testStoreInstance: TestStore;
  let depositorAccount: HardhatEthersSigner;
  let recipientAccount: HardhatEthersSigner;
  let relayer1: HardhatEthersSigner;
  let invalidExecutionContractAddress: HardhatEthersSigner;

  let erc20ResourceID: string;
  let genericResourceID: string;
  let erc20DepositProposalData: string;
  let genericProposalData: string;
  let depositFunctionSignature: string;
  let proposalsForExecution: Array<{
    originDomainID: number;
    depositNonce: number;
    resourceID: string;
    data: string;
  }>;

  beforeEach(async () => {
    [
      ,
      depositorAccount,
      recipientAccount,
      relayer1,
      invalidExecutionContractAddress,
    ] = await ethers.getSigners();

    bridgeInstance = await deployBridge(originDomainID);
    const ERC20MintableContract = await ethers.getContractFactory(
      "ERC20PresetMinterPauser",
    );
    ERC20MintableInstance = await ERC20MintableContract.deploy("Token", "TOK");
    const ERC20HandlerContract =
      await ethers.getContractFactory("HandlerRevert");
    ERC20HandlerInstance = await ERC20HandlerContract.deploy(
      await bridgeInstance.getAddress(),
    );

    const PermissionlessGenericHandlerContract =
      await ethers.getContractFactory("PermissionlessGenericHandler");
    permissionlessGenericHandlerInstance =
      await PermissionlessGenericHandlerContract.deploy(
        await bridgeInstance.getAddress(),
      );

    const TestStoreContract = await ethers.getContractFactory("TestStore");
    testStoreInstance = await TestStoreContract.deploy();

    erc20ResourceID = createResourceID(
      await ERC20MintableInstance.getAddress(),
      originDomainID,
    );

    genericResourceID = createResourceID(
      await testStoreInstance.getAddress(),
      originDomainID,
    );

    depositFunctionSignature =
      testStoreInstance.interface.getFunction("storeWithDepositor").selector;

    genericProposalData = createPermissionlessGenericDepositData(
      depositFunctionSignature,
      await invalidExecutionContractAddress.getAddress(),
      destinationMaxFee,
      await depositorAccount.getAddress(),
      hashOfTestStore,
    );

    const PermissionlessGenericHandlerSetResourceData =
      constructGenericHandlerSetResourceData(
        depositFunctionSignature,
        blankFunctionDepositorOffset,
        blankFunctionSig,
      );

    await Promise.all([
      ERC20MintableInstance.mint(depositorAccount, initialTokenAmount),
      bridgeInstance.adminSetResource(
        await ERC20HandlerInstance.getAddress(),
        erc20ResourceID,
        await ERC20MintableInstance.getAddress(),
        emptySetResourceData,
      ),
      bridgeInstance.adminSetResource(
        await permissionlessGenericHandlerInstance.getAddress(),
        genericResourceID,
        await testStoreInstance.getAddress(),
        ethers.toBeHex(PermissionlessGenericHandlerSetResourceData),
      ),
    ]);

    await Promise.all([
      ERC20MintableInstance.connect(depositorAccount).approve(
        await ERC20HandlerInstance.getAddress(),
        5000,
      ),
    ]);

    erc20DepositProposalData = createERCDepositData(
      depositAmount,
      20,
      await recipientAccount.getAddress(),
    );

    proposalsForExecution = [
      {
        originDomainID: originDomainID,
        depositNonce: expectedDepositNonces[0],
        resourceID: erc20ResourceID,
        data: erc20DepositProposalData,
      },
      {
        originDomainID: originDomainID,
        depositNonce: expectedDepositNonces[4],
        resourceID: genericResourceID,
        data: genericProposalData,
      },
    ];
  });

  it(`[executeProposal - ERC20] - Should not revert if handler execution failed.
      FailedHandlerExecution event should be emitted`, async () => {
    const depositProposalBeforeFailedExecute =
      await bridgeInstance.isProposalExecuted(
        originDomainID,
        expectedDepositNonces[0],
      );

    // depositNonce is not used
    assert.isFalse(depositProposalBeforeFailedExecute);

    const executeTx = await bridgeInstance
      .connect(relayer1)
      .executeProposal(proposalsForExecution[0]);

    await expect(executeTx)
      .to.emit(bridgeInstance, "FailedHandlerExecution")
      .withArgs(
        "0x08c379a0" + // func signature
          "0000000000000000000000000000000000000000000000000000000000000020" +
          "0000000000000000000000000000000000000000000000000000000000000016" +
          ethers.encodeBytes32String("Something bad happened").substring(2),
        originDomainID,
        expectedDepositNonces[0],
      );

    const depositProposalAfterFailedExecute =
      await bridgeInstance.isProposalExecuted(
        originDomainID,
        expectedDepositNonces[0],
      );

    // depositNonce is not used
    assert.isFalse(depositProposalAfterFailedExecute);
  });

  it(`[executeProposals] - Should not revert if handler execute is reverted and continue to process next execution.
      FailedHandlerExecution event should be emitted with expected values.`, async () => {
    const depositProposalBeforeFailedExecute =
      await bridgeInstance.isProposalExecuted(
        originDomainID,
        expectedDepositNonces[0],
      );

    // depositNonce is not used
    assert.isFalse(depositProposalBeforeFailedExecute);

    // check that all nonces in nonce set are 0
    const noncesSetBeforeDeposit = await bridgeInstance.usedNonces(
      originDomainID,
      0,
    );
    assert.deepEqual(
      decimalToPaddedBinary(noncesSetBeforeDeposit),
      // nonces:                                          ...9876543210
      "0000000000000000000000000000000000000000000000000000000000000000",
    );

    const executeTx = await bridgeInstance
      .connect(relayer1)
      .executeProposals(proposalsForExecution);

    await expect(executeTx)
      .to.emit(bridgeInstance, "FailedHandlerExecution")
      .withArgs(
        "0x08c379a0" + // func signature
          "0000000000000000000000000000000000000000000000000000000000000020" +
          "0000000000000000000000000000000000000000000000000000000000000016" +
          ethers.encodeBytes32String("Something bad happened").substring(2),
        originDomainID,
        expectedDepositNonces[0],
      );

    const erc20depositProposalAfterFailedExecute =
      await bridgeInstance.isProposalExecuted(
        originDomainID,
        expectedDepositNonces[0],
      );
    // depositNonce for failed ERC20 deposit is unset
    assert.isFalse(erc20depositProposalAfterFailedExecute);

    const genericDepositProposal = await bridgeInstance.isProposalExecuted(
      originDomainID,
      expectedDepositNonces[4],
    );
    // depositNonce for generic deposit is used
    assert.isTrue(genericDepositProposal);

    // recipient ERC20 token balances hasn't changed
    const recipientERC20Balance =
      await ERC20MintableInstance.balanceOf(recipientAccount);
    assert.strictEqual(recipientERC20Balance, BigInt(0));

    // check that other nonces in nonce set are not affected after failed deposit
    const noncesSetAfterDeposit = await bridgeInstance.usedNonces(
      originDomainID,
      0,
    );
    assert.deepEqual(
      decimalToPaddedBinary(noncesSetAfterDeposit),
      // nonces:                                          ...9876543210
      "0000000000000000000000000000000000000000000000000000000000100000",
    );

    // check that 'ProposalExecution' event has been emitted with proper values for generic deposit
    await expect(executeTx)
      .to.emit(bridgeInstance, "ProposalExecution")
      .withArgs(
        originDomainID,
        expectedDepositNonces[4],
        hashMessage,
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["bool", "uint256", "bytes32"],
          [true, handlerResponseLength, contractCallReturndata],
        ),
      );
  });
});
