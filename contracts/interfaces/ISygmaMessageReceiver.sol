// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;

/**
    @title Interface for optional message receive.
    @author ChainSafe Systems.
 */
interface ISygmaMessageReceiver {
    /**
        @notice ERC20 and NativeToken Handlers will call this function
        @notice on recipient if there is an optional message included.
        @param token Transferred token.
        @param amount Transferred amount.
        @param message Arbitrary message.
     */
    function handleSygmaMessage(
        address token,
        uint256 amount,
        bytes calldata message
    ) external payable;
}
