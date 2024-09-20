// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");

const Helpers = require("../../../helpers");

const ERC20MintableContract = artifacts.require("ERC20PresetMinterPauser");
const DefaultMessageReceiverContract = artifacts.require("DefaultMessageReceiver");
const ERC20HandlerContract = artifacts.require("ERC20Handler");
const PercentageFeeHandlerContract = artifacts.require("PercentageERC20FeeHandler");
const FeeHandlerRouterContract = artifacts.require("FeeHandlerRouter");

contract("PercentageFeeHandler - [collectFee]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const recipientAddress = accounts[2];
  const tokenAmount = Ethers.utils.parseEther("200000");
  const depositorAddress = accounts[1];

  const emptySetResourceData = "0x";
  const feeData = "0x";
  const feeBps = 60000; // BPS
  const fee = Ethers.utils.parseEther("120");
  const lowerBound = Ethers.utils.parseEther("100");
  const upperBound = Ethers.utils.parseEther("300");


  let BridgeInstance;
  let PercentageFeeHandlerInstance;
  let resourceID;
  let depositData;

  let FeeHandlerRouterInstance;
  let DefaultMessageReceiverInstance;
  let ERC20HandlerInstance;
  let ERC20MintableInstance;


  beforeEach(async () => {
    await Promise.all([
      (BridgeInstance = await Helpers.deployBridge(
        originDomainID,
        accounts[0]
      )),
      (ERC20MintableInstance = ERC20MintableContract.new(
        "ERC20Token",
        "ERC20TOK"
      ).then((instance) => (ERC20MintableInstance = instance))),
    ]);

    DefaultMessageReceiverInstance = await DefaultMessageReceiverContract.new([], 100000);
    ERC20HandlerInstance = await ERC20HandlerContract.new(
      BridgeInstance.address,
      DefaultMessageReceiverInstance.address
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

    await PercentageFeeHandlerInstance.changeFee(destinationDomainID, resourceID, feeBps);
    await PercentageFeeHandlerInstance.changeFeeBounds(resourceID, lowerBound, upperBound);

    await Promise.all([
      BridgeInstance.adminSetResource(
        ERC20HandlerInstance.address,
        resourceID,
        ERC20MintableInstance.address,
        emptySetResourceData
      ),
      ERC20MintableInstance.mint(depositorAddress, tokenAmount + fee),
      ERC20MintableInstance.approve(ERC20HandlerInstance.address, tokenAmount, {
        from: depositorAddress,
      }),
      ERC20MintableInstance.approve(PercentageFeeHandlerInstance.address, fee, {
        from: depositorAddress,
      }),
      BridgeInstance.adminChangeFeeHandler(FeeHandlerRouterInstance.address),
      FeeHandlerRouterInstance.adminSetResourceHandler(
        destinationDomainID,
        resourceID,
        PercentageFeeHandlerInstance.address
      ),
    ]);

    depositData = Helpers.createERCDepositData(
      tokenAmount,
      20,
      recipientAddress
    );

    // set MPC address to unpause the Bridge
    await BridgeInstance.endKeygen(Helpers.mpcAddress);
  });

  it("should collect fee in tokens", async () => {
    const balanceBefore = (
      await ERC20MintableInstance.balanceOf(
        PercentageFeeHandlerInstance.address
      )
    ).toString();

    const depositTx = await BridgeInstance.deposit(
      destinationDomainID,
      resourceID,
      depositData,
      feeData,
      {
        from: depositorAddress,
      }
    );
    TruffleAssert.eventEmitted(depositTx, "Deposit", (event) => {
      return (
        event.destinationDomainID.toNumber() === destinationDomainID &&
        event.resourceID === resourceID.toLowerCase()
      );
    });
    const internalTx = await TruffleAssert.createTransactionResult(
      PercentageFeeHandlerInstance,
      depositTx.tx
    );
    TruffleAssert.eventEmitted(internalTx, "FeeCollected", (event) => {
      return (
        event.sender === depositorAddress &&
        event.fromDomainID.toNumber() === originDomainID &&
        event.destinationDomainID.toNumber() === destinationDomainID &&
        event.resourceID === resourceID.toLowerCase() &&
        event.fee.toString() === fee.toString() &&
        event.tokenAddress === ERC20MintableInstance.address
      );
    });
    const balanceAfter = (
      await ERC20MintableInstance.balanceOf(
        PercentageFeeHandlerInstance.address
      )
    ).toString();
    assert.equal(balanceAfter, fee.add(balanceBefore).toString());
  });

  it("deposit should revert if msg.value != 0", async () => {
    await Helpers.reverts(
      BridgeInstance.deposit(
        destinationDomainID,
        resourceID,
        depositData,
        feeData,
        {
          from: depositorAddress,
          value: Ethers.utils.parseEther("0.5").toString(),
        }
      ),
      "collectFee: msg.value != 0"
    );
  });

  it("deposit should revert if fee collection fails", async () => {
    const depositData = Helpers.createERCDepositData(
      tokenAmount,
      20,
      recipientAddress
    );

    await ERC20MintableInstance.approve(
      PercentageFeeHandlerInstance.address,
      0,
      {from: depositorAddress}
    );
    await Helpers.reverts(
      BridgeInstance.deposit(
        destinationDomainID,
        resourceID,
        depositData,
        feeData,
        {
          from: depositorAddress,
          value: Ethers.utils.parseEther("0.5").toString(),
        }
      )
    );
  });

  it("deposit should revert if not called by router on PercentageFeeHandler contract", async () => {
    const depositData = Helpers.createERCDepositData(
      tokenAmount,
      20,
      recipientAddress
    );
    await ERC20MintableInstance.approve(
      PercentageFeeHandlerInstance.address,
      0,
      {from: depositorAddress}
    );
    await Helpers.reverts(
      PercentageFeeHandlerInstance.collectFee(
        depositorAddress,
        originDomainID,
        destinationDomainID,
        resourceID,
        depositData,
        feeData,
        {
          from: depositorAddress,
          value: Ethers.utils.parseEther("0.5").toString(),
        }
      ),
      "sender must be bridge or fee router contract"
    );
  });

  it("deposit should revert if not called by bridge on FeeHandlerRouter contract", async () => {
    const depositData = Helpers.createERCDepositData(
      tokenAmount,
      20,
      recipientAddress
    );
    await ERC20MintableInstance.approve(
      PercentageFeeHandlerInstance.address,
      0,
      {from: depositorAddress}
    );
    await Helpers.reverts(
      FeeHandlerRouterInstance.collectFee(
        depositorAddress,
        originDomainID,
        destinationDomainID,
        resourceID,
        depositData,
        feeData,
        {
          from: depositorAddress,
          value: Ethers.utils.parseEther("0.5").toString(),
        }
      ),
      "sender must be bridge contract"
    );
  });

  it("should successfully change fee handler from FeeRouter to PercentageFeeHandler and collect fee", async () => {
    await BridgeInstance.adminChangeFeeHandler(
      PercentageFeeHandlerInstance.address
    );

    const balanceBefore = (
      await ERC20MintableInstance.balanceOf(
        PercentageFeeHandlerInstance.address
      )
    ).toString();

    const depositTx = await BridgeInstance.deposit(
      destinationDomainID,
      resourceID,
      depositData,
      feeData,
      {
        from: depositorAddress,
      }
    );
    TruffleAssert.eventEmitted(depositTx, "Deposit", (event) => {
      return (
        event.destinationDomainID.toNumber() === destinationDomainID &&
        event.resourceID === resourceID.toLowerCase()
      );
    });
    const internalTx = await TruffleAssert.createTransactionResult(
      PercentageFeeHandlerInstance,
      depositTx.tx
    );
    TruffleAssert.eventEmitted(internalTx, "FeeCollected", (event) => {
      return (
        event.sender === depositorAddress &&
        event.fromDomainID.toNumber() === originDomainID &&
        event.destinationDomainID.toNumber() === destinationDomainID &&
        event.resourceID === resourceID.toLowerCase() &&
        event.fee.toString() === fee.toString() &&
        event.tokenAddress === ERC20MintableInstance.address
      );
    });
    const balanceAfter = (
      await ERC20MintableInstance.balanceOf(
        PercentageFeeHandlerInstance.address
      )
    ).toString();
    assert.equal(balanceAfter, fee.add(balanceBefore).toString());
  });
});
