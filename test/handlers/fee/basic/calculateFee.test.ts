// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

import { ethers } from "hardhat";
import { assert } from "chai";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import {
  deployBridge,
  createResourceID,
  createERCDepositData,
} from "../../../helpers";
import type {
  Bridge,
  BasicFeeHandler,
  ERC20Handler,
  ERC20PresetMinterPauser,
  FeeHandlerRouter,
} from "../../../../typechain-types";

describe("BasicFeeHandler - [calculateFee]", () => {
  const originDomainID = 1;
  const destinationDomainID = 2;

  const feeData = "0x";
  const emptySetResourceData = "0x";

  let bridgeInstance: Bridge;
  let ERC20MintableInstance: ERC20PresetMinterPauser;
  let ERC20HandlerInstance: ERC20Handler;
  let feeHandlerRouterInstance: FeeHandlerRouter;
  let basicFeeHandlerInstance: BasicFeeHandler;
  let recipientAccount: HardhatEthersSigner;
  let relayer1: HardhatEthersSigner;

  let resourceID: string;
  let depositData: string;

  beforeEach(async () => {
    [, , recipientAccount, relayer1] = await ethers.getSigners();

    bridgeInstance = await deployBridge(originDomainID);
    const ERC20MintableContract = await ethers.getContractFactory(
      "ERC20PresetMinterPauser",
    );
    ERC20MintableInstance = await ERC20MintableContract.deploy("Token", "TOK");
    const ERC20HandlerContract =
      await ethers.getContractFactory("ERC20Handler");
    ERC20HandlerInstance = await ERC20HandlerContract.deploy(
      await bridgeInstance.getAddress(),
    );
    const FeeHandlerRouterContract =
      await ethers.getContractFactory("FeeHandlerRouter");
    feeHandlerRouterInstance = await FeeHandlerRouterContract.deploy(
      await bridgeInstance.getAddress(),
    );
    const BasicFeeHandlerContract =
      await ethers.getContractFactory("BasicFeeHandler");
    basicFeeHandlerInstance = await BasicFeeHandlerContract.deploy(
      await bridgeInstance.getAddress(),
      await feeHandlerRouterInstance.getAddress(),
    );

    resourceID = createResourceID(
      await ERC20MintableInstance.getAddress(),
      originDomainID,
    );

    depositData = createERCDepositData(
      100,
      20,
      await recipientAccount.getAddress(),
    );

    await Promise.all([
      bridgeInstance.adminSetResource(
        await ERC20HandlerInstance.getAddress(),
        resourceID,
        await ERC20MintableInstance.getAddress(),
        emptySetResourceData,
      ),
      bridgeInstance.adminChangeFeeHandler(
        await feeHandlerRouterInstance.getAddress(),
      ),
      feeHandlerRouterInstance.adminSetResourceHandler(
        destinationDomainID,
        resourceID,
        basicFeeHandlerInstance.getAddress(),
      ),
    ]);
  });

  it("should return amount of fee", async () => {
    // current fee is set to 0
    const response1 = await feeHandlerRouterInstance.calculateFee(
      relayer1.getAddress(),
      originDomainID,
      destinationDomainID,
      resourceID,
      depositData,
      feeData,
    );

    assert.deepEqual(ethers.formatEther(response1[0]), "0.0");
    // Change fee to 0.5 ether
    await basicFeeHandlerInstance.changeFee(ethers.parseEther("0.5"));
    const response2 = await feeHandlerRouterInstance.calculateFee(
      relayer1.getAddress(),
      originDomainID,
      destinationDomainID,
      resourceID,
      depositData,
      feeData,
    );
    assert.deepEqual(ethers.formatEther(response2[0]), "0.5");
  });
});
