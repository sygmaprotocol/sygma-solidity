// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

import { ethers } from "hardhat";
import { assert, expect } from "chai";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { deployBridge } from "../../../helpers";
import type {
  BasicFeeHandler,
  Bridge,
  FeeHandlerRouter,
} from "../../../../typechain-types";

describe("BasicFeeHandler - [changeFee]", () => {
  const domainID = 1;

  let bridgeInstance: Bridge;
  let basicFeeHandlerInstance: BasicFeeHandler;
  let feeHandlerRouterInstance: FeeHandlerRouter;
  let nonAdminAccount: HardhatEthersSigner;

  beforeEach(async () => {
    [, nonAdminAccount] = await ethers.getSigners();

    bridgeInstance = await deployBridge(domainID);
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
  });

  it("[sanity] contract should be deployed successfully", async () => {
    expect(await basicFeeHandlerInstance.getAddress()).not.to.be.undefined;
  });

  it("should set fee", async () => {
    const fee = ethers.parseEther("0.05");
    const changeFeeTx = await basicFeeHandlerInstance.changeFee(fee);

    await expect(changeFeeTx)
      .to.emit(basicFeeHandlerInstance, "FeeChanged")
      .withArgs(ethers.parseEther("0.05"));

    const newFee = await basicFeeHandlerInstance._fee();
    assert.deepEqual(ethers.formatEther(newFee), "0.05");
  });

  it("should not set the same fee", async () => {
    await expect(basicFeeHandlerInstance.changeFee(0)).to.be.rejectedWith(
      "Current fee is equal to new fee",
    );
  });

  it("should require admin role to change fee", async () => {
    await expect(
      basicFeeHandlerInstance.connect(nonAdminAccount).changeFee(1),
    ).to.be.revertedWith("sender doesn't have admin role");
  });
});
