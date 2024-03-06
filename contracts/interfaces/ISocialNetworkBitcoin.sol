// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;

/**
    @title Interface for SocialNetwork adapter.
    @author ChainSafe Systems.
 */
interface ISocialNetworkBitcoin {
    function mint(address to, uint256 amount) external;
}
