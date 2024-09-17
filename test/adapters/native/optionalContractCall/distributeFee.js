// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");

const Helpers = require("../../../helpers.js");

const DefaultMessageReceiverContract = artifacts.require("DefaultMessageReceiver");
const NativeTokenHandlerContract = artifacts.require("NativeTokenHandler");
const ERC20HandlerContract = artifacts.require("ERC20Handler");
const NativeTokenAdapterContract = artifacts.require("NativeTokenAdapter");
const BasicFeeHandlerContract = artifacts.require("BasicFeeHandler");
const FeeHandlerRouterContract = artifacts.require("FeeHandlerRouter");
const ERC20MintableContract = artifacts.require("ERC20PresetMinterPauser");

contract("Native token adapter - [distributeFee]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;

  const depositorAddress = accounts[1];
  const recipientAddress = accounts[2];

  const expectedDepositNonce = 1;
  const emptySetResourceData = "0x";
  const resourceID = "0x0000000000000000000000000000000000000000000000000000000000000650";
  const depositAmount = Ethers.utils.parseEther("1");
  const fee = Ethers.utils.parseEther("0.1");
  const transferredAmount = depositAmount.sub(fee);
  const transactionId = "0x0000000000000000000000000000000000000000000000000000000000000001";
  const executionGasAmount = 30000000;


  const assertOnlyAdmin = (method, ...params) => {
    return TruffleAssert.fails(
      method(...params, {from: accounts[1]}),
      "sender doesn't have admin role"
    );
  };

  let BridgeInstance;
  let DefaultMessageReceiverInstance;
  let NativeTokenHandlerInstance;
  let NativeTokenAdapterInstance;
  let FeeHandlerRouterInstance;
  let BasicFeeHandlerInstance;
  let ERC20MintableInstance;

  beforeEach(async () => {
    await Promise.all([
      (BridgeInstance = await Helpers.deployBridge(
        originDomainID,
        accounts[0]
      ))
    ]);

    FeeHandlerRouterInstance = await FeeHandlerRouterContract.new(
      BridgeInstance.address
    );
    DefaultMessageReceiverInstance = await DefaultMessageReceiverContract.new(
      [],
      100000
    );
    ERC20HandlerInstance = await ERC20HandlerContract.new(
      BridgeInstance.address,
      DefaultMessageReceiverInstance.address
    );
    BasicFeeHandlerInstance = await BasicFeeHandlerContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );

    NativeTokenAdapterInstance = await NativeTokenAdapterContract.new(
      BridgeInstance.address,
      resourceID
    );

    NativeTokenHandlerInstance = await NativeTokenHandlerContract.new(
      BridgeInstance.address,
      NativeTokenAdapterInstance.address,
      DefaultMessageReceiverInstance.address,
    );
    ERC20MintableInstance = await ERC20MintableContract.new(
      "token",
      "TOK"
    );

    await BridgeInstance.adminSetResource(
      NativeTokenHandlerInstance.address,
      resourceID,
      NativeTokenHandlerInstance.address,
      emptySetResourceData
    );

    const mintableERC20Iface = new Ethers.utils.Interface(["function mint(address to, uint256 amount)"]);
    const actions = [{
      nativeValue: 0,
      callTo: ERC20MintableInstance.address,
      approveTo: DefaultMessageReceiverInstance.address,
      tokenSend: ERC20MintableInstance.address,
      tokenReceive: Ethers.constants.AddressZero,
      data: mintableERC20Iface.encodeFunctionData("mint", [recipientAddress, "20"]),
    }]
    message = Helpers.createMessageCallData(
      transactionId,
      actions,
      recipientAddress
    );

    depositProposalData = Helpers.createOptionalContractCallDepositData(
      transferredAmount,
      Ethers.constants.AddressZero,
      executionGasAmount,
      message
    );

    proposal = {
      originDomainID: originDomainID,
      depositNonce: expectedDepositNonce,
      resourceID: resourceID,
      data: depositProposalData
    };

    // set MPC address to unpause the Bridge
    await BridgeInstance.endKeygen(Helpers.mpcAddress);
  });

  it("should distribute fees", async () => {
    await BridgeInstance.adminChangeFeeHandler(BasicFeeHandlerInstance.address);
    await BasicFeeHandlerInstance.changeFee(destinationDomainID, resourceID, fee);
    assert.equal(
      web3.utils.fromWei(await BasicFeeHandlerInstance._domainResourceIDToFee(
        destinationDomainID,
        resourceID
        ), "ether"),
      Ethers.utils.formatUnits(fee)
    );

    // check the balance is 0
    assert.equal(
      web3.utils.fromWei(
        await web3.eth.getBalance(BridgeInstance.address),
        "ether"
      ),
      "0"
    );
    await NativeTokenAdapterInstance.depositToEVMWithMessage(
      destinationDomainID,
      Ethers.constants.AddressZero,
      executionGasAmount,
      message,
      {
        from: depositorAddress,
        value: depositAmount
      }
    );
    assert.equal(
      web3.utils.fromWei(
        await web3.eth.getBalance(BridgeInstance.address),
        "ether"
      ),
      "0"
    );
    assert.equal(
      web3.utils.fromWei(
        await web3.eth.getBalance(NativeTokenAdapterInstance.address),
        "ether"
      ),
      "0"
    );
    assert.equal(
      web3.utils.fromWei(
        await web3.eth.getBalance(NativeTokenHandlerInstance.address),
        "ether"
      ),
      Ethers.utils.formatUnits(transferredAmount)
    );

    const b1Before = await web3.eth.getBalance(accounts[1]);
    const b2Before = await web3.eth.getBalance(accounts[2]);

    const payout = Ethers.utils.parseEther("0.01");
    // Transfer the funds
    const tx = await BasicFeeHandlerInstance.transferFee(
      [accounts[1], accounts[2]],
      [payout, payout]
    );
    TruffleAssert.eventEmitted(tx, "FeeDistributed", (event) => {
      return (
        event.tokenAddress === "0x0000000000000000000000000000000000000000" &&
        event.recipient === accounts[1] &&
        event.amount.toString() === payout.toString()
      );
    });
    TruffleAssert.eventEmitted(tx, "FeeDistributed", (event) => {
      return (
        event.tokenAddress === "0x0000000000000000000000000000000000000000" &&
        event.recipient === accounts[2] &&
        event.amount.toString() === payout.toString()
      );
    });
    b1 = await web3.eth.getBalance(accounts[1]);
    b2 = await web3.eth.getBalance(accounts[2]);
    assert.equal(b1, Ethers.BigNumber.from(b1Before).add(payout));
    assert.equal(b2, Ethers.BigNumber.from(b2Before).add(payout));
  });

  it("should require admin role to distribute fee", async () => {
    await BridgeInstance.adminChangeFeeHandler(BasicFeeHandlerInstance.address);
    await BasicFeeHandlerInstance.changeFee(destinationDomainID, resourceID, fee);

    await NativeTokenAdapterInstance.depositToEVMWithMessage(
      destinationDomainID,
      Ethers.constants.AddressZero,
      executionGasAmount,
      message,
      {
        from: depositorAddress,
        value: depositAmount
      }
    );

    assert.equal(
      web3.utils.fromWei(
        await web3.eth.getBalance(NativeTokenAdapterInstance.address),
        "ether"
      ),
      "0"
    );
    assert.equal(
      web3.utils.fromWei(
        await web3.eth.getBalance(NativeTokenHandlerInstance.address),
        "ether"
      ),
      Ethers.utils.formatUnits(transferredAmount)
    );

    const payout = Ethers.utils.parseEther("0.01");
    await assertOnlyAdmin(
      BasicFeeHandlerInstance.transferFee,
      [accounts[3], accounts[4]],
      [payout, payout]
    );
  });

  it("should revert if addrs and amounts arrays have different length", async () => {
    await BridgeInstance.adminChangeFeeHandler(BasicFeeHandlerInstance.address);
    await BasicFeeHandlerInstance.changeFee(destinationDomainID, resourceID, fee);

    await NativeTokenAdapterInstance.depositToEVMWithMessage(
      destinationDomainID,
      Ethers.constants.AddressZero,
      executionGasAmount,
      message,
      {
        from: depositorAddress,
        value: depositAmount
      }
    );

    assert.equal(
      web3.utils.fromWei(
        await web3.eth.getBalance(NativeTokenAdapterInstance.address),
        "ether"
      ),
      "0"
    );
    assert.equal(
      web3.utils.fromWei(
        await web3.eth.getBalance(NativeTokenHandlerInstance.address),
        "ether"
      ),
      Ethers.utils.formatUnits(transferredAmount)
    );

    const payout = Ethers.utils.parseEther("0.01");
    await TruffleAssert.fails(
      BasicFeeHandlerInstance.transferFee(
        [accounts[3], accounts[4]],
        [payout, payout, payout]
      ),
      "addrs[], amounts[]: diff length"
    );
  });
});
