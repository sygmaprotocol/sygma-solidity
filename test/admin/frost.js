// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");
const Helpers = require("../helpers");
const Admin = artifacts.require("Admin")

contract("Admin - [Frost]", (accounts) => {
    let AdminInstance;

    const publicKey = "publicKey"

    beforeEach(async () => {
        AdminInstance = await Admin.new(accounts[0]);
    });

    it("should emit StartedFROSTKeygen event when startFROSTKeygen is called by the owner", async () => {
      const tx = await AdminInstance.startFROSTKeygen({from: accounts[0]})

      TruffleAssert.eventEmitted(tx, "StartedFROSTKeygen");
    });

    it("should revert when startFROSTKeygen is not called by the owner", async () => {
      await Helpers.reverts(
        AdminInstance.startFROSTKeygen({from: accounts[1]}),
      )
    });

    it("should emit StartedFrostRefresh event when startFROSTRefresh is called by the owner", async () => {
      const tx = await AdminInstance.startFROSTRefresh(publicKey, {from: accounts[0]})

      TruffleAssert.eventEmitted(tx, "StartedFROSTRefresh", (event) => {
        return event.publicKey == publicKey
      });
    });

    it("should revert when startFROSTREfresh is not called by the owner", async () => {
      await Helpers.reverts(
        AdminInstance.startFROSTRefresh({from: accounts[1]}),
      )
    });
})
