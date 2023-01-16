/**
 * Copyright 2020 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */

const TruffleAssert = require('truffle-assertions');
const Ethers = require('ethers');

const Helpers = require('../../helpers');

const ERC20MintableContract = artifacts.require("ERC20PresetMinterPauser");
const ERC20HandlerContract = artifacts.require("ERC20Handler");

contract('ERC20Handler - [decimals]', async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;

  const depositorAddress = accounts[1];
  const recipientAddress = accounts[2];
  const relayerAddress = accounts[3];


  const tokenAmount = 100;
  const depositAmount = 10;
  const expectedDepositNonce = 1;
  const feeData = '0x';
  const emptySetResourceData = '0x';

  let BridgeInstance;
  let ERC20MintableInstance;
  let ERC20HandlerInstance;

  let resourceID;
  let depositData;
  let depositProposalData;

  beforeEach(async () => {
      await Promise.all([
          BridgeInstance = await Helpers.deployBridge(originDomainID, accounts[0]),
          ERC20MintableContract.new("token", "TOK").then(instance => ERC20MintableInstance = instance)
      ]);

      resourceID = Helpers.createResourceID(ERC20MintableInstance.address, originDomainID);
      initialResourceIDs = [resourceID];
      initialContractAddresses = [ERC20MintableInstance.address];

      proposal = {
        originDomainID: destinationDomainID,
        depositNonce: expectedDepositNonce,
        resourceID: resourceID,
        data: depositProposalData
      };

      depositData = Helpers.createERCDepositData(depositAmount, 20, recipientAddress);
      depositProposalData = Helpers.createERCDepositData(depositAmount, 20, recipientAddress)

      await Promise.all([
          ERC20HandlerContract.new(BridgeInstance.address).then(instance => ERC20HandlerInstance = instance),
          ERC20MintableInstance.mint(depositorAddress, tokenAmount)
      ]);

      await Promise.all([
          ERC20MintableInstance.approve(ERC20HandlerInstance.address, tokenAmount, { from: depositorAddress }),
          BridgeInstance.adminSetResource(ERC20HandlerInstance.address, resourceID, ERC20MintableInstance.address, emptySetResourceData)
      ]);

      // set MPC address to unpause the Bridge
      await BridgeInstance.endKeygen(Helpers.mpcAddress);

      // set decimals value for handler and token
      await BridgeInstance.adminSetDecimals(ERC20HandlerInstance.address, ERC20MintableInstance.address, 10, 18);
  });

  it('[sanity] decimals value is set', async () => {
      const ERC20MintableInstanceDecimals = await ERC20HandlerInstance._decimals.call(ERC20MintableInstance.address);

      assert.strictEqual(ERC20MintableInstanceDecimals.srcDecimals.toNumber(), 10)
      assert.strictEqual(ERC20MintableInstanceDecimals.destDecimals.toNumber(), 18)
  });

  it('Should not revert if handler execution failed. FailedHandlerExecution event should be emitted', async () => {
      // set decimals values to 0 to trigger conversion check
      await BridgeInstance.adminSetDecimals(ERC20HandlerInstance.address, ERC20MintableInstance.address, 0, 0);

      const proposalSignedData = await Helpers.signTypedProposal(BridgeInstance.address, [proposal]);

      // depositorAddress makes initial deposit of depositAmount
      await TruffleAssert.passes(BridgeInstance.deposit(
          destinationDomainID,
          resourceID,
          depositData,
          feeData,
          { from: depositorAddress }
      ));

      const executeTx = await BridgeInstance.executeProposal(
        proposal,
        proposalSignedData,
        { from: relayerAddress }
      );

    TruffleAssert.eventEmitted(executeTx, 'FailedHandlerExecution', (event) => {
        return event.originDomainID.toNumber() === destinationDomainID &&
            event.depositNonce.toNumber() === expectedDepositNonce &&
            Ethers.utils.parseBytes32String('0x' + event.lowLevelData.slice(-64)) === 'Invalid decimals'
    });
  });
});
