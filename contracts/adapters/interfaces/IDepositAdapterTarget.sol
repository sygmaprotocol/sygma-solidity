// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.11;

interface IDepositAdapterTarget {
    function transferFunds(address originAdapter, bytes calldata depositData) external;
}
