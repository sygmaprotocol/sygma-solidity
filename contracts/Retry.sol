// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity 0.8.11;

import "@openzeppelin/contracts/access/Ownable.sol";

contract Retry is Ownable {

    event Retry(uint8 domainID, uint256 block);

    /**
        @notice This method is used to trigger the process for retrying failed deposits on the MPC side.
        @notice Only callable by admin.
        @param block Block height on origin chain which contains failed deposits.
        @param domainID ID of the block domain. 
     */
    function retry(uint8 domainID, uint256 block) external onlyOwner {
        emit Retry(domainID, block);
    }

}