// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;

contract BlockStorage {
    mapping(uint => bytes32) public _stateRoots;

    function getStateRoot(uint blockNumber) public view returns (bytes32) {
        return _stateRoots[blockNumber];
    }

    function storeStateRoot(uint blockNumber, bytes32 stateRoot) public {
        _stateRoots[blockNumber] = stateRoot;
    }
}
