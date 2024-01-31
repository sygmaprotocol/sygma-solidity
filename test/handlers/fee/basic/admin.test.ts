// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

import { ethers } from "hardhat";

import { assert, expect } from "chai";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { createResourceID, deployBridgeContracts } from "../../../helpers";
import type {
  BasicFeeHandler,
  Bridge,
  Router,
  FeeHandlerRouter,
  ERC20PresetMinterPauser,
} from "../../../../typechain-types";

describe("BasicFeeHandler - [admin]", () => {
  const originDomainID = 1;
  const destinationDomainID = 1;
  const routerAddress = "0x1a60efB48c61A79515B170CA61C84DD6dCA80418";

  let bridgeInstance: Bridge;
  let routerInstance: Router;
  let basicFeeHandlerInstance: BasicFeeHandler;
  let originERC20MintableInstance: ERC20PresetMinterPauser;
  let feeHandlerRouterInstance: FeeHandlerRouter;
  let currentFeeHandlerAdmin: HardhatEthersSigner;
  let newBasicFeeHandlerAdmin: HardhatEthersSigner;
  let nonAdminAccount: HardhatEthersSigner;

  let ADMIN_ROLE: string;
  let resourceID: string;

  beforeEach(async () => {
    [currentFeeHandlerAdmin, newBasicFeeHandlerAdmin, nonAdminAccount] =
      await ethers.getSigners();

    [bridgeInstance, routerInstance] = await deployBridgeContracts(
      originDomainID,
      routerAddress,
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
      await routerInstance.getAddress(),
    );
    const ERC20PresetMinterPauserContract = await ethers.getContractFactory(
      "ERC20PresetMinterPauser",
    );
    originERC20MintableInstance = await ERC20PresetMinterPauserContract.deploy(
      "token",
      "TOK",
    );
    const ERC20MintableContract = await ethers.getContractFactory(
      "ERC20PresetMinterPauser",
    );
    originERC20MintableInstance = await ERC20MintableContract.deploy(
      "token",
      "TOK",
    );

    ADMIN_ROLE = await basicFeeHandlerInstance.DEFAULT_ADMIN_ROLE();
    resourceID = createResourceID(
      await originERC20MintableInstance.getAddress(),
      originDomainID,
    );
  });

  it("should set fee property", async () => {
    const fee = 3;
    assert.deepEqual(
      await basicFeeHandlerInstance._domainResourceIDToFee(
        destinationDomainID,
        resourceID,
      ),
      BigInt(0),
    );
    await basicFeeHandlerInstance.changeFee(
      destinationDomainID,
      resourceID,
      fee,
    );
    assert.deepEqual(
      await basicFeeHandlerInstance._domainResourceIDToFee(
        destinationDomainID,
        resourceID,
      ),
      BigInt(fee),
    );
  });

  it("should require admin role to change fee property", async () => {
    const fee = 3;
    await expect(
      basicFeeHandlerInstance
        .connect(nonAdminAccount)
        .changeFee(destinationDomainID, resourceID, fee),
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
