// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
const TruffleAssert = require("truffle-assertions");

const Helpers = require("../../../helpers");
const Ethers = require("ethers");

const ERC20MintableContract = artifacts.require("ERC20PresetMinterPauser");
const ERC20HandlerContract = artifacts.require("ERC20Handler");
const PercentageFeeHandlerContract = artifacts.require("PercentageERC20FeeHandlerEVM");
const FeeHandlerRouterContract = artifacts.require("FeeHandlerRouter");

contract("PercentageFeeHandler - [distributeFee]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const depositorAddress = accounts[1];
  const recipientAddress = accounts[2];

  const depositAmount = 100000;
  const feeData = "0x";
  const emptySetResourceData = "0x";
  const feeAmount = 30;
  const feeBps = 30000; // 3 BPS
  const payout = Ethers.BigNumber.from("10");

  let BridgeInstance;
  let ERC20MintableInstance;
  let ERC20HandlerInstance;
  let PercentageFeeHandlerInstance;
  let FeeHandlerRouterInstance;

  let resourceID;
  let depositData;

    const assertOnlyAdmin = (method, ...params) => {
      return TruffleAssert.reverts(
        method(...params, {from: accounts[1]}),
        "sender doesn't have admin role"
      );
    };

  beforeEach(async () => {
    await Promise.all([
      (BridgeInstance = await Helpers.deployBridge(
        originDomainID,
        accounts[0]
      )),
      ERC20MintableContract.new("token", "TOK").then(
        (instance) => (ERC20MintableInstance = instance)
      ),
      FeeHandlerRouterInstance = await FeeHandlerRouterContract.new(
        BridgeInstance.address
      ),
      PercentageFeeHandlerInstance = await PercentageFeeHandlerContract.new(
        BridgeInstance.address,
        FeeHandlerRouterInstance.address
      )
    ]);

    resourceID = Helpers.createResourceID(
      ERC20MintableInstance.address,
      originDomainID
    );

    ERC20HandlerInstance = await ERC20HandlerContract.new(
      BridgeInstance.address
    );

    await Promise.all([
      BridgeInstance.adminSetResource(
        ERC20HandlerInstance.address,
        resourceID,
        ERC20MintableInstance.address,
        emptySetResourceData
      ),
      ERC20MintableInstance.mint(depositorAddress, depositAmount + feeAmount),
      ERC20MintableInstance.approve(ERC20HandlerInstance.address, depositAmount, {
        from: depositorAddress,
      }),
      ERC20MintableInstance.approve(
        PercentageFeeHandlerInstance.address,
        depositAmount,
        {from: depositorAddress}
      ),
      BridgeInstance.adminChangeFeeHandler(FeeHandlerRouterInstance.address),
      FeeHandlerRouterInstance.adminSetResourceHandler(
        destinationDomainID,
        resourceID,
        PercentageFeeHandlerInstance.address
      ),
      PercentageFeeHandlerInstance.changeFee(destinationDomainID, resourceID, feeBps)
    ]);

    depositData = Helpers.createERCDepositData(
      depositAmount,
      20,
      recipientAddress
    );

    // set MPC address to unpause the Bridge
    await BridgeInstance.endKeygen(Helpers.mpcAddress);
  });

  it("should distribute fees", async () => {
    // check the balance is 0
    const b1Before = (
      await ERC20MintableInstance.balanceOf(accounts[3])
    ).toString();
    const b2Before = (
      await ERC20MintableInstance.balanceOf(accounts[4])
    ).toString();

    await TruffleAssert.passes(
      BridgeInstance.deposit(
        destinationDomainID,
        resourceID,
        depositData,
        feeData,
        {
          from: depositorAddress,
        }
      )
    );
    const balance = await ERC20MintableInstance.balanceOf(
      PercentageFeeHandlerInstance.address
    );
    assert.equal(balance, feeAmount);

    // Transfer the funds
    const tx = await PercentageFeeHandlerInstance.transferERC20Fee(
      resourceID,
      [accounts[3], accounts[4]],
      [payout, payout]
    );
    TruffleAssert.eventEmitted(tx, "FeeDistributed", (event) => {
      return (
        event.tokenAddress === ERC20MintableInstance.address &&
        event.recipient === accounts[3] &&
        event.amount.toString() === payout.toString()
      );
    });
    TruffleAssert.eventEmitted(tx, "FeeDistributed", (event) => {
      return (
        event.tokenAddress === ERC20MintableInstance.address &&
        event.recipient === accounts[4] &&
        event.amount.toString() === payout.toString()
      );
    });
    b1 = await ERC20MintableInstance.balanceOf(accounts[3]);
    b2 = await ERC20MintableInstance.balanceOf(accounts[4]);
    assert.equal(b1.toString(), payout.add(b1Before).toString());
    assert.equal(b2.toString(), payout.add(b2Before).toString());
  });

  it("should not distribute fees with other resourceID", async () => {
    await TruffleAssert.passes(
      BridgeInstance.deposit(
        destinationDomainID,
        resourceID,
        depositData,
        feeData,
        {
          from: depositorAddress,
        }
      )
    );
    const balance = await ERC20MintableInstance.balanceOf(
      PercentageFeeHandlerInstance.address
    );
    assert.equal(balance, feeAmount);

    // Incorrect resourceID
    resourceID = Helpers.createResourceID(
      PercentageFeeHandlerInstance.address,
      originDomainID
    );

    // Transfer the funds: fails
    await TruffleAssert.reverts(
      PercentageFeeHandlerInstance.transferERC20Fee(
        resourceID,
        [accounts[3], accounts[4]],
        [payout, payout]
      )
    );
  });

  it("should require admin role to distribute fee", async () => {
    await TruffleAssert.passes(
      BridgeInstance.deposit(
        destinationDomainID,
        resourceID,
        depositData,
        feeData,
        {
          from: depositorAddress,
        }
      )
    );
    const balance = await ERC20MintableInstance.balanceOf(
      PercentageFeeHandlerInstance.address
    );
    assert.equal(balance, feeAmount);

    await assertOnlyAdmin(
      PercentageFeeHandlerInstance.transferERC20Fee,
      resourceID,
      [accounts[3], accounts[4]],
      [payout.toNumber(), payout.toNumber()]
    );
  });

  it("should revert if addrs and amounts arrays have different length", async () => {
    await TruffleAssert.passes(
      BridgeInstance.deposit(
        destinationDomainID,
        resourceID,
        depositData,
        feeData,
        {
          from: depositorAddress,
        }
      )
    );
    const balance = await ERC20MintableInstance.balanceOf(
      PercentageFeeHandlerInstance.address
    );
    assert.equal(balance, feeAmount);

    await TruffleAssert.reverts(
      PercentageFeeHandlerInstance.transferERC20Fee(
        resourceID,
        [accounts[3], accounts[4]],
        [payout, payout, payout]
      ),
      "addrs[], amounts[]: diff length"
    );
  });
});
