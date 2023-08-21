// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const Helpers = require("../../../helpers");

const ERC20MintableContract = artifacts.require("ERC20PresetMinterPauser");
const ERC20HandlerContract = artifacts.require("ERC20Handler");
const PercentageFeeHandlerContract = artifacts.require("PercentageFeeHandler");
const FeeHandlerRouterContract = artifacts.require("FeeHandlerRouter");

contract("PercentageFeeHandler - [calculateFee]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const relayer = accounts[0];
  const recipientAddress = accounts[1];
  const feeData = "0x0";
  const emptySetResourceData = "0x";

  let BridgeInstance;
  let PercentageFeeHandlerInstance;
  let resourceID;
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

    ERC20HandlerInstance = await ERC20HandlerContract.new(
      BridgeInstance.address
    );
    FeeHandlerRouterInstance = await FeeHandlerRouterContract.new(
      BridgeInstance.address
    );
    PercentageFeeHandlerInstance = await PercentageFeeHandlerContract.new(
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
        PercentageFeeHandlerInstance.address
      ),
    ]);
  });

  it("should return percentage of token amount for fee if bounds are set", async () => {
    const depositData = Helpers.createERCDepositData(100000000, 20, recipientAddress);

    // current fee is set to 0
    let res = await FeeHandlerRouterInstance.calculateFee.call(
      relayer,
      originDomainID,
      destinationDomainID,
      resourceID,
      depositData,
      feeData
    );

    assert.equal(res[0].toString(),"0");
    // Change fee to 1 BPS ()
    await PercentageFeeHandlerInstance.changeFee(10000);
    await PercentageFeeHandlerInstance.changeFeeBounds(100, 300000);
    res = await FeeHandlerRouterInstance.calculateFee.call(
      relayer,
      originDomainID,
      destinationDomainID,
      resourceID,
      depositData,
      feeData
    );
    assert.equal(res[0].toString(),"10000");
  });

  it("should return percentage of token amount for fee if bounds are not set", async () => {
    const depositData = Helpers.createERCDepositData(100000000, 20, recipientAddress);

    // current fee is set to 0
    let res = await FeeHandlerRouterInstance.calculateFee.call(
      relayer,
      originDomainID,
      destinationDomainID,
      resourceID,
      depositData,
      feeData
    );

    assert.equal(res[0].toString(),"0");
    // Change fee to 1 BPS ()
    await PercentageFeeHandlerInstance.changeFee(10000);
    res = await FeeHandlerRouterInstance.calculateFee.call(
      relayer,
      originDomainID,
      destinationDomainID,
      resourceID,
      depositData,
      feeData
    );
    assert.equal(res[0].toString(),"10000");
  });

  it("should return lower bound token amount for fee", async () => {
    const depositData = Helpers.createERCDepositData(10000, 20, recipientAddress);
    await PercentageFeeHandlerInstance.changeFeeBounds(100, 300);
    await PercentageFeeHandlerInstance.changeFee(10000);

    res = await FeeHandlerRouterInstance.calculateFee.call(
      relayer,
      originDomainID,
      destinationDomainID,
      resourceID,
      depositData,
      feeData
    );
    assert.equal(res[0].toString(),"100");
  });

  it("should return upper bound token amount for fee", async () => {
    const depositData = Helpers.createERCDepositData(100000000, 20, recipientAddress);
    await PercentageFeeHandlerInstance.changeFeeBounds(100, 300);
    await PercentageFeeHandlerInstance.changeFee(10000);

    res = await FeeHandlerRouterInstance.calculateFee.call(
      relayer,
      originDomainID,
      destinationDomainID,
      resourceID,
      depositData,
      feeData
    );
    assert.equal(res[0].toString(),"300");
  });
});
