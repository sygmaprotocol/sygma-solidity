// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;

import "./TwapNativeTokenFeeHandler.sol";

/**
    @title Handles deposit fees based on the destination chain's native coin price provided by Twap oracle.
    @author ChainSafe Systems.
    @notice This contract is intended to be used with the Bridge contract.
 */
contract TwapERC20NativeFeeHandler is TwapNativeTokenFeeHandler {

    /**
        @param bridgeAddress Contract address of previously deployed Bridge.
        @param feeHandlerRouterAddress Contract address of previously deployed FeeHandlerRouter.
        @param gasUsed Default gas used for proposal execution in the destination.
     */
    constructor(
        address bridgeAddress,
        address feeHandlerRouterAddress,
        uint32 gasUsed
    ) TwapNativeTokenFeeHandler(bridgeAddress, feeHandlerRouterAddress, gasUsed) {
    }
}
