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

describe("BasicFeeHandler - [admin]", () => {
  const domainID = 1;

  let bridgeInstance: Bridge;
  let basicFeeHandlerInstance: BasicFeeHandler;
  let feeHandlerRouterInstance: FeeHandlerRouter;
  let currentFeeHandlerAdmin: HardhatEthersSigner;
  let newBasicFeeHandlerAdmin: HardhatEthersSigner;
  let nonAdminAccount: HardhatEthersSigner;

  let ADMIN_ROLE: string;

  beforeEach(async () => {
    [currentFeeHandlerAdmin, newBasicFeeHandlerAdmin, nonAdminAccount] =
      await ethers.getSigners();

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

    ADMIN_ROLE = await basicFeeHandlerInstance.DEFAULT_ADMIN_ROLE();
  });

  it("should set fee property", async () => {
    const fee = 3;
    assert.deepEqual(await basicFeeHandlerInstance._fee(), BigInt(0));
    await basicFeeHandlerInstance.changeFee(fee);
    assert.deepEqual(await basicFeeHandlerInstance._fee(), BigInt(fee));
  });

  it("should require admin role to change fee property", async () => {
    const fee = 3;
    await expect(
      basicFeeHandlerInstance.connect(nonAdminAccount).changeFee(fee),
    ).to.be.revertedWith("sender doesn't have admin role");
  });

  it("BasicFeeHandler admin should be changed to newBasicFeeHandlerAdmin", async () => {
    // check current admin
    assert.isTrue(
      await basicFeeHandlerInstance.hasRole(ADMIN_ROLE, currentFeeHandlerAdmin),
    );

    await expect(basicFeeHandlerInstance.renounceAdmin(newBasicFeeHandlerAdmin))
      .not.to.be.reverted;
    assert.isTrue(
      await basicFeeHandlerInstance.hasRole(
        ADMIN_ROLE,
        newBasicFeeHandlerAdmin,
      ),
    );

    // check that former admin is no longer admin
    assert.isFalse(
      await basicFeeHandlerInstance.hasRole(ADMIN_ROLE, currentFeeHandlerAdmin),
    );
  });
});
