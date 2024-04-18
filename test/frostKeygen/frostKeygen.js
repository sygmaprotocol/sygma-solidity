// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");
const FROSTKeygen = artifacts.require("FROSTKeygen")

contract("FROSTKeygen", (accounts) => {
    let FROSTKeygenInstance;

    beforeEach(async () => {
        FROSTKeygenInstance = await FROSTKeygen.new(accounts[0]);
    });

    it("should emit StartedFROSTKeygen event when startFROSTKeygen is called by the owner", async () => {

      const tx = await FROSTKeygenInstance.startFROSTKeygen({from: accounts[0]})

      TruffleAssert.eventEmitted(tx, "StartedFROSTKeygen");

    });

    it("should revert when startFROSTKeygen is not called by the owner", async () => {

      await TruffleAssert.reverts(
        FROSTKeygenInstance.startFROSTKeygen({from: accounts[1]}),
      )

    });

    it("should revert when startFROSTKeygen is called more than once", async() => {

      const tx = await FROSTKeygenInstance.startFROSTKeygen({from: accounts[0]})

      TruffleAssert.eventEmitted(tx, "StartedFROSTKeygen");

      await TruffleAssert.reverts(
        FROSTKeygenInstance.startFROSTKeygen({from: accounts[0]}))
      })
})
