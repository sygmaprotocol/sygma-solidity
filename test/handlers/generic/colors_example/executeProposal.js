/**
 * Copyright 2020 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */

const TruffleAssert = require('truffle-assertions');
const Ethers = require('ethers');
const Helpers = require('../../../helpers');

const ColorsContract = artifacts.require("Colors");
const PermissionlessGenericHandlerContract = artifacts.require("PermissionlessGenericHandler");

contract('PermissionlessGenericHandler colors example - [Execute Proposal]', async (accounts) => {
    const originDomainID = 1;
    const destinationDomainID = 2;
    const expectedDepositNonce = 1;

    const depositorAddress = accounts[1];
    const relayer1Address = accounts[2];
    const relayer2Address = accounts[3];

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
    let proposal;

    beforeEach(async () => {
        await Promise.all([
            BridgeInstance = await Helpers.deployBridge(destinationDomainID, accounts[0]),
            ColorsContract.new().then(instance => ColorsInstance = instance)
        ]);

        resourceID = Helpers.createResourceID(ColorsInstance.address, originDomainID);

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

        proposal = {
          originDomainID: originDomainID,
          depositNonce: expectedDepositNonce,
          data: depositData,
          resourceID: resourceID
        };

        // set MPC address to unpause the Bridge
        await BridgeInstance.endKeygen(Helpers.mpcAddress);
    });

  it('deposit can be executed successfully', async () => {
      const proposalSignedData = await Helpers.signTypedProposal(BridgeInstance.address, [proposal]);
      await TruffleAssert.passes(BridgeInstance.deposit(
          originDomainID,
          resourceID,
          depositData,
          feeData,
          { from: depositorAddress }
      ));

      // relayer1 executes the proposal
      await TruffleAssert.passes(BridgeInstance.executeProposal(
          proposal,
          proposalSignedData,
          { from: relayer1Address }
      ));

      // Verifying color was stored in ColorsInstance contract
      const storedColor = await ColorsInstance.findColor(hexRedColor);
      assert.equal(storedColor, hexRedColor);
  });

    it('setColor event should be emitted', async () => {
        const proposalSignedData = await Helpers.signTypedProposal(BridgeInstance.address, [proposal]);


        await TruffleAssert.passes(BridgeInstance.deposit(
            originDomainID,
            resourceID,
            depositData,
            feeData,
            { from: depositorAddress }
        ));

        // relayer1 executes the proposal
        const executeTx = await BridgeInstance.executeProposal(
            proposal,
            proposalSignedData,
            { from: relayer2Address }
        );

        const internalTx = await TruffleAssert.createTransactionResult(ColorsInstance, executeTx.tx);
        TruffleAssert.eventEmitted(internalTx, 'setColorEvent', event => {
          return event.color === hexRedColor;
        });
      });
});
