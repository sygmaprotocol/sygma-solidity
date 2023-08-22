pragma solidity 0.8.11;

import {RLPReader} from "@optimism-bedrock/rlp/RLPReader.sol";
import {RLPWriter} from "@optimism-bedrock/rlp/RLPWriter.sol";
import {MerkleTrie} from "@optimism-bedrock/trie/MerkleTrie.sol";

library StorageProof {
    using RLPReader for RLPReader.RLPItem;
    using RLPReader for bytes;

    function getStorageValue(bytes32 slotHash, bytes32 storageRoot, bytes[] memory _stateProof)
        internal
        pure
        returns (uint256)
    {
        bytes memory valueRlpBytes =
            MerkleTrie.get(abi.encodePacked(slotHash), _stateProof, storageRoot);
        require(valueRlpBytes.length > 0, "Storage value does not exist");
        return valueRlpBytes.toRLPItem().readUint256();
    }

    function getStorageRoot(bytes[] memory proof, address contractAddress, bytes32 stateRoot)
        internal
        pure
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