// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;

/**
    @title Interface for Bridge contract.
    @author ChainSafe Systems.
 */
interface IBridge {
    /**
        @notice Exposing getter for {_domainID} instead of forcing the use of call.
        @return uint8 The {_domainID} that is currently set for the Bridge contract.
     */
    function _domainID() external returns (uint8);

    /**
        @notice Exposing getter for {_feeHandler} instead of forcing the use of call.
        @return address The {_feeHandler} that is currently set for the Bridge contract.
     */
    function _feeHandler() external returns (address);

    /**
        @notice Exposing getter for {_resourceIDToHandlerAddress}.
        @param resourceID ResourceID to be used when making deposits.
        @return address The {handlerAddress} that is currently set for the resourceID.
     */
    function _resourceIDToHandlerAddress(bytes32 resourceID) external view returns (address);

    /**
        @notice Initiates a transfer using a specified handler contract.
        @notice Only callable when Bridge is not paused.
        @param destinationDomainID ID of chain deposit will be bridged to.
        @param resourceID ResourceID used to find address of handler to be used for deposit.
        @param depositData Additional data to be passed to specified handler.
        @param feeData Additional data to be passed to the fee handler.
        @notice Emits {Deposit} event with all necessary parameters.
     */
    function deposit(
        uint8 destinationDomainID,
        bytes32 resourceID,
        bytes calldata depositData,
        bytes calldata feeData
    ) external payable returns (uint64 depositNonce, bytes memory handlerResponse);
}
