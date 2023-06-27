// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only


const Helpers = require("../../helpers");

const ERC20MintableContract = artifacts.require("ERC20PresetMinterPauserDecimals");
const ERC20HandlerContract = artifacts.require("ERC20Handler");

contract("ERC20Handler - [decimals]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;

  const depositorAddress = accounts[1];
  const recipientAddress = accounts[2];


  const tokenAmount = 100;
  const depositAmount = 10;
  const expectedDepositNonce = 1;
  const setDecimalPlaces = 11;
  const emptySetResourceData = "0x";

  let BridgeInstance;
  let ERC20MintableInstance;
  let ERC20HandlerInstance;

  let resourceID;
  let depositProposalData;

  beforeEach(async () => {
      await Promise.all([
          BridgeInstance = await Helpers.deployBridge(originDomainID, accounts[0]),
          ERC20MintableContract.new("token", "TOK", 11).then(instance => ERC20MintableInstance = instance)
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

      depositProposalData = Helpers.createERCDepositData(depositAmount, 20, recipientAddress)

      await Promise.all([
          ERC20HandlerContract.new(BridgeInstance.address).then(instance => ERC20HandlerInstance = instance),
          ERC20MintableInstance.mint(depositorAddress, tokenAmount)
      ]);

      await Promise.all([
          ERC20MintableInstance.approve(ERC20HandlerInstance.address, tokenAmount, {from: depositorAddress}),
          BridgeInstance.adminSetResource(
            ERC20HandlerInstance.address,
            resourceID,
            ERC20MintableInstance.address,
            // set decimal places for handler and token
            emptySetResourceData
          )
      ]);

      // set MPC address to unpause the Bridge
      await BridgeInstance.endKeygen(Helpers.mpcAddress);
  });

  it("[sanity] decimals value is not set if 'adminSetResource' is called with empty args", async () => {
      const ERC20MintableInstanceDecimals = (await ERC20HandlerInstance._tokenContractAddressToTokenProperties.call(
        await ERC20MintableInstance.address
      )).decimals;

      assert.strictEqual(ERC20MintableInstanceDecimals.isSet, false)
      assert.strictEqual(ERC20MintableInstanceDecimals["externalDecimals"], "0")
  });

  it("[sanity] decimals value is set if args are provided to 'adminSetResource'", async () => {
      await BridgeInstance.adminSetResource(
        ERC20HandlerInstance.address,
        resourceID,
        ERC20MintableInstance.address,
        // set decimal places for handler and token
        setDecimalPlaces
      );

      const ERC20MintableInstanceDecimals = (await ERC20HandlerInstance._tokenContractAddressToTokenProperties.call(
        ERC20MintableInstance.address
      )).decimals;

      assert.strictEqual(ERC20MintableInstanceDecimals.isSet, true);
      assert.strictEqual(ERC20MintableInstanceDecimals["externalDecimals"], "11");
      assert.strictEqual(
        ERC20MintableInstanceDecimals["externalDecimals"],
        (await ERC20MintableInstance.decimals()).toString()
      );
  });
});
