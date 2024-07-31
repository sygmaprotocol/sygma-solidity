// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

const TruffleAssert = require("truffle-assertions");
const Retry = artifacts.require("Retry")

contract("Retry", (accounts) => {
    let RetryInstance;

    const sourceDomainID = 1;
    const destinationDomainID = 2;
    const blockHeight = 15;
    const resourceID = "0x0000000000000000000000000000000000000000000000000000000000000300";

    beforeEach(async () => {
        RetryInstance = await Retry.new(accounts[0]);
    });

    it("should emit Retry event when retry is called by the owner", async () => {
      const tx = await RetryInstance.retry(
        sourceDomainID, 
        destinationDomainID,  
        blockHeight, 
        resourceID, 
        {from: accounts[0]})

        TruffleAssert.eventEmitted(tx, "Retry", (event) => {
            return (
                event.sourceDomainID.toNumber() === sourceDomainID && 
                event.destinationDomainID.toNumber() === destinationDomainID && 
                event.blockHeight.toNumber() === blockHeight &&
                event.resourceID === resourceID
            );
        });
    });

    it("should revert when retry is not called by the owner", async () => {
      await TruffleAssert.reverts(
        RetryInstance.retry(sourceDomainID, destinationDomainID, blockHeight, resourceID, {from: accounts[1]}),
        "Ownable: caller is not the owner."
      )
    });
})
