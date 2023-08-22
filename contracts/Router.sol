// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "./utils/Pausable.sol";


import "./interfaces/IERCHandler.sol";
import "./interfaces/IHandler.sol";
import "./interfaces/IFeeHandler.sol";
import "./interfaces/IAccessControlSegregator.sol";

/**
    @title Facilitates deposits and creation of deposit proposals, and deposit executions.
    @author ChainSafe Systems.
 */
contract Router is Context, Ownable {
    uint8   public immutable _domainID;
    IFeeHandler public _feeHandler;

    // destinationDomainID => number of deposits
    mapping(uint8 => uint64) public _depositCounts;
    // forwarder address => is Valid
    mapping(address => bool) public isValidForwarder;
    // destination domainID => nonce => transferHash
    mapping(uint8 => mapping(uint256 => bytes32)) public transferHashes;

    event FeeHandlerChanged(address newFeeHandler);
    event AccessControlChanged(address newAccessControl);
    event Deposit(
        uint8   destinationDomainID,
        uint8   securityModel, 
        bytes32 resourceID,
        uint64  depositNonce,
        address indexed user,
        bytes   data,
    );
    event Retry(string txHash);

    error AccessNotAllowed(address sender, bytes4 funcSig);
    error ResourceIDNotMappedToHandler();
    error DepositToCurrentDomain();
    error EmptyProposalsArray();
    error NonceDecrementsNotAllowed();


    modifier onlyAllowed() {
        _onlyAllowed(msg.sig, _msgSender());
        _;
    }

    function _onlyAllowed(bytes4 sig, address sender) private view {
        if (!_accessControl.hasAccess(sig, sender)) revert AccessNotAllowed(sender, sig);
    }

    function _msgSender() internal override view returns (address) {
        address signer = msg.sender;
        if (msg.data.length >= 20 && isValidForwarder[signer]) {
            assembly {
                signer := shr(96, calldataload(sub(calldatasize(), 20)))
            }
        }
        return signer;
    }

    /**
        @notice Initializes Bridge, creates and grants {_msgSender()} the admin role, sets access control
        contract for bridge and sets the inital state of the Bridge to paused.
        @param domainID ID of chain the Bridge contract exists on.
     */
    constructor (uint8 domainID) EIP712("Bridge", "3.1.0") {
        _domainID = domainID;
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
     */
    function deposit(uint8 destinationDomainID, uint8 securityModel, uint8 bytes32 resourceID, bytes calldata depositData, bytes calldata feeData)
        external payable
        returns (uint64 depositNonce) {
        if (destinationDomainID == _domainID) revert DepositToCurrentDomain();

        address sender = _msgSender();
        depositNonce = ++_depositCounts[destinationDomainID];
        transferHashes[destinationDomainID][depositNonce] = keccak256(
            abi.encode(
                destinationDomainID,
                securityModel,
                depositNonce,
                resourceID,
                keccak256(depositData)
            )
        );
        emit Deposit(destinationDomainID, securityModel, resourceID, depositNonce, sender, depositData);
        return depositNonce;
    }

    /**
        @notice This method is used to trigger the process for retrying failed deposits on the MPC side.
        @notice Only callable by address that has the right to call the specific function,
        which is mapped in {functionAccess} in AccessControlSegregator contract.
        @param txHash Transaction hash which contains deposit that should be retried
        @notice This is not applicable for failed executions on {PermissionedGenericHandler}
     */
    function retry(string memory txHash) external onlyAllowed {
        emit Retry(txHash);
    }
}
