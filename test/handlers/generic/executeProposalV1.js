/**
 * Copyright 2020 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */

const TruffleAssert = require('truffle-assertions');
const Ethers = require('ethers');
const Helpers = require('../../helpers');

const CentrifugeAssetContract = artifacts.require("CentrifugeAsset");
const GenericHandlerContract = artifacts.require("GenericHandlerV1");

contract('GenericHandlerV1 - [Execute Proposal]', async (accounts) => {
    const originDomainID = 1;
    const destinationDomainID = 2;
    const expectedDepositNonce = 1;

    const depositorAddress = accounts[1];
    const relayer1Address = accounts[2];
    const relayer2Address = accounts[3];

    const feeData = '0x';
    const destinationMaxFee = 2000000;
    const hashOfCentrifugeAsset = Ethers.utils.keccak256('0xc0ffee');

    let BridgeInstance;
    let CentrifugeAssetInstance;

    let resourceID;
    let depositFunctionSignature;
    let GenericHandlerInstance;
    let depositData;
    let proposal;

    beforeEach(async () => {
        await Promise.all([
            BridgeInstance = await Helpers.deployBridge(destinationDomainID, accounts[0]),
            CentrifugeAssetContract.new().then(instance => CentrifugeAssetInstance = instance)
        ]);

        resourceID = Helpers.createResourceID(CentrifugeAssetInstance.address, originDomainID);

        GenericHandlerInstance = await GenericHandlerContract.new(
            BridgeInstance.address);

        await BridgeInstance.adminSetGenericResource(GenericHandlerInstance.address, resourceID, CentrifugeAssetInstance.address, Helpers.blankFunctionSig, Helpers.blankFunctionDepositorOffset, Helpers.blankFunctionSig);

        depositFunctionSignature = Helpers.getFunctionSignature(CentrifugeAssetInstance, 'storeWithDepositor');

        depositData =
         Helpers.createGenericDepositDataV1(
          depositFunctionSignature,
          CentrifugeAssetInstance.address,
          destinationMaxFee,
          depositorAddress,
          hashOfCentrifugeAsset
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

      // Verifying asset was marked as stored in CentrifugeAssetInstance
      assert.isTrue(await CentrifugeAssetInstance._assetsStored.call(hashOfCentrifugeAsset));
  });

    it('AssetStored event should be emitted', async () => {
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

        const internalTx = await TruffleAssert.createTransactionResult(CentrifugeAssetInstance, executeTx.tx);
        TruffleAssert.eventEmitted(internalTx, 'AssetStored', event => {
          return event.asset === hashOfCentrifugeAsset;
        });

        assert.isTrue(await CentrifugeAssetInstance._assetsStored.call(hashOfCentrifugeAsset),
            'Centrifuge Asset was not successfully stored');
    });
});
