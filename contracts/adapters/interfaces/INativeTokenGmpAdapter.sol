// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.11;

interface INativeTokenGmpAdapter {
    function transferFunds(address NativeTokenGmpAdapter, address payable recipient, uint256 amount) external;
}
