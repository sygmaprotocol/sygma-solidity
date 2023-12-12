// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;

import "./IFeeHandler.sol";
import "./IAccessControlSegregator.sol";

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
        @return IFeeHandler The {_feeHandler} that is currently set for the Bridge contract.
     */
    function _feeHandler() external returns (IFeeHandler);

    /**
        @notice Exposing getter for {_accessControl} instead of forcing the use of call.
        @return IAccessControlSegregator The {_accessControl} that is currently set for the Bridge contract.
     */
    function _accessControl() external returns (IAccessControlSegregator);

    /**IFeeHandler
        @notice Exposing getter for {_resourceIDToHandlerAddress}.
        @param resourceID ResourceID to be used when making deposits.
        @return address The {handlerAddress} that is currently set for the resourceID.
     */
    function _resourceIDToHandlerAddress(bytes32 resourceID) external view returns (address);

    /**
        @notice Exposing getter for {paused} instead of forcing the use of call.
        @return bool The {paused} status that is currently set for the Bridge contract.
     */
    function paused() external returns (bool);
}
