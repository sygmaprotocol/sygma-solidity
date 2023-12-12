// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;

import "../../interfaces/IFeeHandler.sol";
import "../../utils/AccessControl.sol";
import "../FeeHandlerRouter.sol";

/**
    @title Handles deposit fees.
    @author ChainSafe Systems.
    @notice This contract is intended to be used with the Bridge contract.
 */
contract BasicFeeHandler is IFeeHandler, AccessControl {
    address public immutable _bridgeAddress;
    address public immutable _feeHandlerRouterAddress;
    address public immutable _routerAddress;
    mapping (uint8 => mapping(bytes32 => uint256)) public _domainResourceIDToFee;


    event FeeChanged(uint256 newFee);

    error IncorrectFeeSupplied(uint256);

    modifier onlyAdmin() {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "sender doesn't have admin role");
        _;
    }

    modifier onlyBridgeOrRouter() {
        _onlyBridgeOrRouter();
        _;
    }

    function _onlyBridgeOrRouter() private view {
        require(
            msg.sender == _bridgeAddress ||
            msg.sender == _feeHandlerRouterAddress ||
            msg.sender == _routerAddress,
            "sender must be bridge or fee router contract"
        );
    }

    /**
        @param bridgeAddress Contract address of previously deployed Bridge.
        @param feeHandlerRouterAddress Contract address of previously deployed FeeHandlerRouter.
     */
    constructor(address bridgeAddress, address feeHandlerRouterAddress, address routerAddress) {
        _bridgeAddress = bridgeAddress;
        _feeHandlerRouterAddress = feeHandlerRouterAddress;
        _routerAddress = routerAddress;
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
        @notice Removes admin role from {_msgSender()} and grants it to {newAdmin}.
        @notice Only callable by an address that currently has the admin role.
        @param newAdmin Address that admin role will be granted to.
     */
    function renounceAdmin(address newAdmin) external {
        address sender = _msgSender();
        require(sender != newAdmin, "Cannot renounce oneself");
        grantRole(DEFAULT_ADMIN_ROLE, newAdmin);
        renounceRole(DEFAULT_ADMIN_ROLE, sender);
    }

    /**
        @notice Collects fee for deposit.
        @param sender Sender of the deposit.
        @param fromDomainID ID of the source chain.
        @param destinationDomainID ID of chain deposit will be bridged to.
        @param resourceID ResourceID to be used when making deposits.
        @param depositData Additional data to be passed to specified handler.
        @param feeData Additional data to be passed to the fee handler.
     */
    function collectFee(
        address sender,
        uint8 fromDomainID,
        uint8 destinationDomainID,
        bytes32 resourceID,
        bytes calldata depositData,
        bytes calldata feeData
    ) external virtual payable  onlyBridgeOrRouter {
        uint256 currentFee = _domainResourceIDToFee[destinationDomainID][resourceID];
        if (msg.value != currentFee) revert IncorrectFeeSupplied(msg.value);
        emit FeeCollected(sender, fromDomainID, destinationDomainID, resourceID, currentFee, address(0));
    }

    /**
        @notice Calculates fee for deposit.
        @param sender Sender of the deposit.
        @param fromDomainID ID of the source chain.
        @param destinationDomainID ID of chain deposit will be bridged to.
        @param resourceID ResourceID to be used when making deposits.
        @param depositData Additional data to be passed to specified handler.
        @param feeData Additional data to be passed to the fee handler.
        @return Returns the fee amount.
     */
    function calculateFee(
        address sender,
        uint8 fromDomainID,
        uint8 destinationDomainID,
        bytes32 resourceID,
        bytes calldata depositData,
        bytes calldata feeData
    ) virtual external  view returns(uint256, address) {
        return (_domainResourceIDToFee[destinationDomainID][resourceID], address(0));
    }

    /**
        @notice Maps the {newFee} to {destinantionDomainID} to {resourceID} in {_domainResourceIDToFee}.
        @notice Only callable by admin.
        @param destinationDomainID ID of chain fee will be set.
        @param resourceID ResourceID for which fee will be set.
        @param newFee Value to which fee will be updated to for the provided {destinantionDomainID} and {resourceID}.
     */
    function changeFee(uint8 destinationDomainID, bytes32 resourceID, uint256 newFee) external onlyAdmin {
        uint256 currentFee = _domainResourceIDToFee[destinationDomainID][resourceID];
        require(currentFee != newFee, "Current fee is equal to new fee");
        _domainResourceIDToFee[destinationDomainID][resourceID] = newFee;
        emit FeeChanged(newFee);
    }

    /**
        @notice Transfers eth in the contract to the specified addresses.
        The parameters addrs and amounts are mapped 1-1.
        This means that the address at index 0 for addrs will receive the amount (in WEI) from amounts at index 0.
        @param addrs Array of addresses to transfer {amounts} to.
        @param amounts Array of amounts to transfer to {addrs}.
     */
    function transferFee(address payable[] calldata addrs, uint256[] calldata amounts) external onlyAdmin {
        require(addrs.length == amounts.length, "addrs[], amounts[]: diff length");
        for (uint256 i = 0; i < addrs.length; i++) {
            (bool success, ) = addrs[i].call{value: amounts[i]}("");
            require(success, "Fee ether transfer failed");
            emit FeeDistributed(address(0), addrs[i], amounts[i]);
        }
    }
}
