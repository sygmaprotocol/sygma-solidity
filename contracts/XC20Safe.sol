// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;

import "./ERC20Safe.sol";
import "./interfaces/IERC20Plus.sol";

/**
    @title Manages deposited XC20s.
    @author ChainSafe Systems.
    @notice This contract is intended to be used with XC20Handler contract.
 */
contract XC20Safe is ERC20Safe {
    /**
        @notice Used to burn XC20s.
        @param tokenAddress Address of XC20 to burn.
        @param owner Current owner of tokens.
        @param amount Amount of tokens to burn.
     */
    function burnERC20(address tokenAddress, address owner, uint256 amount) internal override {
        IERC20Plus xc20 = IERC20Plus(tokenAddress);
        xc20.burn(owner, amount);
    }

    /**
        @notice Used to mint XC20s.
        @notice Token issuer can only mint tokens to himself (XC20Handler), overrides
        minting tokens from ERC20Safe so it mints tokens to handler and then transferes to recipient.
        @param tokenAddress Address of XC20 to mint.
        @param recipient Address to mint tokens to.
        @param amount Amount of tokens to mint.
     */
    function mintERC20(address tokenAddress, address recipient, uint256 amount) internal override {
        IERC20Plus xc20 = IERC20Plus(tokenAddress);
        xc20.mint(address(this), amount);
        _safeTransfer(xc20, recipient, amount);
    }
}
