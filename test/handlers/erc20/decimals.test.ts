// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

import { assert } from "chai";
import { ethers } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { deployBridgeContracts, createResourceID } from "../../helpers";
import type {
  Bridge,
  Router,
  Executor,
  ERC20Handler,
  ERC20PresetMinterPauser,
} from "../../../typechain-types";

describe("ERC20Handler - [decimals]", () => {
  const originDomainID = 1;

  let bridgeInstance: Bridge;
  let routerInstance: Router;
  let executorInstance: Executor;
  let ERC20MintableInstance: ERC20PresetMinterPauser;
  let ERC20HandlerInstance: ERC20Handler;
  let depositorAccount: HardhatEthersSigner;

  const tokenAmount = 100;
  const setDecimalPlaces = ethers.zeroPadValue(ethers.toBeHex(11), 1);
  const emptySetResourceData = "0x";
  const routerAddress = "0x1a60efB48c61A79515B170CA61C84DD6dCA80418";

  let resourceID: string;

  beforeEach(async () => {
    [, depositorAccount] = await ethers.getSigners();

    [bridgeInstance, routerInstance, executorInstance] =
      await deployBridgeContracts(originDomainID, routerAddress);
    const ERC20MintableContract = await ethers.getContractFactory(
      "ERC20PresetMinterPauserDecimals",
    );
    ERC20MintableInstance = await ERC20MintableContract.deploy(
      "Token",
      "TOK",
      11,
    );
    const ERC20HandlerContract =
      await ethers.getContractFactory("ERC20Handler");
    ERC20HandlerInstance = await ERC20HandlerContract.deploy(
      await bridgeInstance.getAddress(),
      await routerInstance.getAddress(),
      await executorInstance.getAddress(),
    );

    resourceID = createResourceID(
      await ERC20MintableInstance.getAddress(),
      originDomainID,
    );

    await Promise.all([
      ERC20MintableInstance.connect(depositorAccount).approve(
        await ERC20HandlerInstance.getAddress(),
        tokenAmount,
      ),
      bridgeInstance.adminSetResource(
        await ERC20HandlerInstance.getAddress(),
        resourceID,
        await ERC20MintableInstance.getAddress(),
        // set decimal places for handler and token
        emptySetResourceData,
      ),
    ]);
  });

  it("[sanity] decimals value is not set if 'adminSetResource' is called with empty args", async () => {
    const ERC20MintableInstanceDecimals = (
      await ERC20HandlerInstance._tokenContractAddressToTokenProperties(
        await ERC20MintableInstance.getAddress(),
      )
    ).decimals;

    assert.strictEqual(ERC20MintableInstanceDecimals.isSet, false);
    assert.strictEqual(
      ERC20MintableInstanceDecimals["externalDecimals"],
      BigInt(0),
    );
  });

  it("[sanity] decimals value is set if args are provided to 'adminSetResource'", async () => {
    await bridgeInstance.adminSetResource(
      await ERC20HandlerInstance.getAddress(),
      resourceID,
      await ERC20MintableInstance.getAddress(),
      // set decimal places for handler and token
      setDecimalPlaces,
    );

    const ERC20MintableInstanceDecimals = (
      await ERC20HandlerInstance._tokenContractAddressToTokenProperties(
        await ERC20MintableInstance.getAddress(),
      )
    ).decimals;

    assert.strictEqual(ERC20MintableInstanceDecimals.isSet, true);
    assert.strictEqual(
      ERC20MintableInstanceDecimals["externalDecimals"],
      BigInt(11),
    );
    assert.strictEqual(
      ERC20MintableInstanceDecimals["externalDecimals"],
      await ERC20MintableInstance.decimals(),
    );
  });
});
