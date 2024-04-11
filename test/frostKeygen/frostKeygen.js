// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");
const FROSTKeygen = artifacts.require("FROSTKeygen")
const Helpers = require("../helpers");

contract("FROSTKeygen", (accounts) => {
    let FROSTKeygenInstance;
    let resourceID;

    beforeEach(async () => {
        FROSTKeygenInstance = await FROSTKeygen.new(accounts[0]);
        resourceID = Helpers.createResourceID(
          "0x",
          1
        );
    });

    it("should emit StartedFROSTKeygen event when startKeygen is called by the owner", async () => {

      const tx = await FROSTKeygenInstance.startFROSTKeygen(resourceID, {from: accounts[0]})

      TruffleAssert.eventEmitted(tx, "StartedFROSTKeygen", (event) => {
        return event.resourceID === resourceID
      }, "StartedFROSTKeygen event should be emitted with correct resourceID");

    });

    it("should revert when it's not called by the owner", async () => {
      await TruffleAssert.reverts(
        FROSTKeygenInstance.startFROSTKeygen(resourceID, {from: accounts[1]}),
      )
    });
})
