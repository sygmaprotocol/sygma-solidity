// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");
const Helpers = require("../helpers");
const Admin = artifacts.require("Admin")
const Ethers = require("ethers");

contract("Admin - [Liqudity]", (accounts) => {
    let AdminInstance;

    const domainID = 1;
    const resourceID = "0x0000000000000000000000000000000000000000000000000000000000000650";
    const recipient = "bc1qs0fcdq73vgurej48yhtupzcv83un2p5qhsje7n";
    const amount = Ethers.utils.parseEther("1");

    beforeEach(async () => {
        AdminInstance = await Admin.new(accounts[0]);
    });

    it("should emit TransferLiqudity event when transferLiquidity is called by the owner", async () => {
      const tx = await AdminInstance.transferLiquidity(
        domainID, resourceID, amount, recipient,
        {from: accounts[0]}
    )

      TruffleAssert.eventEmitted(tx, "TransferLiquidity", (event) => {
        return (
            event.domainID === domainID &&
            event.resourceID === resourceID &&
            event.amount === amount &&
            event.destinationAddress === recipient
        )
      });
    });

    it("should revert when transferLiqudity is not called by the owner", async () => {
      await Helpers.reverts(
        AdminInstance.transferLiquidity(
            domainID, resourceID, amount, recipient,
            {from: accounts[1]}
        )
      )
    });
})
