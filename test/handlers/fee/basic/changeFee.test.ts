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

describe("BasicFeeHandler - [changeFee]", () => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const routerAddress = "0x1a60efB48c61A79515B170CA61C84DD6dCA80418";

  let bridgeInstance: Bridge;
  let routerInstance: Router;
  let basicFeeHandlerInstance: BasicFeeHandler;
  let originERC20MintableInstance: ERC20PresetMinterPauser;
  let feeHandlerRouterInstance: FeeHandlerRouter;
  let nonAdminAccount: HardhatEthersSigner;

  let resourceID: string;

  beforeEach(async () => {
    [, nonAdminAccount] = await ethers.getSigners();

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

    resourceID = createResourceID(
      await originERC20MintableInstance.getAddress(),
      originDomainID,
    );
    const ERC20MintableContract = await ethers.getContractFactory(
      "ERC20PresetMinterPauser",
    );
    originERC20MintableInstance = await ERC20MintableContract.deploy(
      "token",
      "TOK",
    );
    resourceID = createResourceID(
      await originERC20MintableInstance.getAddress(),
      originDomainID,
    );
  });

  it("[sanity] contract should be deployed successfully", async () => {
    expect(await basicFeeHandlerInstance.getAddress()).not.to.be.undefined;
  });

  it("should set fee", async () => {
    const fee = ethers.parseEther("0.05");
    const changeFeeTx = await basicFeeHandlerInstance.changeFee(
      destinationDomainID,
      resourceID,
      fee,
    );

    await expect(changeFeeTx)
      .to.emit(basicFeeHandlerInstance, "FeeChanged")
      .withArgs(ethers.parseEther("0.05"));

    const newFee = await basicFeeHandlerInstance._domainResourceIDToFee(
      destinationDomainID,
      resourceID,
    );
    assert.deepEqual(ethers.formatEther(newFee), "0.05");
  });

  it("should not set the same fee", async () => {
    await expect(
      basicFeeHandlerInstance.changeFee(destinationDomainID, resourceID, 0),
    ).to.be.rejectedWith("Current fee is equal to new fee");
  });

  it("should require admin role to change fee", async () => {
    await expect(
      basicFeeHandlerInstance
        .connect(nonAdminAccount)
        .changeFee(destinationDomainID, resourceID, 1),
    ).to.be.revertedWith("sender doesn't have admin role");
  });
});
