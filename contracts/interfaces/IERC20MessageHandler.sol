// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;

/**
    @title Interface for Bridge contract.
    @author ChainSafe Systems.
 */
interface IERC20MessageHandler {
    /**
        @notice ERC20Handler will call this function on recipient if there is an optional message included.
        @param token Transferred token.
        @param amount Transferred amount.
        @param message Arbitrary message.
     */
    function handleSygmaERC20Message(
        address token,
        uint256 amount,
        bytes calldata message
    ) external;
}
