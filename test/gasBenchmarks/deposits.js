// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
const ERC20HandlerContract = artifacts.require("ERC20Handler");
const ERC20MintableContract = artifacts.require("ERC20PresetMinterPauser");
const ERC721HandlerContract = artifacts.require("ERC721Handler");
const ERC721MintableContract = artifacts.require("ERC721MinterBurnerPauser");
const ERC1155HandlerContract = artifacts.require("ERC1155Handler");
const ERC1155MintableContract = artifacts.require("ERC1155PresetMinterPauser");

const Helpers = require("../helpers");

contract("Gas Benchmark - [Deposits]", async (accounts) => {
  const originDomainID = 1;
  const destinationDomainID = 2;
  const adminAddress = accounts[0];
  const depositorAddress = accounts[1];
  const recipientAddress = accounts[2];

  const lenRecipientAddress = 20;
  const gasBenchmarks = [];

  const erc20TokenAmount = 100;
  const erc721TokenID = 1;
  const erc1155TokenID = 1;
  const erc1155TokenAmount = 100;
  const feeData = "0x";
  const emptySetResourceData = "0x";

  let BridgeInstance;
  let ERC20MintableInstance;
  let ERC20HandlerInstance;
  let ERC721MintableInstance;
  let ERC721HandlerInstance;
  let ERC1155MintableInstance;
  let ERC1155HandlerInstance;

  let erc20ResourceID;
  let erc721ResourceID;
  let erc1155ResourceID;

  before(async () => {
    await Promise.all([
      (BridgeInstance = await Helpers.deployBridge(
        originDomainID,
        adminAddress
      )),
      ERC20MintableContract.new("token", "TOK").then(
        (instance) => (ERC20MintableInstance = instance)
      ),
      ERC721MintableContract.new("token", "TOK", "").then(
        (instance) => (ERC721MintableInstance = instance)
      ),
      ERC1155MintableContract.new("TOK").then(
        (instance) => (ERC1155MintableInstance = instance)
      ),
    ]);

    erc20ResourceID = Helpers.createResourceID(
      ERC20MintableInstance.address,
      originDomainID
    );
    erc721ResourceID = Helpers.createResourceID(
      ERC721MintableInstance.address,
      originDomainID
    );
    erc1155ResourceID = Helpers.createResourceID(
      ERC1155MintableInstance.address,
      originDomainID
    );

    await Promise.all([
      ERC20HandlerContract.new(BridgeInstance.address).then(
        (instance) => (ERC20HandlerInstance = instance)
      ),
      ERC20MintableInstance.mint(depositorAddress, erc20TokenAmount),
      ERC721HandlerContract.new(BridgeInstance.address).then(
        (instance) => (ERC721HandlerInstance = instance)
      ),
      ERC721MintableInstance.mint(depositorAddress, erc721TokenID, ""),
      ERC1155HandlerContract.new(BridgeInstance.address).then(
        (instance) => (ERC1155HandlerInstance = instance)
      ),
      ERC1155MintableInstance.mintBatch(
        depositorAddress,
        [erc1155TokenID],
        [erc1155TokenAmount],
        "0x0"
      ),
    ]);

    await Promise.all([
      ERC20MintableInstance.approve(
        ERC20HandlerInstance.address,
        erc20TokenAmount,
        {from: depositorAddress}
      ),
      ERC721MintableInstance.approve(
        ERC721HandlerInstance.address,
        erc721TokenID,
        {from: depositorAddress}
      ),
      ERC1155MintableInstance.setApprovalForAll(
        ERC1155HandlerInstance.address,
        true,
        {from: depositorAddress}
      ),
      BridgeInstance.adminSetResource(
        ERC20HandlerInstance.address,
        erc20ResourceID,
        ERC20MintableInstance.address,
        emptySetResourceData
      ),
      BridgeInstance.adminSetResource(
        ERC721HandlerInstance.address,
        erc721ResourceID,
        ERC721MintableInstance.address,
        emptySetResourceData
      ),
      BridgeInstance.adminSetResource(
        ERC1155HandlerInstance.address,
        erc1155ResourceID,
        ERC1155MintableInstance.address,
        emptySetResourceData
      ),
    ]);

    // set MPC address to unpause the Bridge
    await BridgeInstance.endKeygen(Helpers.mpcAddress);
  });

  it("Should make ERC20 deposit", async () => {
    const depositTx = await BridgeInstance.deposit(
      destinationDomainID,
      erc20ResourceID,
      Helpers.createERCDepositData(
        erc20TokenAmount,
        lenRecipientAddress,
        recipientAddress
      ),
      feeData,
      {from: depositorAddress}
    );

    gasBenchmarks.push({
      type: "ERC20",
      gasUsed: depositTx.receipt.gasUsed,
    });
  });

  it("Should make ERC721 deposit", async () => {
    const depositTx = await BridgeInstance.deposit(
      destinationDomainID,
      erc721ResourceID,
      Helpers.createERCDepositData(
        erc721TokenID,
        lenRecipientAddress,
        recipientAddress
      ),
      feeData,
      {from: depositorAddress}
    );

    gasBenchmarks.push({
      type: "ERC721",
      gasUsed: depositTx.receipt.gasUsed,
    });
  });

  it("Should make ERC1155 deposit", async () => {
    const depositTx = await BridgeInstance.deposit(
      destinationDomainID,
      erc1155ResourceID,
      Helpers.createERC1155DepositData([erc1155TokenID], [erc1155TokenAmount]),
      feeData,
      {from: depositorAddress}
    );

    gasBenchmarks.push({
      type: "ERC1155",
      gasUsed: depositTx.receipt.gasUsed,
    });
  });

  it("Should print out benchmarks", () => console.table(gasBenchmarks));
});
