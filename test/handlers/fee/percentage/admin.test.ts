// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

import { ethers } from "hardhat";
import { assert, expect } from "chai";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { deployBridgeContracts, createResourceID } from "../../../helpers";
import type {
  Bridge,
  ERC20PresetMinterPauser,
  FeeHandlerRouter,
  PercentageERC20FeeHandlerEVM,
  Router,
} from "../../../../typechain-types";

describe("PercentageFeeHandler - [admin]", () => {
  const originDomainID = 1;
  const destinationDomainID = 1;
  const routerAddress = "0x1a60efB48c61A79515B170CA61C84DD6dCA80418";

  let bridgeInstance: Bridge;
  let routerInstance: Router;
  let percentageFeeHandlerInstance: PercentageERC20FeeHandlerEVM;
  let ERC20MintableInstance: ERC20PresetMinterPauser;
  let feeHandlerRouterInstance: FeeHandlerRouter;
  let currentFeeHandlerAdmin: HardhatEthersSigner;
  let newPercentageFeeHandlerAdmin: HardhatEthersSigner;
  let nonAdminAccount: HardhatEthersSigner;

  let ADMIN_ROLE: string;
  let resourceID: string;

  beforeEach(async () => {
    [currentFeeHandlerAdmin, newPercentageFeeHandlerAdmin, nonAdminAccount] =
      await ethers.getSigners();

    [bridgeInstance, routerInstance] = await deployBridgeContracts(
      originDomainID,
      routerAddress,
    );
    const ERC20MintableContract = await ethers.getContractFactory(
      "ERC20PresetMinterPauser",
    );
    ERC20MintableInstance = await ERC20MintableContract.deploy("Token", "TOK");
    const FeeHandlerRouterContract =
      await ethers.getContractFactory("FeeHandlerRouter");
    feeHandlerRouterInstance = await FeeHandlerRouterContract.deploy(
      await bridgeInstance.getAddress(),
    );
    const PercentageERC20FeeHandlerEVMContract =
      await ethers.getContractFactory("PercentageERC20FeeHandlerEVM");
    percentageFeeHandlerInstance =
      await PercentageERC20FeeHandlerEVMContract.deploy(
        await bridgeInstance.getAddress(),
        await feeHandlerRouterInstance.getAddress(),
        await routerInstance.getAddress(),
      );

    ADMIN_ROLE = await percentageFeeHandlerInstance.DEFAULT_ADMIN_ROLE();

    resourceID = createResourceID(
      await ERC20MintableInstance.getAddress(),
      originDomainID,
    );
  });

  it("should set fee property", async () => {
    const fee = 60000;
    assert.deepEqual(
      await percentageFeeHandlerInstance._domainResourceIDToFee(
        destinationDomainID,
        resourceID,
      ),
      BigInt(0),
    );
    await percentageFeeHandlerInstance.changeFee(
      destinationDomainID,
      resourceID,
      fee,
    );
    assert.deepEqual(
      await percentageFeeHandlerInstance._domainResourceIDToFee(
        destinationDomainID,
        resourceID,
      ),
      BigInt(fee),
    );
  });

  it("should require admin role to change fee property", async () => {
    const fee = 600;
    await expect(
      percentageFeeHandlerInstance
        .connect(nonAdminAccount)
        .changeFee(destinationDomainID, resourceID, fee),
    ).to.be.revertedWith("sender doesn't have admin role");
  });

  it("should set fee bounds", async () => {
    const newLowerBound = "100";
    const newUpperBound = "300";
    assert.deepEqual(
      (await percentageFeeHandlerInstance._resourceIDToFeeBounds(resourceID))
        .lowerBound,
      BigInt(0),
    );
    assert.deepEqual(
      (await percentageFeeHandlerInstance._resourceIDToFeeBounds(resourceID))
        .upperBound,
      BigInt(0),
    );
    await percentageFeeHandlerInstance.changeFeeBounds(
      resourceID,
      newLowerBound,
      newUpperBound,
    );
    assert.deepEqual(
      (
        await percentageFeeHandlerInstance._resourceIDToFeeBounds(resourceID)
      ).lowerBound.toString(),
      newLowerBound,
    );
    assert.deepEqual(
      (
        await percentageFeeHandlerInstance._resourceIDToFeeBounds(resourceID)
      ).upperBound.toString(),
      newUpperBound,
    );
  });

  it("should require admin role to change fee bounds", async () => {
    const lowerBound = 100;
    const upperBound = 300;
    await expect(
      percentageFeeHandlerInstance
        .connect(nonAdminAccount)
        .changeFeeBounds(resourceID, lowerBound, upperBound),
    ).to.be.revertedWith("sender doesn't have admin role");
  });

  it("PercentageFeeHandler admin should be changed to newPercentageFeeHandlerAdmin", async () => {
    // check current admin
    assert.isTrue(
      await percentageFeeHandlerInstance.hasRole(
        ADMIN_ROLE,
        currentFeeHandlerAdmin,
      ),
    );

    await expect(
      percentageFeeHandlerInstance.renounceAdmin(newPercentageFeeHandlerAdmin),
    ).not.to.be.reverted;
    assert.isTrue(
      await percentageFeeHandlerInstance.hasRole(
        ADMIN_ROLE,
        newPercentageFeeHandlerAdmin,
      ),
    );

    // check that former admin is no longer admin
    assert.isFalse(
      await percentageFeeHandlerInstance.hasRole(
        ADMIN_ROLE,
        currentFeeHandlerAdmin,
      ),
    );
  });
});
