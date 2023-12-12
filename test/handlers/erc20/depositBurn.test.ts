// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
import { ethers } from "hardhat";

import { assert } from "chai";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { deployBridgeContracts, createResourceID } from "../../helpers";
import type {
  Bridge,
  Router,
  Executor,
  ERC20Handler,
  ERC20PresetMinterPauser,
} from "../../../typechain-types";

describe("ERC20Handler - [Deposit Burn ERC20]", () => {
  const domainID = 1;
  const depositAmount = 10;
  const emptySetResourceData = "0x";

  let bridgeInstance: Bridge;
  let routerInstance: Router;
  let executorInstance: Executor;
  let ERC20MintableInstance1: ERC20PresetMinterPauser;
  let ERC20MintableInstance2: ERC20PresetMinterPauser;
  let ERC20HandlerInstance: ERC20Handler;
  let depositorAccount: HardhatEthersSigner;

  let resourceID1: string;
  let resourceID2: string;
  const burnableContractAddresses: Array<string> = [];

  beforeEach(async () => {
    [, depositorAccount] = await ethers.getSigners();

    [bridgeInstance, routerInstance, executorInstance] =
      await deployBridgeContracts(Number(domainID));
    const ERC20MintableContract = await ethers.getContractFactory(
      "ERC20PresetMinterPauser",
    );
    ERC20MintableInstance1 = await ERC20MintableContract.deploy("Token", "TOK");
    ERC20MintableInstance2 = await ERC20MintableContract.deploy("Token", "TOK");
    const ERC20HandlerContract =
      await ethers.getContractFactory("ERC20Handler");
    ERC20HandlerInstance = await ERC20HandlerContract.deploy(
      await bridgeInstance.getAddress(),
      await routerInstance.getAddress(),
      await executorInstance.getAddress(),
    );

    resourceID1 = createResourceID(
      await ERC20MintableInstance1.getAddress(),
      domainID,
    );
    resourceID2 = createResourceID(
      await ERC20MintableInstance2.getAddress(),
      domainID,
    );
    burnableContractAddresses.push(await ERC20MintableInstance1.getAddress());

    await Promise.all([
      ERC20MintableInstance1.connect(depositorAccount).approve(
        await ERC20HandlerInstance.getAddress(),
        depositAmount,
      ),
      bridgeInstance.adminSetResource(
        await ERC20HandlerInstance.getAddress(),
        resourceID1,
        await ERC20MintableInstance1.getAddress(),
        emptySetResourceData,
      ),
      bridgeInstance.adminSetResource(
        await ERC20HandlerInstance.getAddress(),
        resourceID2,
        await ERC20MintableInstance2.getAddress(),
        emptySetResourceData,
      ),
      bridgeInstance.adminSetBurnable(
        await ERC20HandlerInstance.getAddress(),
        await ERC20MintableInstance1.getAddress(),
      ),
    ]);
  });

  it("[sanity] burnableContractAddresses should be marked as burnable", async () => {
    for (const burnableAddress of burnableContractAddresses) {
      const isBurnable = (
        await ERC20HandlerInstance._tokenContractAddressToTokenProperties(
          burnableAddress,
        )
      ).isBurnable;

      assert.isTrue(isBurnable, "Contract wasn't successfully marked burnable");
    }
  });
});
