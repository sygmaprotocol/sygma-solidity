// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity 0.8.11;

import "@openzeppelin/contracts/access/Ownable.sol";

contract Retry is Ownable {

    event Retry(uint8 sourceDomainID, uint8 destinationDomainID, uint256 blockHeight, bytes32 resourceID);

    /**
        @notice This method is used to trigger the process for retrying failed deposits on the MPC side.
        @notice Only callable by admin.
        @param sourceDomainID ID of the retry source. 
        @param destinationDomainID ID of the transfer destination. 
        @param blockHeight Block height on origin chain which contains failed deposits.
        @param resourceID Resource ID of transfers that are to be retried.
     */
    function retry(uint8 sourceDomainID, uint8 destinationDomainID, uint256 blockHeight, bytes32 resourceID) external onlyOwner {
        emit Retry(sourceDomainID, destinationDomainID, blockHeight, resourceID);
    }

}