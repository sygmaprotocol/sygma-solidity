// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const Ethers = require("ethers");

const Helpers = require("../../../helpers");

const ERC20MintableContract = artifacts.require("ERC20PresetMinterPauser");
const DefaultMessageReceiverContract = artifacts.require("DefaultMessageReceiver");
const ERC20HandlerContract = artifacts.require("ERC20Handler");
const BasicFeeHandlerContract = artifacts.require("BasicFeeHandler");
const FeeHandlerRouterContract = artifacts.require("FeeHandlerRouter");

contract("BasicFeeHandler - [calculateFee]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const relayer = accounts[0];
  const recipientAddress = accounts[1];
  const feeData = "0x0";
  const emptySetResourceData = "0x";

  let BridgeInstance;
  let BasicFeeHandlerInstance;
  let resourceID;
  let depositData;
  let DefaultMessageReceiverInstance;
  let ERC20MintableInstance;
  let FeeHandlerRouterInstance;

  beforeEach(async () => {
    await Promise.all([
      (BridgeInstance = await Helpers.deployBridge(
        destinationDomainID,
        accounts[0]
      )),
      ERC20MintableContract.new("token", "TOK").then(
        (instance) => (ERC20MintableInstance = instance)
      ),
    ]);

    DefaultMessageReceiverInstance = await DefaultMessageReceiverContract.new([], 100000);
    ERC20HandlerInstance = await ERC20HandlerContract.new(
      BridgeInstance.address,
      DefaultMessageReceiverInstance.address
    );
    FeeHandlerRouterInstance = await FeeHandlerRouterContract.new(
      BridgeInstance.address
    );
    BasicFeeHandlerInstance = await BasicFeeHandlerContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );

    resourceID = Helpers.createResourceID(
      ERC20MintableInstance.address,
      originDomainID
    );
    initialResourceIDs = [resourceID];
    initialContractAddresses = [ERC20MintableInstance.address];

    burnableContractAddresses = [];

    depositData = Helpers.createERCDepositData(100, 20, recipientAddress);

    await Promise.all([
      BridgeInstance.adminSetResource(
        ERC20HandlerInstance.address,
        resourceID,
        ERC20MintableInstance.address,
        emptySetResourceData
      ),
      BridgeInstance.adminChangeFeeHandler(FeeHandlerRouterInstance.address),
      FeeHandlerRouterInstance.adminSetResourceHandler(
        destinationDomainID,
        resourceID,
        BasicFeeHandlerInstance.address
      ),
    ]);
  });

  it("should return amount of fee", async () => {
    // current fee is set to 0
    let res = await FeeHandlerRouterInstance.calculateFee.call(
      relayer,
      originDomainID,
      destinationDomainID,
      resourceID,
      depositData,
      feeData
    );

    assert.equal(web3.utils.fromWei(res[0], "ether"), "0");
    // Change fee to 0.5 ether
    await BasicFeeHandlerInstance.changeFee(destinationDomainID, resourceID, Ethers.utils.parseEther("0.5"));
    res = await FeeHandlerRouterInstance.calculateFee.call(
      relayer,
      originDomainID,
      destinationDomainID,
      resourceID,
      depositData,
      feeData
    );
    assert.equal(web3.utils.fromWei(res[0], "ether"), "0.5");
  });
});
