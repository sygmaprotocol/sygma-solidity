// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;

/**
    @title Interface for BlockStorage contract.
    @author ChainSafe Systems.
 */
interface IBlockStorage {
    function getStateRoot(uint8 domainID, uint blockNumber) external view returns (bytes32);
}