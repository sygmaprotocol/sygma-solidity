// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

import { assert, expect } from "chai";
import { ethers } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import {
  createResourceID,
  createERCDepositData,
  deployBridgeContracts,
} from "../../helpers";
import type {
  BasicFeeHandler,
  ERC20PresetMinterPauser,
  FeeHandlerRouter,
  Router,
} from "../../../typechain-types";

describe("FeeHandlerRouter", () => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const feeData = "0x";

  let routerInstance: Router;
  let ERC20MintableInstance: ERC20PresetMinterPauser;
  let feeHandlerRouterInstance: FeeHandlerRouter;
  let basicFeeHandlerInstance: BasicFeeHandler;
  let feeHandlerAccount: HardhatEthersSigner;
  let nonAdminAccount: HardhatEthersSigner;
  let whitelistedAccount: HardhatEthersSigner;
  let nonWhitelistedAccount: HardhatEthersSigner;
  let recipientAccount: HardhatEthersSigner;
  let bridgeInstance: HardhatEthersSigner;

  let resourceID: string;

  beforeEach(async () => {
    [
      ,
      recipientAccount,
      feeHandlerAccount,
      nonAdminAccount,
      whitelistedAccount,
      nonWhitelistedAccount,
      bridgeInstance,
    ] = await ethers.getSigners();

    [, routerInstance] = await deployBridgeContracts(originDomainID);

    const ERC20MintableContract = await ethers.getContractFactory(
      "ERC20PresetMinterPauser",
    );
    ERC20MintableInstance = await ERC20MintableContract.deploy("Token", "TOK");
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
    resourceID = createResourceID(
      await ERC20MintableInstance.getAddress(),
      originDomainID,
    );
  });

  it("should successfully set handler to resourceID", async () => {
    assert.deepEqual(
      await feeHandlerRouterInstance._domainResourceIDToFeeHandlerAddress(
        destinationDomainID,
        resourceID,
      ),
      "0x0000000000000000000000000000000000000000",
    );
    await feeHandlerRouterInstance.adminSetResourceHandler(
      destinationDomainID,
      resourceID,
      feeHandlerAccount.getAddress(),
    );
    const newFeeHandler =
      await feeHandlerRouterInstance._domainResourceIDToFeeHandlerAddress(
        destinationDomainID,
        resourceID,
      );
    assert.deepEqual(newFeeHandler, await feeHandlerAccount.getAddress());
  });

  it("should require admin role to set handler for resourceID", async () => {
    await expect(
      feeHandlerRouterInstance
        .connect(nonAdminAccount)
        .adminSetResourceHandler(
          destinationDomainID,
          resourceID,
          feeHandlerAccount.getAddress(),
        ),
    ).to.be.revertedWith("sender doesn't have admin role");
  });

  it("should successfully set whitelist on an address", async () => {
    assert.equal(
      await feeHandlerRouterInstance._whitelist(
        await whitelistedAccount.getAddress(),
      ),
      false,
    );

    const whitelistTx = await feeHandlerRouterInstance.adminSetWhitelist(
      await whitelistedAccount.getAddress(),
      true,
    );
    assert.equal(
      await feeHandlerRouterInstance._whitelist(
        await whitelistedAccount.getAddress(),
      ),
      true,
    );
    await expect(whitelistTx)
      .to.emit(feeHandlerRouterInstance, "WhitelistChanged")
      .withArgs(await whitelistedAccount.getAddress(), true);
  });

  it("should require admin role to set whitelist address", async () => {
    await expect(
      feeHandlerRouterInstance
        .connect(nonAdminAccount)
        .adminSetWhitelist(await nonWhitelistedAccount.getAddress(), true),
    ).to.be.revertedWith("sender doesn't have admin role");
  });

  it("should return fee 0 if address whitelisted", async () => {
    await feeHandlerRouterInstance.adminSetWhitelist(
      await whitelistedAccount.getAddress(),
      true,
    );
    await feeHandlerRouterInstance.adminSetResourceHandler(
      destinationDomainID,
      resourceID,
      await basicFeeHandlerInstance.getAddress(),
    );
    await basicFeeHandlerInstance.changeFee(
      destinationDomainID,
      resourceID,
      ethers.parseEther("0.5"),
    );

    const depositData = createERCDepositData(
      100,
      20,
      await recipientAccount.getAddress(),
    );
    const { fee: feeBefore } = await feeHandlerRouterInstance.calculateFee(
      await whitelistedAccount.getAddress(),
      originDomainID,
      destinationDomainID,
      resourceID,
      depositData,
      feeData,
    );
    assert.equal(feeBefore, BigInt(0));
    const { fee: feeAfter } = await feeHandlerRouterInstance.calculateFee(
      await nonWhitelistedAccount.getAddress(),
      originDomainID,
      destinationDomainID,
      resourceID,
      depositData,
      feeData,
    );
    assert.equal(feeAfter, ethers.parseEther("0.5"));
  });

  it("should revert if whitelisted address provides fee", async () => {
    await feeHandlerRouterInstance.adminSetWhitelist(
      await whitelistedAccount.getAddress(),
      true,
    );
    await feeHandlerRouterInstance.adminSetResourceHandler(
      destinationDomainID,
      resourceID,
      await basicFeeHandlerInstance.getAddress(),
    );
    await basicFeeHandlerInstance.changeFee(
      destinationDomainID,
      resourceID,
      ethers.parseEther("0.5"),
    );

    const depositData = createERCDepositData(
      100,
      20,
      await recipientAccount.getAddress(),
    );
    await expect(
      feeHandlerRouterInstance
        .connect(bridgeInstance)
        .collectFee(
          await whitelistedAccount.getAddress(),
          originDomainID,
          destinationDomainID,
          resourceID,
          depositData,
          feeData,
          {
            value: ethers.parseEther("0.5"),
          },
        ),
    ).to.be.revertedWithCustomError(
      feeHandlerRouterInstance,
      "IncorrectFeeSupplied(uint256)",
    );

    await expect(
      feeHandlerRouterInstance
        .connect(bridgeInstance)
        .collectFee(
          nonWhitelistedAccount.getAddress(),
          originDomainID,
          destinationDomainID,
          resourceID,
          depositData,
          feeData,
          {
            value: ethers.parseEther("0.5"),
          },
        ),
    ).not.to.be.reverted;
  });

  it("should not collect fee from whitelisted address", async () => {
    await feeHandlerRouterInstance.adminSetWhitelist(
      await whitelistedAccount.getAddress(),
      true,
    );
    await feeHandlerRouterInstance.adminSetResourceHandler(
      destinationDomainID,
      resourceID,
      await basicFeeHandlerInstance.getAddress(),
    );
    await basicFeeHandlerInstance.changeFee(
      destinationDomainID,
      resourceID,
      ethers.parseEther("0.5"),
    );

    const depositData = createERCDepositData(
      100,
      20,
      await recipientAccount.getAddress(),
    );
    await expect(
      feeHandlerRouterInstance
        .connect(bridgeInstance)
        .collectFee(
          await whitelistedAccount.getAddress(),
          originDomainID,
          destinationDomainID,
          resourceID,
          depositData,
          feeData,
          {
            from: await bridgeInstance.getAddress(),
            value: "0",
          },
        ),
    ).not.to.be.reverted;
  });
});
