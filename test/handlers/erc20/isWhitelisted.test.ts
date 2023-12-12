// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

import { ethers } from "hardhat";
import { assert, expect } from "chai";
import { deployBridgeContracts } from "../../helpers";
import type {
  Bridge,
  Router,
  Executor,
  ERC20Handler,
  ERC20PresetMinterPauser,
} from "../../../typechain-types";

describe("ERC20Handler - [isWhitelisted]", () => {
  const domainID = 1;
  const emptySetResourceData = "0x";

  let bridgeInstance: Bridge;
  let routerInstance: Router;
  let executorInstance: Executor;
  let ERC20MintableInstance: ERC20PresetMinterPauser;
  let ERC20HandlerInstance: ERC20Handler;

  let resourceID1: string;

  beforeEach(async () => {
    [bridgeInstance, routerInstance, executorInstance] =
      await deployBridgeContracts(domainID);
    const ERC20MintableContract = await ethers.getContractFactory(
      "ERC20PresetMinterPauser",
    );
    ERC20MintableInstance = await ERC20MintableContract.deploy("Token", "TOK");
    const ERC20HandlerContract =
      await ethers.getContractFactory("ERC20Handler");
    ERC20HandlerInstance = await ERC20HandlerContract.deploy(
      await bridgeInstance.getAddress(),
      await routerInstance.getAddress(),
      await executorInstance.getAddress(),
    );

    resourceID1 = ethers.zeroPadValue(
      (await ERC20MintableInstance.getAddress()) +
        ethers.toBeHex(domainID).substring(2),
      32,
    );
  });

  it("[sanity] contract should be deployed successfully", async () => {
    expect(await ERC20HandlerInstance.getAddress()).not.to.be.undefined;
  });

  it("initialContractAddress should be whitelisted", async () => {
    await bridgeInstance.adminSetResource(
      await ERC20HandlerInstance.getAddress(),
      resourceID1,
      await ERC20MintableInstance.getAddress(),
      emptySetResourceData,
    );
    const isWhitelisted = (
      await ERC20HandlerInstance._tokenContractAddressToTokenProperties(
        await ERC20MintableInstance.getAddress(),
      )
    ).isWhitelisted;

    assert.isTrue(isWhitelisted, "Contract wasn't successfully whitelisted");
  });
});
