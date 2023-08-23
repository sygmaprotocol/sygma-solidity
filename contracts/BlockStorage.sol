pragma solidity 0.8.11;

contract BlockStorage {
    mapping(uint8 => mapping(uint => bytes32)) public _stateRoots;

    function getStateRoot(uint8 domainID, uint blockNumber) public view returns (bytes32) {
        return _stateRoots[domainID][blockNumber];
    }

    function storeStateRoot(uint8 domainID, uint blockNumber, bytes32 stateRoot) public {
        _stateRoots[domainID][blockNumber] = stateRoot;
    }
}
