// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");
const Ethers = require("ethers");

const Helpers = require("../../helpers");

const GmpTransferAdapterContract = artifacts.require("GmpTransferAdapter");
const GmpHandlerContract = artifacts.require(
  "GmpHandler"
);
const BasicFeeHandlerContract = artifacts.require("BasicFeeHandler");
const FeeHandlerRouterContract = artifacts.require("FeeHandlerRouter");
const XERC20FactoryContract = artifacts.require("XERC20Factory");
const XERC20Contract = artifacts.require("XERC20");
const XERC20LockboxContract = artifacts.require("XERC20Lockbox");
const ERC20MintableContract = artifacts.require("ERC20PresetMinterPauser");

contract(`Gmp transfer adapter -
  [Execute proposal XERC20 with different addresses- wrapped ERC20 token]`, async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const adminAddress = accounts[0];
  const depositorAddress = accounts[1];
  const recipientAddress = accounts[2];
  const relayer1Address = accounts[3];

  const expectedDepositNonce = 1;
  const handlerResponseLength = 64;
  const contractCallReturndata = Ethers.constants.HashZero;
  const destinationMaxFee = 900000;
  const resourceID = "0x0000000000000000000000000000000000000000000000000000000000000650";
  const depositAmount = 10;
  const fee = Ethers.utils.parseEther("0.1");
  const transferredAmount = 10;
  const mintingLimit = 500;
  const burningLimit = 500;

  let BridgeInstance;
  let BasicFeeHandlerInstance;
  let FeeHandlerRouterInstance;
  let sourceXERC20FactoryInstance;
  let sourceXERC20Instance;
  let sourceXERC20LockboxInstance;
  let destinationXERC20FactoryInstance;
  let destinationXERC20Instance;
  let proposal;
  let dataHash;
  let depositFunctionSignature;
  let ERC20MintableSourceInstance;


  beforeEach(async () => {
    await Promise.all([
      (BridgeInstance = await Helpers.deployBridge(
        destinationDomainID,
        adminAddress
      )),
      ERC20MintableContract.new("sToken", "sTOK").then(
        (instance) => (ERC20MintableSourceInstance = instance)
      ),
      ERC20MintableContract.new("dToken", "dTOK").then(
        (instance) => (ERC20MintableDestinationInstance = instance)
      ),
    ]);

    await ERC20MintableSourceInstance.mint(depositorAddress, depositAmount);

    FeeHandlerRouterInstance = await FeeHandlerRouterContract.new(
      BridgeInstance.address
    );
    BasicFeeHandlerInstance = await BasicFeeHandlerContract.new(
      BridgeInstance.address,
      FeeHandlerRouterInstance.address
    );

    await BasicFeeHandlerInstance.changeFee(destinationDomainID, resourceID, fee);
    await BridgeInstance.adminChangeFeeHandler(FeeHandlerRouterInstance.address),
    await FeeHandlerRouterInstance.adminSetResourceHandler(
      originDomainID,
      resourceID,
      BasicFeeHandlerInstance.address
    );

    GmpHandlerInstance = await GmpHandlerContract.new(BridgeInstance.address);
    GmpTransferAdapterInstance = await GmpTransferAdapterContract.new(
      BridgeInstance.address,
      GmpHandlerInstance.address,
      resourceID,
    );

    // deploy source XERC20 contract instances
    sourceXERC20FactoryInstance = await XERC20FactoryContract.new();
    const sourceXERC20DeployResponse = await sourceXERC20FactoryInstance.deployXERC20(
      "srcSygmaToken",
      "srcSTOK",
      [mintingLimit],
      [burningLimit],
      [GmpTransferAdapterInstance.address]
    );
    // set source XERC20 contract instance address to the address deployed via XERC20Factory
    const sourceDeployedXERC20Address = sourceXERC20DeployResponse.logs[0].args._xerc20
    sourceXERC20Instance = await XERC20Contract.at(sourceDeployedXERC20Address)
    const sourceLockboxDeployResponse = await sourceXERC20FactoryInstance.deployLockbox(
      sourceXERC20Instance.address,
      ERC20MintableSourceInstance.address,
      false
    );
    // set source Lockbox contract instance address to the address deployed via XERC20Factory
    const sourceLockboxAddress = sourceLockboxDeployResponse.logs[0].args._lockbox
    sourceXERC20LockboxInstance = await XERC20LockboxContract.at(sourceLockboxAddress);

    // deploy destination contract instances
    destinationXERC20FactoryInstance = await XERC20FactoryContract.new();
    const destinationXERC20DeployResponse = await destinationXERC20FactoryInstance.deployXERC20(
      "destSygmaToken",
      "destSTOK",
      [mintingLimit],
      [burningLimit],
      [GmpTransferAdapterInstance.address]
    );
    // set destination XERC20 contract instance address to the address deployed via XERC20Factory
    const destinationDeployedXERC20Address = destinationXERC20DeployResponse.logs[0].args._xerc20
    destinationXERC20Instance = await XERC20Contract.at(destinationDeployedXERC20Address)
    const destinationLockboxDeployResponse = await destinationXERC20FactoryInstance.deployLockbox(
      destinationXERC20Instance.address,
      ERC20MintableDestinationInstance.address,
      false
    );
    // set destination Lockbox contract instance address to the address deployed via XERC20Factory
    const destinationLockboxAddress = destinationLockboxDeployResponse.logs[0].args._lockbox
    await XERC20LockboxContract.at(destinationLockboxAddress);

    await ERC20MintableSourceInstance.increaseAllowance(
      sourceXERC20LockboxInstance.address,
      depositAmount,
      {
        from: depositorAddress
      }
    );
    await sourceXERC20LockboxInstance.depositTo(
      depositorAddress,
      depositAmount,
      {
        from: depositorAddress
      }
    );
    await sourceXERC20Instance.increaseAllowance(
      GmpTransferAdapterInstance.address,
      depositAmount,
      {
        from: depositorAddress
      }
    );

    depositFunctionSignature = Helpers.getFunctionSignature(
      GmpTransferAdapterInstance,
      "executeProposal"
    );

    const GmpHandlerSetResourceData =
    Helpers.constructGenericHandlerSetResourceData(
      depositFunctionSignature,
      Helpers.blankFunctionDepositorOffset,
      Helpers.blankFunctionSig
    );

    await BridgeInstance.adminSetResource(
      GmpHandlerInstance.address,
      resourceID,
      GmpHandlerInstance.address,
      GmpHandlerSetResourceData
    );

    const preparedExecutionData = await GmpTransferAdapterInstance.prepareDepositData(
      recipientAddress,
      destinationXERC20Instance.address,
      transferredAmount
    );
    depositData = Helpers.createGmpDepositData(
      depositFunctionSignature,
      GmpTransferAdapterInstance.address,
      destinationMaxFee,
      GmpTransferAdapterInstance.address,
      preparedExecutionData
    );

    await GmpTransferAdapterInstance.setTokenPairAddress(
      sourceXERC20Instance.address,
      originDomainID,
      destinationXERC20Instance.address
    );

    proposal = {
      originDomainID: originDomainID,
      depositNonce: expectedDepositNonce,
      resourceID: resourceID,
      data: depositData,
    };

    dataHash = Ethers.utils.keccak256(
      GmpHandlerInstance.address + depositData.substr(2)
    );

    // set MPC address to unpause the Bridge
    await BridgeInstance.endKeygen(Helpers.mpcAddress);
  });

  it("isProposalExecuted returns false if depositNonce is not used", async () => {
    const destinationDomainID = await BridgeInstance._domainID();

    assert.isFalse(
      await BridgeInstance.isProposalExecuted(
        destinationDomainID,
        expectedDepositNonce
      )
    );
  });

  it("should create and execute executeProposal successfully", async () => {
    const proposalSignedData = await Helpers.signTypedProposal(
      BridgeInstance.address,
      [proposal]
    );

    const depositorSourceXERC20BalanceBefore = await sourceXERC20Instance.balanceOf(depositorAddress);
    const recipientSourceXERC20BalanceBefore = await sourceXERC20Instance.balanceOf(recipientAddress);
    const depositorDestinationXERC20BalanceBefore = await destinationXERC20Instance.balanceOf(depositorAddress);
    const recipientDestinationXERC20BalanceBefore = await destinationXERC20Instance.balanceOf(recipientAddress);
    // depositorAddress makes initial deposit of depositAmount
    assert.isFalse(await BridgeInstance.paused());
    await TruffleAssert.passes(
      GmpTransferAdapterInstance.deposit(
        originDomainID,
        recipientAddress,
        sourceXERC20Instance.address,
        depositAmount,
        {
          from: depositorAddress,
          value: fee
        }
      )
    );

    await BridgeInstance.executeProposal(proposal, proposalSignedData, {
      from: relayer1Address,
    });

    const recipientSourceNativeBalanceBefore = await web3.eth.getBalance(recipientAddress);
    const depositorSourceXERC20BalanceAfter = await sourceXERC20Instance.balanceOf(depositorAddress);
    const recipientSourceXERC20BalanceAfter = await sourceXERC20Instance.balanceOf(recipientAddress);
    const depositorDestinationXERC20BalanceAfter = await destinationXERC20Instance.balanceOf(depositorAddress);
    const recipientDestinationXERC20BalanceAfter = await destinationXERC20Instance.balanceOf(recipientAddress);
    // check that deposit nonce has been marked as used in bitmap
    assert.isTrue(
      await BridgeInstance.isProposalExecuted(
        originDomainID,
        expectedDepositNonce
      )
    );

    // check that depositor and recipient balances are aligned with expectations
    const recipientNativeBalanceAfter = await web3.eth.getBalance(recipientAddress);
    assert.strictEqual(recipientSourceNativeBalanceBefore, recipientNativeBalanceAfter);
    assert.strictEqual(
      Ethers.BigNumber.from(depositAmount).sub(depositorSourceXERC20BalanceBefore.toString()).toString(),
      depositorSourceXERC20BalanceAfter.toString()
    );
    assert.strictEqual(
      recipientSourceXERC20BalanceBefore.toString(),
      recipientSourceXERC20BalanceAfter.toString()
    );
    assert.strictEqual(
      depositorDestinationXERC20BalanceBefore.toString(),
      depositorDestinationXERC20BalanceAfter.toString()
    );
    assert.strictEqual(
      Ethers.BigNumber.from(depositAmount).add(recipientDestinationXERC20BalanceBefore.toString()).toString(),
      recipientDestinationXERC20BalanceAfter.toString()
    );
  });

  it("should skip executing proposal if deposit nonce is already used", async () => {
    const proposalSignedData = await Helpers.signTypedProposal(
      BridgeInstance.address,
      [proposal]
    );

    // depositorAddress makes initial deposit of depositAmount
    assert.isFalse(await BridgeInstance.paused());
    await TruffleAssert.passes(
      GmpTransferAdapterInstance.deposit(
        originDomainID,
        recipientAddress,
        sourceXERC20Instance.address,
        depositAmount,
        {
          from: depositorAddress,
          value: fee
        }
      )
    );

    await TruffleAssert.passes(
      BridgeInstance.executeProposal(proposal, proposalSignedData, {
        from: relayer1Address,
      })
    );

    const skipExecuteTx = await BridgeInstance.executeProposal(
      proposal,
      proposalSignedData,
      {from: relayer1Address}
    );

    // check that no ProposalExecution events are emitted
    assert.equal(skipExecuteTx.logs.length, 0);
  });

  it("executeProposal event should be emitted with expected values", async () => {
    const proposalSignedData = await Helpers.signTypedProposal(
      BridgeInstance.address,
      [proposal]
    );

    // depositorAddress makes initial deposit of depositAmount
    assert.isFalse(await BridgeInstance.paused());
    await TruffleAssert.passes(
      GmpTransferAdapterInstance.deposit(
        originDomainID,
        recipientAddress,
        sourceXERC20Instance.address,
        depositAmount,
        {
          from: depositorAddress,
          value: fee
        }
      )
    );

    const recipientNativeBalanceBefore = await web3.eth.getBalance(recipientAddress);

    const proposalTx = await BridgeInstance.executeProposal(
      proposal,
      proposalSignedData,
      {from: relayer1Address}
    );

    TruffleAssert.eventEmitted(proposalTx, "ProposalExecution", (event) => {
      return (
        event.originDomainID.toNumber() === originDomainID &&
        event.depositNonce.toNumber() === expectedDepositNonce &&
        event.dataHash === dataHash &&
        event.handlerResponse === Ethers.utils.defaultAbiCoder.encode(
          ["bool", "uint256", "bytes32"],
          [true, handlerResponseLength, contractCallReturndata]
        )
      );
    });

    // check that deposit nonce has been marked as used in bitmap
    assert.isTrue(
      await BridgeInstance.isProposalExecuted(
        originDomainID,
        expectedDepositNonce
      )
    );


    // check that recipient native token balance hasn't changed
    const recipientNativeBalanceAfter = await web3.eth.getBalance(recipientAddress);
    assert.strictEqual(recipientNativeBalanceBefore, recipientNativeBalanceAfter);
  });

  it(`should fail to executeProposal if signed Proposal has different
    chainID than the one on which it should be executed`, async () => {
    const proposalSignedData =
      await Helpers.mockSignTypedProposalWithInvalidChainID(
        BridgeInstance.address,
        [proposal]
      );

    // depositorAddress makes initial deposit of depositAmount
    assert.isFalse(await BridgeInstance.paused());
    await TruffleAssert.passes(
      GmpTransferAdapterInstance.deposit(
        originDomainID,
        recipientAddress,
        sourceXERC20Instance.address,
        depositAmount,
        {
          from: depositorAddress,
          value: fee
        }
      )
    );

    await Helpers.expectToRevertWithCustomError(
      BridgeInstance.executeProposal(proposal, proposalSignedData, {
        from: relayer1Address,
      }),
      "InvalidProposalSigner()"
    );
  });
});
