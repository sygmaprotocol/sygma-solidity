// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

import { RLPReader } from "./RLPReader.sol";
import { MerkleTrie } from "./MerkleTrie.sol";

library StorageProof {
    using RLPReader for RLPReader.RLPItem;
    using RLPReader for bytes;

    function getStorageValue(bytes32 slotHash, bytes32 storageRoot, bytes[] memory stateProof)
        internal

        returns (bytes32)
    {
        bytes memory valueRlpBytes =
            MerkleTrie.get(abi.encodePacked(slotHash), stateProof, storageRoot);
        require(valueRlpBytes.length > 0, "Storage value does not exist");
        return valueRlpBytes.toRLPItem().readBytes32();
    }

    function getStorageRoot(bytes[] memory proof, address contractAddress, bytes32 stateRoot)
        internal
        returns (bytes32)
    {
        bytes32 addressHash = keccak256(abi.encodePacked(contractAddress));
        bytes memory acctRlpBytes = MerkleTrie.get(abi.encodePacked(addressHash), proof, stateRoot);
        require(acctRlpBytes.length > 0, "Account does not exist");
        RLPReader.RLPItem[] memory acctFields = acctRlpBytes.toRLPItem().readList();
        require(acctFields.length == 4);
        return bytes32(acctFields[2].readUint256());
    }
}
