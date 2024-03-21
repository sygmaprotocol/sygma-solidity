// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;

import "./DynamicFeeHandlerV2.sol";

/**
    @title Handles deposit fees for generic messages based on Effective rates provided by Fee oracle.
    @author ChainSafe Systems.
    @notice This contract is intended to be used with the Bridge contract.
 */
contract DynamicGenericFeeHandlerEVM is DynamicFeeHandlerV2 {

    /**
        @param bridgeAddress Contract address of previously deployed Bridge.
        @param feeHandlerRouterAddress Contract address of previously deployed FeeHandlerRouter.
     */
    constructor(address bridgeAddress, address feeHandlerRouterAddress) DynamicFeeHandlerV2(bridgeAddress, feeHandlerRouterAddress) {
    }

     /**
        @notice Calculates fee for transaction cost.
        @param sender Sender of the deposit. // Not used
        @param fromDomainID ID of the source chain. // Not used
        @param destinationDomainID ID of chain deposit will be bridged to.
        @param resourceID ResourceID to be used when making deposits. // Not used
        @param depositData Additional data to be passed to specified handler. // Not used
        @param feeData Additional data about the deposit. // Not used
        @return fee Returns the fee amount.
        @return tokenAddress Returns the address of the token to be used for fee.
     */
    function _calculateFee(address sender, uint8 fromDomainID, uint8 destinationDomainID, bytes32 resourceID, bytes calldata depositData, bytes calldata feeData) internal view override returns (uint256 fee, address tokenAddress) {
        uint256 maxFee = uint256(bytes32(depositData[:32]));
        address desintationCoin = destinationNativeCoinWrap[destinationDomainID];
        uint256 txCost = desitnationGasPrice[destinationDomainID] * maxFee * twapOracle.getPrice(desintationCoin) / 1e18;
        return (txCost, address(0));
    }
}
