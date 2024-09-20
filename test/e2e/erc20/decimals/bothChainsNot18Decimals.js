// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const Ethers = require("ethers");
const TruffleAssert = require("truffle-assertions");

const Helpers = require("../../../helpers");

const ERC20MintableContract = artifacts.require("ERC20PresetMinterPauserDecimals");
const DefaultMessageReceiverContract = artifacts.require("DefaultMessageReceiver");
const ERC20HandlerContract = artifacts.require("ERC20Handler");

contract("E2E ERC20 - Two EVM Chains both with decimal places != 18", async accounts => {
    const adminAddress = accounts[0]

    const originDomainID = 1;
    const originRelayer1Address = accounts[3];

    const destinationDomainID = 2;
    const destinationRelayer1Address = accounts[3];

    const depositorAddress = accounts[1];
    const recipientAddress = accounts[2];
    const originDecimalPlaces = 20;
    const destinationDecimalPlaces = 14;
    const bridgeDefaultDecimalPlaces = 18;
    const initialTokenAmount = Ethers.utils.parseUnits("100", originDecimalPlaces);
    const originDepositAmount = Ethers.utils.parseUnits("14", originDecimalPlaces);
    const destinationDepositAmount = Ethers.utils.parseUnits("14", destinationDecimalPlaces);
    const relayerConvertedAmount = Ethers.utils.parseUnits("14", bridgeDefaultDecimalPlaces);
    const expectedDepositNonce = 1;
    const feeData = "0x";

    let OriginBridgeInstance;
    let OriginERC20MintableInstance;
    let OriginDefaultMessageReceiverInstance;
    let OriginERC20HandlerInstance;
    let originDepositData;
    let originResourceID;
    let originInitialContractAddresses;
    let originBurnableContractAddresses;

    let DestinationBridgeInstance;
    let DestinationERC20MintableInstance;
    let DestinationDefaultMessageReceiverInstance;
    let DestinationERC20HandlerInstance;
    let destinationDepositData;
    let destinationResourceID;
    let destinationInitialContractAddresses;
    let destinationBurnableContractAddresses;

    beforeEach(async () => {
        await Promise.all([
            OriginBridgeInstance = await Helpers.deployBridge(originDomainID, adminAddress),
            DestinationBridgeInstance = await Helpers.deployBridge(destinationDomainID, adminAddress),
            ERC20MintableContract.new("token", "TOK", originDecimalPlaces).then(
              instance => OriginERC20MintableInstance = instance
            ),
            ERC20MintableContract.new("token", "TOK", destinationDecimalPlaces).then(
              instance => DestinationERC20MintableInstance = instance
            )
        ]);

        originResourceID = Helpers.createResourceID(OriginERC20MintableInstance.address, originDomainID);
        originInitialContractAddresses = [OriginERC20MintableInstance.address];
        originBurnableContractAddresses = [OriginERC20MintableInstance.address];

        destinationResourceID = Helpers.createResourceID(DestinationERC20MintableInstance.address, originDomainID);
        destinationInitialContractAddresses = [DestinationERC20MintableInstance.address];
        destinationBurnableContractAddresses = [DestinationERC20MintableInstance.address];

        OriginDefaultMessageReceiverInstance = await DefaultMessageReceiverContract.new(
          [],
          100000
        );
        DestinationDefaultMessageReceiverInstance = await DefaultMessageReceiverContract.new(
          [],
          100000
        );
        await Promise.all([
            ERC20HandlerContract.new(
              OriginBridgeInstance.address,
              OriginDefaultMessageReceiverInstance.address
            ).then(instance => OriginERC20HandlerInstance = instance),
            ERC20HandlerContract.new(
              DestinationBridgeInstance.address,
              DestinationDefaultMessageReceiverInstance.address
            ).then(instance => DestinationERC20HandlerInstance = instance),
        ]);

        await OriginERC20MintableInstance.mint(depositorAddress, initialTokenAmount);

        await OriginERC20MintableInstance.approve(
          OriginERC20HandlerInstance.address,
          originDepositAmount,
          {from: depositorAddress}
        ),
        await OriginERC20MintableInstance.grantRole(
          await OriginERC20MintableInstance.MINTER_ROLE(),
          OriginERC20HandlerInstance.address
        ),
        await DestinationERC20MintableInstance.grantRole(
          await DestinationERC20MintableInstance.MINTER_ROLE(),
          DestinationERC20HandlerInstance.address
        ),
        await OriginBridgeInstance.adminSetResource(
          OriginERC20HandlerInstance.address,
          originResourceID,
          originInitialContractAddresses[0],
          // set decimal places for handler and token
          originDecimalPlaces
        ),
        await OriginBridgeInstance.adminSetBurnable(
          OriginERC20HandlerInstance.address,
          originBurnableContractAddresses[0]
        ),
        await DestinationBridgeInstance.adminSetResource(
          DestinationERC20HandlerInstance.address,
          destinationResourceID,
          destinationInitialContractAddresses[0],
          // set decimal places for handler and token
          destinationDecimalPlaces
        ),
        await DestinationBridgeInstance.adminSetBurnable(
          DestinationERC20HandlerInstance.address,
          destinationBurnableContractAddresses[0]
        );

        originDepositData = Helpers.createERCDepositData(originDepositAmount, 20, recipientAddress);
        destinationDepositData = Helpers.createERCDepositData(destinationDepositAmount, 20, depositorAddress);

        // set MPC address to unpause the Bridge
        await OriginBridgeInstance.endKeygen(Helpers.mpcAddress);
        await DestinationBridgeInstance.endKeygen(Helpers.mpcAddress);
    });

    it("[sanity] check token contract decimals match set decimals on handlers", async () => {
      const originTokenContractDecimals = (await OriginERC20MintableInstance.decimals()).toNumber();
      const originDecimalsSetOnHandler =  (
        await OriginERC20HandlerInstance._tokenContractAddressToTokenProperties.call(
          OriginERC20MintableInstance.address
      )).decimals

      const destinationTokenContractDecimals = (await DestinationERC20MintableInstance.decimals()).toNumber();
      const destinationDecimalsSetOnHandler =  (await DestinationERC20HandlerInstance
        ._tokenContractAddressToTokenProperties.call(DestinationERC20MintableInstance.address
      )).decimals

      assert.strictEqual(
        originTokenContractDecimals.toString(),
        originDecimalsSetOnHandler["externalDecimals"]
      );
      assert.strictEqual(
        destinationTokenContractDecimals.toString(),
        destinationDecimalsSetOnHandler["externalDecimals"]
      );
    });

    it(`E2E: depositAmount of Origin ERC20 owned by depositAddress to Destination ERC20
        owned by recipientAddress and back again`, async () => {


        let depositorBalance;
        let recipientBalance;

        // depositorAddress makes initial deposit of depositAmount
        const originDepositTx = await OriginBridgeInstance.deposit(
          destinationDomainID,
          originResourceID,
          originDepositData,
          feeData,
          {from: depositorAddress}
        );
        await TruffleAssert.passes(originDepositTx);


        // check that deposited amount converted to 18 decimal places is
        // emitted in handlerResponse
        TruffleAssert.eventEmitted(originDepositTx, "Deposit", (event) => {
          return (
            event.destinationDomainID.toNumber() === destinationDomainID &&
            event.resourceID === originResourceID.toLowerCase() &&
            event.depositNonce.toNumber() === expectedDepositNonce &&
            event.data === originDepositData.toLowerCase() &&
            event.handlerResponse === Helpers.toHex(relayerConvertedAmount, 32)
          );
        });

        // this mocks depositProposal data for executing on
        // destination chain which is returned from relayers
        const originDepositProposalData = Helpers.createDepositProposalDataFromHandlerResponse(
          originDepositTx,
          20,
          recipientAddress
        );

        const originDomainProposal = {
          originDomainID: originDomainID,
          depositNonce: expectedDepositNonce,
          data: originDepositProposalData,
          resourceID: destinationResourceID
        };

        const originProposalSignedData = await Helpers.signTypedProposal(
          DestinationBridgeInstance.address,
          [originDomainProposal]
        );

        // destinationRelayer1 executes the proposal
        await TruffleAssert.passes(
          DestinationBridgeInstance.executeProposal(
            originDomainProposal,
            originProposalSignedData,
            {from: destinationRelayer1Address}
          )
        );

        // Assert ERC20 balance was transferred from depositorAddress
        depositorBalance = await OriginERC20MintableInstance.balanceOf(
          depositorAddress
        );
        assert.strictEqual(
          depositorBalance.toString(),
          (initialTokenAmount.sub(originDepositAmount)).toString(),
          "originDepositAmount wasn't transferred from depositorAddress"
        );

        // Assert ERC20 balance was transferred to recipientAddress
        recipientBalance = await DestinationERC20MintableInstance.balanceOf(
          recipientAddress
        );
        assert.strictEqual(
          recipientBalance.toString(),
          destinationDepositAmount.toString(),
          "originDepositAmount wasn't transferred to recipientAddress"
        );

        // At this point a representation of OriginERC20Mintable has been transferred from
        // depositor to the recipient using Both Bridges and DestinationERC20Mintable.
        // Next we will transfer DestinationERC20Mintable back to the depositor

        await DestinationERC20MintableInstance.approve(
          DestinationERC20HandlerInstance.address,
          destinationDepositAmount,
          {from: recipientAddress}
        );

        // recipientAddress makes a deposit of the received depositAmount
        const destinationDepositTx = await DestinationBridgeInstance.deposit(
          originDomainID,
          destinationResourceID,
          destinationDepositData,
          feeData,
          {from: recipientAddress}
        );
        await TruffleAssert.passes(destinationDepositTx);

        // check that deposited amount converted to 18 decimal places is
        // emitted in handlerResponse
        TruffleAssert.eventEmitted(destinationDepositTx, "Deposit", (event) => {
          return (
            event.destinationDomainID.toNumber() === originDomainID &&
            event.resourceID === destinationResourceID.toLowerCase() &&
            event.depositNonce.toNumber() === expectedDepositNonce &&
            event.data === destinationDepositData.toLowerCase() &&
            event.handlerResponse === Helpers.toHex(relayerConvertedAmount, 32)

          );
        });

        // this mocks depositProposal data for executing on
        // destination chain which is returned from relayers
        const destinationDepositProposalData = Helpers.createDepositProposalDataFromHandlerResponse(
          destinationDepositTx,
          20,
          depositorAddress
        );

        const destinationDomainProposal = {
          originDomainID: destinationDomainID,
          depositNonce: expectedDepositNonce,
          data: destinationDepositProposalData,
          resourceID: originResourceID
        };

        const destinationProposalSignedData = await Helpers.signTypedProposal(
          OriginBridgeInstance.address,
          [destinationDomainProposal]
        );

        // Recipient should have a balance of 0 (deposit amount)
        recipientBalance = await DestinationERC20MintableInstance.balanceOf(
          recipientAddress
        );
        assert.strictEqual(recipientBalance.toString(), "0");

        // destinationRelayer1 executes the proposal
        await TruffleAssert.passes(
          OriginBridgeInstance.executeProposal(
            destinationDomainProposal,
            destinationProposalSignedData,
            {from: originRelayer1Address}
          )
        );

        // Assert ERC20 balance was transferred from recipientAddress
        recipientBalance = await DestinationERC20MintableInstance.balanceOf(
          recipientAddress
        );
        assert.strictEqual(recipientBalance.toString(), "0");

        // Assert ERC20 balance was transferred to recipientAddress
        depositorBalance = await OriginERC20MintableInstance.balanceOf(
          depositorAddress
        );
        assert.strictEqual(depositorBalance.toString(), initialTokenAmount.toString());
    });
});
