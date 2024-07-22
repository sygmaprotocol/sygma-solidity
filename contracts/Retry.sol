// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity 0.8.11;

import "@openzeppelin/contracts/access/Ownable.sol";

contract RetryContract is Ownable {

    event Retry(uint8 sourceDomainID, uint8 destinationDomainID, uint256 blockHeight, bytes32 resourceID);

    /**
        @notice This method is used to trigger the process for retrying failed deposits on the MPC side.
        @notice Only callable by admin.
        @param block Block height on origin chain which contains failed deposits.
        @param domainID ID of the block domain. 
     */
    function retry(uint8 sourceDomainID, uint8 destinationDomainID, uint256 blockHeight, bytes32 resourceID) external onlyOwner {
        emit Retry(sourceDomainID, destinationDomainID, blockHeight, resourceID);
    }

}