/**
 * Copyright 2020 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */

const TruffleAssert = require('truffle-assertions');
const Ethers = require('ethers');
const Helpers = require('../../../helpers');

const ColorsContract = artifacts.require("Colors");
const PermissionlessGenericHandlerContract = artifacts.require("PermissionlessGenericHandler");
const WithDepositorContract = artifacts.require("WithDepositor");
const ReturnDataContract = artifacts.require("ReturnData");

contract('PermissionlessGenericHandler colors example - [deposit]', async (accounts) => {
    const originDomainID = 1;
    const destinationDomainID = 2;
    const expectedDepositNonce = 1;

    const depositorAddress = accounts[1];

    const feeData = '0x';
    const destinationMaxFee = 2000000;
    const hexRedColor = Helpers.toHex("0xD2042D", 32);
    const emptySetResourceData = '0x';

    let BridgeInstance;
    let ColorsInstance;

    let resourceID;
    let depositFunctionSignature;
    let PermissionlessGenericHandlerInstance;
    let depositData;

    beforeEach(async () => {
        await Promise.all([
            BridgeInstance = await Helpers.deployBridge(originDomainID, accounts[0]),
            ColorsContract.new().then(instance => ColorsInstance = instance),
            WithDepositorContract.new().then(instance => WithDepositorInstance = instance),
            ReturnDataContract.new().then(instance => ReturnDataInstance = instance),
        ]);

        resourceID = Helpers.createResourceID(ColorsInstance.address, originDomainID)

        PermissionlessGenericHandlerInstance = await PermissionlessGenericHandlerContract.new(
            BridgeInstance.address);

        await BridgeInstance.adminSetResource(PermissionlessGenericHandlerInstance.address, resourceID, ColorsInstance.address, emptySetResourceData);

        depositFunctionSignature = Helpers.getFunctionSignature(ColorsInstance, 'setColor');


        depositData = Helpers.createPermissionlessGenericDepositData(
            depositFunctionSignature,
            ColorsInstance.address,
            destinationMaxFee,
            depositorAddress,
            hexRedColor,
            false // don't append depositor for destination chain check
        );

        // set MPC address to unpause the Bridge
        await BridgeInstance.endKeygen(Helpers.mpcAddress);
    });

    it('deposit can be made successfully', async () => {
        await TruffleAssert.passes(BridgeInstance.deposit(
            destinationDomainID,
            resourceID,
            depositData,
            feeData,
            { from: depositorAddress }
        ));
    });

    it('depositEvent is emitted with expected values', async () => {
        const depositTx = await BridgeInstance.deposit(
            destinationDomainID,
            resourceID,
            depositData,
            feeData,
            { from: depositorAddress }
        );

        TruffleAssert.eventEmitted(depositTx, 'Deposit', (event) => {
            return event.destinationDomainID.toNumber() === destinationDomainID &&
                event.resourceID === resourceID.toLowerCase() &&
                event.depositNonce.toNumber() === expectedDepositNonce &&
                event.user === depositorAddress &&
                event.data === depositData &&
                event.handlerResponse === null
        });
    });

    it('deposit data should be of required length', async () => {
      const invalidDepositData = "0x" + "02a3d".repeat(31);

      await TruffleAssert.reverts(BridgeInstance.deposit(
          destinationDomainID,
          resourceID,
          invalidDepositData,
          feeData,
          { from: depositorAddress }
      ), "Incorrect data length");
    });

    it('should revert if metadata encoded depositor does not match deposit depositor', async () => {
      const invalidDepositorAddress = accounts[2];

      const invalidDepositData = Helpers.createPermissionlessGenericDepositData(
        depositFunctionSignature,
        ColorsInstance.address,
        destinationMaxFee,
        invalidDepositorAddress,
        hexRedColor,
        false // don't append depositor for destination chain check
      );

      await TruffleAssert.reverts(BridgeInstance.deposit(
          destinationDomainID,
          resourceID,
          invalidDepositData,
          feeData,
          { from: depositorAddress }
      ), "incorrect depositor in deposit data");
    });
});
