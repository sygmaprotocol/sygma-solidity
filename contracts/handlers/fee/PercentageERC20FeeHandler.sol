// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.11;

import "../../interfaces/IBridge.sol";
import "../../interfaces/IERCHandler.sol";
import "../../ERC20Safe.sol";
import { BasicFeeHandler } from "./BasicFeeHandler.sol";

/**
    @title Handles deposit fees on Substrate based on Effective rates provided by Fee oracle.
    @author ChainSafe Systems.
    @notice This contract is intended to be used with the Bridge contract.
 */
contract PercentageFeeHandler is BasicFeeHandler, ERC20Safe {

    /**
        @notice _fee inherited from BasicFeeHandler in this implementation is
        in BPS and should be multiplied by 10000 to avoid precision loss
     */
    uint256 public _lowerBound; // min fee in token amount
    uint256 public _upperBound; // max fee in token amount

    event FeeBoundsChanged(uint256 newLowerBound, uint256 newUpperBound);

    /**
        @param bridgeAddress Contract address of previously deployed Bridge.
        @param feeHandlerRouterAddress Contract address of previously deployed FeeHandlerRouter.
     */
    constructor(
        address bridgeAddress,
        address feeHandlerRouterAddress
    ) BasicFeeHandler(bridgeAddress, feeHandlerRouterAddress) {}

    // Admin functions

    /**
        @notice Calculates fee for deposit.
        @param sender Sender of the deposit.
        @param fromDomainID ID of the source chain.
        @param destinationDomainID ID of chain deposit will be bridged to.
        @param resourceID ResourceID to be used when making deposits.
        @param depositData Additional data about the deposit.
        @param feeData Additional data to be passed to the fee handler.
        @return fee Returns the fee amount.
        @return tokenAddress Returns the address of the token to be used for fee.
     */
    function calculateFee(address sender, uint8 fromDomainID, uint8 destinationDomainID, bytes32 resourceID, bytes calldata depositData, bytes calldata feeData) external view override returns(uint256 fee, address tokenAddress) {
        return _calculateFee(sender, fromDomainID, destinationDomainID, resourceID, depositData, feeData);
    }

    function _calculateFee(address sender, uint8 fromDomainID, uint8 destinationDomainID, bytes32 resourceID, bytes calldata depositData, bytes calldata feeData) internal view returns(uint256 fee, address tokenAddress) {
        address tokenHandler = IBridge(_bridgeAddress)._resourceIDToHandlerAddress(resourceID);
        address tokenAddress = IERCHandler(tokenHandler)._resourceIDToTokenContractAddress(resourceID);

        (uint256 depositAmount) = abi.decode(depositData, (uint256));

        fee = depositAmount * _fee / 1e8; // 10000 for BPS and 10000 to avoid precision loss

        if (fee < _lowerBound) {
            fee = _lowerBound;
        }

        // if upper bound is not set, fee is % of token amount
        else if (fee > _upperBound && _upperBound > 0) {
            fee = _upperBound;
        }

        return (fee, tokenAddress);
    }

        /**
        @notice Collects fee for deposit.
        @param sender Sender of the deposit.
        @param fromDomainID ID of the source chain.
        @param destinationDomainID ID of chain deposit will be bridged to.
        @param resourceID ResourceID to be used when making deposits.
        @param depositData Additional data about the deposit.
        @param feeData Additional data to be passed to the fee handler.
     */
    function collectFee(address sender, uint8 fromDomainID, uint8 destinationDomainID, bytes32 resourceID, bytes calldata depositData, bytes calldata feeData) payable external override onlyBridgeOrRouter {
        require(msg.value == 0, "collectFee: msg.value != 0");

        (uint256 fee, address tokenAddress) = _calculateFee(sender, fromDomainID, destinationDomainID, resourceID, depositData, feeData);
        lockERC20(tokenAddress, sender, address(this), fee);

        emit FeeCollected(sender, fromDomainID, destinationDomainID, resourceID, fee, tokenAddress);
    }

    /**
        @notice Sets new value for lower and upper fee bounds, both are in token amount.
        @notice Only callable by admin.
        @param newLowerBound Value {_newLowerBound} will be updated to.
        @param newUpperBound Value {_newUpperBound} will be updated to.
     */
    function changeFeeBounds(uint256 newLowerBound, uint256 newUpperBound) external onlyAdmin {
        require(newUpperBound > newLowerBound, "Upper bound must be larger than lower bound");
        require(_lowerBound != newLowerBound &&
            _upperBound != newUpperBound,
            "Current bounds are equal to new bounds"
        );
        _lowerBound = newLowerBound;
        _upperBound = newUpperBound;

        emit FeeBoundsChanged(newLowerBound, newUpperBound);
    }

        /**
        @notice Transfers tokens from the contract to the specified addresses. The parameters addrs and amounts are mapped 1-1.
        This means that the address at index 0 for addrs will receive the amount of tokens from amounts at index 0.
        @param resourceID ResourceID of the token.
        @param addrs Array of addresses to transfer {amounts} to.
        @param amounts Array of amounts to transfer to {addrs}.
     */
    function transferERC20Fee(bytes32 resourceID, address[] calldata addrs, uint[] calldata amounts) external onlyAdmin {
        require(addrs.length == amounts.length, "addrs[], amounts[]: diff length");
        address tokenHandler = IBridge(_bridgeAddress)._resourceIDToHandlerAddress(resourceID);
        address tokenAddress = IERCHandler(tokenHandler)._resourceIDToTokenContractAddress(resourceID);
        for (uint256 i = 0; i < addrs.length; i++) {
            releaseERC20(tokenAddress, addrs[i], amounts[i]);
            emit FeeDistributed(tokenAddress, addrs[i], amounts[i]);
        }
    }
}
