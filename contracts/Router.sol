// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
    @title Facilitates deposits and creation of deposit proposals, and deposit executions.
    @author ChainSafe Systems.
 */
contract Router is Context, Ownable {
    uint8   public immutable _domainID;
    IFeeHandler public _feeHandler;

    // destinationDomainID => number of deposits
    mapping(uint8 => uint64) public _depositCounts;
    // destination domainID => nonce => transferHash
    mapping(uint8 => mapping(uint256 => bytes32)) public transferHashes;

    event Deposit(
        uint8   destinationDomainID,
        uint8   securityModel, 
        bytes32 resourceID,
        uint64  depositNonce,
        address indexed user,
        bytes   data,
    );

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
        return signer;
    }

    /**
        @notice Initializes Bridge, creates and grants {_msgSender()} the admin role, sets access control
        contract for bridge and sets the inital state of the Bridge to paused.
        @param domainID ID of chain the Bridge contract exists on.
     */
    constructor (uint8 domainID) {
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
                _domainID,
                destinationDomainID,
                block.number,
                securityModel,
                depositNonce,
                resourceID,
                keccak256(depositData)
            )
        );
        emit Deposit(destinationDomainID, securityModel, resourceID, depositNonce, sender, depositData);
        return depositNonce;
    }
}
