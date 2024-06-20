// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");
const Retry = artifacts.require("Retry")

contract("Retry", (accounts) => {
    let RetryInstance;

    const domainID = 1;
    const blockHeight = 15;

    beforeEach(async () => {
        RetryInstance = await Retry.new(accounts[0]);
    });

    it("should emit Retry event when retry is called by the owner", async () => {
      const tx = await RetryInstance.retry(domainID, blockHeight, {from: accounts[0]})

        TruffleAssert.eventEmitted(tx, "KeyRefresh", (event) => {
            return (
                event.domainID === domainID && 
                event.block == blockHeight
            );
        });
    });

    it("should revert when startFROSTKeygen is not called by the owner", async () => {
      await TruffleAssert.reverts(
        RetryInstance.retry(domainID, blockHeight, {from: accounts[1]}),
      )
    });
})
