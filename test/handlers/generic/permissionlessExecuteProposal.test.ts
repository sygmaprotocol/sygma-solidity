// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

import { ethers } from "hardhat";
import { assert, expect } from "chai";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { hashMessage } from "ethers";
import {
  deployBridgeContracts,
  createResourceID,
  constructGenericHandlerSetResourceData,
  createPermissionlessGenericDepositData,
  createPermissionlessGenericExecutionData,
  blankFunctionDepositorOffset,
  blankFunctionSig,
} from "../../helpers";
import type {
  TestDeposit,
  Bridge,
  PermissionlessGenericHandler,
  TestStore,
} from "../../../typechain-types";

describe("PermissionlessGenericHandler - [Execute Proposal]", () => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const expectedDepositNonce = 1;

  const feeData = "0x";
  const destinationMaxFee = BigInt(900000);
  const hashOfTestStore = ethers.keccak256("0xc0ffee");
  const handlerResponseLength = 64;
  const contractCallReturndata = ethers.ZeroHash;

  let bridgeInstance: Bridge;
  let routerInstance: Router;
  let executorInstance: Executor;
  let permissionlessGenericHandlerInstance: PermissionlessGenericHandler;
  let testStoreInstance: TestStore;
  let testDepositInstance: TestDeposit;
  let depositorAccount: HardhatEthersSigner;
  let relayerAccount: HardhatEthersSigner;
  let invalidExecutionContractAddress: HardhatEthersSigner;

  let resourceID: string;
  let depositFunctionSignature: string;
  let depositData: string;
  let depositDataHash: string;
  let proposal: {
    originDomainID: number;
    depositNonce: number;
    data: string;
    resourceID: string;
  };

  beforeEach(async () => {
    [, depositorAccount, relayerAccount, invalidExecutionContractAddress] =
      await ethers.getSigners();

    [bridgeInstance, routerInstance, executorInstance] =
      await deployBridgeContracts(destinationDomainID);
    const PermissionlessGenericHandlerContract =
      await ethers.getContractFactory("PermissionlessGenericHandler");
    permissionlessGenericHandlerInstance =
      await PermissionlessGenericHandlerContract.deploy(
        await bridgeInstance.getAddress(),
        await executorInstance.getAddress(),
      );
    const TestStoreContract = await ethers.getContractFactory("TestStore");
    testStoreInstance = await TestStoreContract.deploy();
    const TestDepositContract = await ethers.getContractFactory("TestDeposit");
    testDepositInstance = await TestDepositContract.deploy();

    resourceID = createResourceID(
      await testStoreInstance.getAddress(),
      originDomainID,
    );

    depositFunctionSignature =
      testStoreInstance.interface.getFunction("storeWithDepositor").selector;

    const PermissionlessGenericHandlerSetResourceData =
      constructGenericHandlerSetResourceData(
        depositFunctionSignature,
        blankFunctionDepositorOffset,
        blankFunctionSig,
      );
    await bridgeInstance.adminSetResource(
      await permissionlessGenericHandlerInstance.getAddress(),
      resourceID,
      await testStoreInstance.getAddress(),
      ethers.toBeHex(PermissionlessGenericHandlerSetResourceData),
    );

    depositData = createPermissionlessGenericDepositData(
      depositFunctionSignature,
      await testStoreInstance.getAddress(),
      destinationMaxFee,
      await depositorAccount.getAddress(),
      hashOfTestStore,
    );
    depositDataHash = ethers.keccak256(
      (await permissionlessGenericHandlerInstance.getAddress()) +
        depositData.substring(2),
    );
    proposal = {
      originDomainID: originDomainID,
      depositNonce: expectedDepositNonce,
      data: depositData,
      resourceID: resourceID,
    };
  });

  it("deposit can be executed successfully", async () => {
    await expect(
      routerInstance
        .connect(depositorAccount)
        .deposit(originDomainID, resourceID, depositData, feeData),
    ).not.to.be.reverted;

    // relayer executes the proposal
    await expect(
      executorInstance.connect(relayerAccount).executeProposal(proposal),
    ).not.to.be.reverted;

    // Verifying asset was marked as stored in testStoreInstance
    assert.isTrue(await testStoreInstance._assetsStored(hashOfTestStore));
  });

  it("AssetStored event should be emitted", async () => {
    await expect(
      routerInstance
        .connect(depositorAccount)
        .deposit(originDomainID, resourceID, depositData, feeData),
    ).not.to.be.reverted;

    // relayer executes the proposal
    const executeTx = await executorInstance
      .connect(relayerAccount)
      .executeProposal(proposal);

    await expect(executeTx)
      .to.emit(testStoreInstance, "AssetStored")
      .withArgs(hashOfTestStore);

    assert.isTrue(
      await testStoreInstance._assetsStored(hashOfTestStore),
      "TestStore asset was not successfully stored",
    );
  });

  it("ProposalExecution should be emitted even if handler execution fails", async () => {
    // execution contract address
    const invalidDepositData = createPermissionlessGenericDepositData(
      depositFunctionSignature,
      await invalidExecutionContractAddress.getAddress(),
      destinationMaxFee,
      await depositorAccount.getAddress(),
      hashOfTestStore,
    );

    await expect(
      routerInstance
        .connect(depositorAccount)
        .deposit(originDomainID, resourceID, invalidDepositData, feeData),
    ).not.to.be.reverted;

    // relayerAccount executes the proposal
    const executeTx = await executorInstance
      .connect(relayerAccount)
      .executeProposal(proposal);

    // check that ProposalExecution event is emitted
    await expect(executeTx)
      .to.emit(executorInstance, "ProposalExecution")
      .withArgs(
        originDomainID,
        expectedDepositNonce,
        depositDataHash,
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["bool", "uint256", "bytes32"],
          [true, handlerResponseLength, contractCallReturndata],
        ),
      );

    // check that deposit nonce isn't unmarked as used in bitmap
    assert.isTrue(
      await executorInstance.isProposalExecuted(
        originDomainID,
        expectedDepositNonce,
      ),
    );

    // Check that asset isn't marked as stored in testStoreInstance
    assert.isTrue(await testStoreInstance._assetsStored(hashOfTestStore));
  });

  it("ProposalExecution should be emitted even if gas specified too small", async () => {
    const num = 6;
    const addresses = [
      await bridgeInstance.getAddress(),
      await testStoreInstance.getAddress(),
    ];
    const message = ethers.encodeBytes32String("message");
    const executionData = ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint", "address[]", "bytes"],
      [num, addresses, message],
    );

    // If the target function accepts (address depositor, bytes executionData)
    // then this helper can be used
    const preparedExecutionData =
      await testDepositInstance.prepareDepositData(executionData);
    const depositFunctionSignature =
      testDepositInstance.interface.getFunction("executePacked").selector;
    const tooSmallGas = 500;

    const depositData = createPermissionlessGenericDepositData(
      depositFunctionSignature,
      await testDepositInstance.getAddress(),
      tooSmallGas,
      await depositorAccount.getAddress(),
      preparedExecutionData,
    );

    const proposal = {
      originDomainID: originDomainID,
      depositNonce: expectedDepositNonce,
      data: depositData,
      resourceID: resourceID,
    };
    await expect(
      routerInstance
        .connect(depositorAccount)
        .deposit(originDomainID, resourceID, depositData, feeData),
    ).not.to.be.reverted;

    // relayerAccount executes the proposal
    const executeTx = await executorInstance
      .connect(depositorAccount)
      .executeProposal(proposal);

    // check that ProposalExecution event is emitted
    await expect(executeTx)
      .to.emit(executorInstance, "ProposalExecution")
      .withArgs(
        originDomainID,
        expectedDepositNonce,
        hashMessage,
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["bool", "uint256", "bytes32"],
          [false, handlerResponseLength, contractCallReturndata],
        ),
      );

    await expect(executeTx).not.to.emit(testDepositInstance, "TestExecute");
  });

  it("call with packed depositData should be successful", async () => {
    const num = 5;
    const addresses = [
      await bridgeInstance.getAddress(),
      await testStoreInstance.getAddress(),
    ];
    const message = ethers.encodeBytes32String("message");
    const executionData = ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint", "address[]", "bytes"],
      [num, addresses, message],
    );

    // If the target function accepts (address depositor, bytes executionData)
    // then this helper can be used
    const preparedExecutionData =
      await testDepositInstance.prepareDepositData(executionData);
    const depositFunctionSignature =
      testDepositInstance.interface.getFunction("executePacked").selector;
    const depositData = createPermissionlessGenericDepositData(
      depositFunctionSignature,
      await testDepositInstance.getAddress(),
      destinationMaxFee,
      await depositorAccount.getAddress(),
      preparedExecutionData,
    );

    const proposal = {
      originDomainID: originDomainID,
      depositNonce: expectedDepositNonce,
      data: depositData,
      resourceID: resourceID,
    };
    await expect(
      routerInstance
        .connect(depositorAccount)
        .deposit(originDomainID, resourceID, depositData, feeData),
    ).not.to.be.reverted;

    // relayerAccount executes the proposal
    const executeTx = await executorInstance
      .connect(depositorAccount)
      .executeProposal(proposal);

    // check that ProposalExecution event is emitted
    await expect(executeTx)
      .to.emit(executorInstance, "ProposalExecution")
      .withArgs(
        originDomainID,
        expectedDepositNonce,
        hashMessage,
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["bool", "uint256", "bytes32"],
          [true, handlerResponseLength, contractCallReturndata],
        ),
      );

    await expect(executeTx)
      .to.emit(testDepositInstance, "TestExecute")
      .withArgs(
        await depositorAccount.getAddress(),
        num,
        await testStoreInstance.getAddress(),
        message,
      );
  });

  it("call with unpacked depositData should be successful", async () => {
    const num = 5;
    const addresses = [
      await bridgeInstance.getAddress(),
      await testStoreInstance.getAddress(),
    ];
    const message = ethers.encodeBytes32String("message");

    const executionData = createPermissionlessGenericExecutionData(
      ["uint", "address[]", "bytes"],
      [num, addresses, message],
    );

    const depositFunctionSignature =
      testDepositInstance.interface.getFunction("executeUnpacked").selector;
    const depositData = createPermissionlessGenericDepositData(
      depositFunctionSignature,
      await testDepositInstance.getAddress(),
      destinationMaxFee,
      await depositorAccount.getAddress(),
      executionData,
    );

    const proposal = {
      originDomainID: originDomainID,
      depositNonce: expectedDepositNonce,
      data: depositData,
      resourceID: resourceID,
    };
    await expect(
      routerInstance
        .connect(depositorAccount)
        .deposit(originDomainID, resourceID, depositData, feeData),
    ).not.to.be.reverted;

    // relayer executes the proposal
    const executeTx = await executorInstance
      .connect(depositorAccount)
      .executeProposal(proposal);

    // check that ProposalExecution event is emitted
    await expect(executeTx)
      .to.emit(executorInstance, "ProposalExecution")
      .withArgs(
        originDomainID,
        expectedDepositNonce,
        hashMessage,
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["bool", "uint256", "bytes32"],
          [true, handlerResponseLength, contractCallReturndata],
        ),
      );

    await expect(executeTx)
      .to.emit(testDepositInstance, "TestExecute")
      .withArgs(
        await depositorAccount.getAddress(),
        num,
        await testStoreInstance.getAddress(),
        message,
      );
  });
});
