// The Licensed Work is (c) 2024 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;

/**
    @title Helps validate input parameters.
    @author ChainSafe Systems.
 */
library SanityChecks {
    error ZeroAddress();
    error UnexpectedValue(uint256 actual, uint256 expected);

    function mustNotBeZero(address addr) internal pure returns(address) {
        if (addr == address(0)) revert ZeroAddress();
        return addr;
    }

    function mustBe(uint256 actual, uint256 expected) internal pure returns(uint256) {
        if (actual != expected) revert UnexpectedValue(actual, expected);
        return actual;
    }
}
