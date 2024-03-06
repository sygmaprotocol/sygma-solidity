// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.11;

import "../../utils/AccessControl.sol";
import {ERC20Safe} from "../../ERC20Safe.sol";

/**
    @title Handles deposit fees.
    @author ChainSafe Systems.
    @notice This contract is intended to be used with the Bridge contract.
 */
contract SocialNetworkPercentageFeeHandler is ERC20Safe, AccessControl {
    uint32 public constant HUNDRED_PERCENT = 1e8;
    uint256 public _fee;
    address public _socialNetworkBitcoin;

    struct Bounds {
        uint128 lowerBound; // min fee in token amount
        uint128 upperBound; // max fee in token amount
    }

    Bounds public _feeBounds;

    event FeeChanged(uint256 newFee);
    event FeeBoundsChanged(uint256 newLowerBound, uint256 newUpperBound);
    /**
        @notice This event is emitted when the fee is distributed to an address.
        @param recipient Address that receives the distributed fee.
        @param amount Amount that is distributed.
     */
    event FeeDistributed(
        address recipient,
        uint256 amount
    );

    modifier onlyAdmin() {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "sender doesn't have admin role");
        _;
    }


    constructor (
        address socialNetworkBitcoin
    ) {
        _socialNetworkBitcoin = socialNetworkBitcoin;
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }


    /**
        @notice Calculates fee for deposit.
        @param depositAmount Additional data to be passed to the fee handler.
        @return fee Returns the fee amount.
     */
    function calculateFee(uint256 depositAmount) external view returns(uint256 fee) {
        return _calculateFee(depositAmount);
    }

    function _calculateFee(uint256 depositAmount) internal view returns(uint256 fee) {
        Bounds memory bounds = _feeBounds;

        fee = depositAmount * _fee / HUNDRED_PERCENT; // 10000 for BPS and 10000 to avoid precision loss

        if (fee < bounds.lowerBound) {
            fee = bounds.lowerBound;
        }

        // if upper bound is not set, fee is % of token amount
        else if (fee > bounds.upperBound && bounds.upperBound > 0) {
            fee = bounds.upperBound;
        }

        return fee;
    }

    // Admin functions

    /**
        @notice Sets new value for lower and upper fee bounds, both are in token amount.
        @notice Only callable by admin.
        @param newLowerBound Value {_newLowerBound} will be updated to.
        @param newUpperBound Value {_newUpperBound} will be updated to.
     */
    function changeFeeBounds(uint128 newLowerBound, uint128 newUpperBound) external onlyAdmin {
        require(newUpperBound == 0 || (newUpperBound > newLowerBound), "Upper bound must be larger than lower bound or 0");
        Bounds memory existingBounds = _feeBounds;
        require(existingBounds.lowerBound != newLowerBound ||
            existingBounds.upperBound != newUpperBound,
            "Current bounds are equal to new bounds"
        );

        Bounds memory newBounds = Bounds(newLowerBound, newUpperBound);
        _feeBounds = newBounds;

        emit FeeBoundsChanged(newLowerBound, newUpperBound);
    }

    /**
        @notice Only callable by admin.
        @param newFee Value to which fee will be updated to for the provided {destinantionDomainID} and {resourceID}.
     */
    function changeFee(uint256 newFee) external onlyAdmin {
        require(_fee != newFee, "Current fee is equal to new fee");
        _fee = newFee;
        emit FeeChanged(newFee);
    }

    /**
        @notice Transfers tokens from the contract to the specified addresses. The parameters addrs and amounts are mapped 1-1.
        This means that the address at index 0 for addrs will receive the amount of tokens from amounts at index 0.
        @param addrs Array of addresses to transfer {amounts} to.
        @param amounts Array of amounts to transfer to {addrs}.
     */
    function transferERC20Fee(address[] calldata addrs, uint[] calldata amounts) external onlyAdmin {
        require(addrs.length == amounts.length, "addrs[], amounts[]: diff length");
        for (uint256 i = 0; i < addrs.length; i++) {
            releaseERC20(_socialNetworkBitcoin, addrs[i], amounts[i]);
            emit FeeDistributed(addrs[i], amounts[i]);
        }
    }
}
