// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;

/**
    @title Interface for Bridge contract.
    @author ChainSafe Systems.
 */
interface IGmpTransferAdapter {
    /**
        @notice Makes a native token deposit with an included message.
        @param destinationDomainID ID of destination chain.
        @param recipientAddress Address that will receive native tokens on destination chain.
     */

    function depositToEVM(
        uint8 destinationDomainID,
        address recipientAddress
    ) external payable;
}
