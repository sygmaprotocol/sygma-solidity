// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;

interface IBasicFeeHandler {

    /**
        @notice Exposes getter function for _domainResourceIDToFee
     */
    function _domainResourceIDToFee(uint8 destinantionDomainID, bytes32 resourceID) pure external returns (uint256);
}
