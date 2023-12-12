// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/Context.sol";


import "./interfaces/IAccessControlSegregator.sol";
import "./interfaces/IBridge.sol";
import "./interfaces/IHandler.sol";
import "./interfaces/IFeeHandler.sol";



/**
    @title Facilitates proposal deposits.
    @author ChainSafe Systems.
 */
contract Router is Context {
    using ECDSA for bytes32;

    IBridge public immutable _bridge;
    IAccessControlSegregator public _accessControl;
    uint8 public immutable _domainID;

    // destinationDomainID => number of deposits
    mapping(uint8 => uint64) public _depositCounts;

    error ResourceIDNotMappedToHandler();
    error DepositToCurrentDomain();
    error AccessNotAllowed(address sender, bytes4 funcSig);
    error BridgeIsPaused();

    event Deposit(
        uint8 destinationDomainID,
        bytes32 resourceID,
        uint64 depositNonce,
        address indexed user,
        bytes data,
        bytes handlerResponse
    );

    modifier onlyAllowed() {
        _onlyAllowed(msg.sig, _msgSender());
        _;
    }

    modifier whenBridgeNotPaused() {
        if (_bridge.paused()) revert BridgeIsPaused();
        _;
    }

    function _onlyAllowed(bytes4 sig, address sender) private view {
        if (!_accessControl.hasAccess(sig, sender)) revert AccessNotAllowed(sender, sig);
    }

    constructor(address bridge, address accessControl) {
        _bridge = IBridge(bridge);
        _accessControl = IAccessControlSegregator(accessControl);
        _domainID = IBridge(_bridge)._domainID();
    }

    /**
        @notice Sets the nonce for the specific domainID.
        @notice Only callable by address that has the right to call the specific function,
        which is mapped in {functionAccess} in AccessControlSegregator contract.
        @param domainID Domain ID for increasing nonce.
        @param nonce The nonce value to be set.
     */
    function adminSetDepositNonce(uint8 domainID, uint64 nonce) external onlyAllowed {
        require(nonce > _depositCounts[domainID], "Does not allow decrements of the nonce");
        _depositCounts[domainID] = nonce;
    }

    /**
        @notice Initiates a transfer using a specified handler contract.
        @notice Only callable when Bridge is not paused.
        @param destinationDomainID ID of chain deposit will be bridged to.
        @param resourceID ResourceID used to find address of handler to be used for deposit.
        @param depositData Additional data to be passed to specified handler.
        @param feeData Additional data to be passed to the fee handler.
        @notice Emits {Deposit} event with all necessary parameters and a handler response.
        @return depositNonce deposit nonce for the destination domain.
        @return handlerResponse a handler response:
        - ERC20Handler: responds with an empty data.
        - PermissionlessGenericHandler: responds with an empty data.
     */
    function deposit(
        uint8 destinationDomainID,
        bytes32 resourceID,
        bytes calldata depositData,
        bytes calldata feeData
    ) external payable whenBridgeNotPaused returns (uint64 depositNonce, bytes memory handlerResponse) {
        if (destinationDomainID == _domainID) revert DepositToCurrentDomain();

        address sender = _msgSender();
        IFeeHandler feeHandler = _bridge._feeHandler();
        if (address(feeHandler) == address(0)) {
            require(msg.value == 0, "no FeeHandler, msg.value != 0");
        } else {
            // Reverts on failure
            feeHandler.collectFee{value: msg.value}(
                sender,
                _domainID,
                destinationDomainID,
                resourceID,
                depositData,
                feeData
            );
        }
        address handler = _bridge._resourceIDToHandlerAddress(resourceID);
        if (handler == address(0)) revert ResourceIDNotMappedToHandler();

        depositNonce = ++_depositCounts[destinationDomainID];

        IHandler depositHandler = IHandler(handler);
        handlerResponse = depositHandler.deposit(resourceID, sender, depositData);

        emit Deposit(destinationDomainID, resourceID, depositNonce, sender, depositData, handlerResponse);
        return (depositNonce, handlerResponse);
    }
}
