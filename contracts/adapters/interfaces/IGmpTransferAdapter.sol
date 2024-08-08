// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;

/**
    @title Interface for Bridge contract.
    @author ChainSafe Systems.
 */
interface IGmpTransferAdapter {
    /**
        @notice Initiates a transfer using Gmp handler.
        @param destinationDomainID ID of chain deposit will be bridged to.
        @param recipientAddress Address that will receive tokens on destination chain.
        @param XERC20Address Address of the tokens that shoul be transferred and burned on source chain.
        @param tokenAmount Amount of tokens that should be transferred.
     */
    function deposit(
        uint8 destinationDomainID,
        address recipientAddress,
        address XERC20Address,
        uint256 tokenAmount
    ) external payable;

    /**
        @notice Executes a GMP deposit proposal on GMP transfer adapter contract.
        @param gmpAdapter Address of the adapter on soruce chain (should be the same address across all chains).
        @param recipient Address that will receive tokens.
        @param XERC20Address Address of XERC20 contract that will mint tokens on destination chain.
        @param amount Amount of tones that should be minted to the recipinet.
     */
    function executeProposal(
        address gmpAdapter,
        address recipient,
        address XERC20Address,
        uint256 amount
    ) external;
}
