// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import "../../interfaces/IFeeHandler.sol";
import "../../interfaces/IERCHandler.sol";
import "../../interfaces/IBridge.sol";
import "../../ERC20Safe.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
    @title Handles deposit fees based on Effective rates provided by Fee oracle.
    @author ChainSafe Systems.
    @notice This contract is intended to be used with the Bridge contract.
 */
abstract contract DynamicFeeHandler is IFeeHandler, AccessControl, ERC20Safe {
    address public immutable _bridgeAddress;
    address public immutable _feeHandlerRouterAddress;

    address public _oracleAddress;

    uint32 public _gasUsed;
    uint16 public _feePercent; // multiplied by 100 to avoid precision loss

    struct OracleMessageType {
        // Base Effective Rate - effective rate between base currencies of source and dest networks (eg. MATIC/ETH)
        uint256 ber;
        // Token Effective Rate - rate between base currency of destination network and token that is being trasferred (eg. MATIC/USDT)
        uint256 ter;
        uint256 dstGasPrice;
        uint256 expiresAt;
        uint8 fromDomainID;
        uint8 toDomainID;
        bytes32 resourceID;
        uint256 msgGasLimit;
    }

    struct FeeDataType {
        bytes message;
        bytes sig;
        uint256 amount; // not used
    }

    event FeeOracleAddressSet(address feeOracleAddress);

    event FeeOraclePropertiesSet(uint32 gasUsed, uint16 feePercent);

    error InvalidSignature();

    error IncorrectFeeDataLength(uint256);

    error IncorrectFeeSupplied(uint256);

    error ObsoleteOracleData();

    error IncorrectDepositParams(uint8 fromDomainID, uint8 destinationDomainID, bytes32 resourceID);

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
            msg.sender == _bridgeAddress || msg.sender == _feeHandlerRouterAddress,
            "sender must be bridge or fee router contract"
        );
    }

    /**
        @param bridgeAddress Contract address of previously deployed Bridge.
        @param feeHandlerRouterAddress Contract address of previously deployed FeeHandlerRouter.
     */
    constructor(address bridgeAddress, address feeHandlerRouterAddress) {
        _bridgeAddress = bridgeAddress;
        _feeHandlerRouterAddress = feeHandlerRouterAddress;
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // Admin functions

    /**
        @notice Removes admin role from {_msgSender()} and grants it to {newAdmin}.
        @notice Only callable by an address that currently has the admin role.
        @param newAdmin Address that admin role will be granted to.
     */
    function renounceAdmin(address newAdmin) external {
        address sender = _msgSender();
        require(sender != newAdmin, 'Cannot renounce oneself');
        grantRole(DEFAULT_ADMIN_ROLE, newAdmin);
        renounceRole(DEFAULT_ADMIN_ROLE, sender);
    }

    /**
        @notice Sets the fee oracle address for signature verification.
        @param oracleAddress Fee oracle address.
     */
    function setFeeOracle(address oracleAddress) external onlyAdmin {
        _oracleAddress = oracleAddress;
        emit FeeOracleAddressSet(oracleAddress);
    }

    /**
        @notice Sets the fee properties.
        @param gasUsed Gas used for transfer.
        @param feePercent Percent of deposited amount taken as a fee.
            fee = depositAmount * feePercent / 1e4
     */
    function setFeeProperties(uint32 gasUsed, uint16 feePercent) external onlyAdmin {
        _gasUsed = gasUsed;
        _feePercent = feePercent;
        emit FeeOraclePropertiesSet(gasUsed, feePercent);
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
    function collectFee(address sender, uint8 fromDomainID, uint8 destinationDomainID, bytes32 resourceID, bytes calldata depositData, bytes calldata feeData) payable external onlyBridgeOrRouter {
        (uint256 fee, address tokenAddress) = _calculateFee(sender, fromDomainID, destinationDomainID, resourceID, depositData, feeData);
        if(tokenAddress == address(0)){
            if (msg.value != fee) revert IncorrectFeeSupplied(msg.value);
        } else {
            require(msg.value == 0, "collectFee: msg.value != 0");
            lockERC20(tokenAddress, sender, address(this), fee);
        }
        emit FeeCollected(sender, fromDomainID, destinationDomainID, resourceID, fee, tokenAddress);
    }

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
    function calculateFee(address sender, uint8 fromDomainID, uint8 destinationDomainID, bytes32 resourceID, bytes calldata depositData, bytes calldata feeData) external view returns(uint256 fee, address tokenAddress) {
        return _calculateFee(sender, fromDomainID, destinationDomainID, resourceID, depositData, feeData);
    }

    function _calculateFee(address sender, uint8 fromDomainID, uint8 destinationDomainID, bytes32 resourceID, bytes calldata depositData, bytes calldata feeData) internal view virtual returns(uint256 fee, address tokenAddress) {
    }

    /**
        @notice Transfers tokens from the contract to the specified addresses. The parameters addrs and amounts are mapped 1-1.
        This means that the address at index 0 for addrs will receive the amount of tokens from amounts at index 0.
        @param resourceID ResourceID of the token.
        @param addrs Array of addresses to transfer {amounts} to.
        @param amounts Array of amounts to transfer to {addrs}.
     */
    function transferFee(bytes32 resourceID, address[] calldata addrs, uint[] calldata amounts) external onlyAdmin {
        require(addrs.length == amounts.length, "addrs[], amounts[]: diff length");
        address tokenHandler = IBridge(_bridgeAddress)._resourceIDToHandlerAddress(resourceID);
        address tokenAddress = IERCHandler(tokenHandler)._resourceIDToTokenContractAddress(resourceID);
        for (uint256 i = 0; i < addrs.length; i++) {
            releaseERC20(tokenAddress, addrs[i], amounts[i]);
            emit FeeDistributed(tokenAddress, addrs[i], amounts[i]);
        }
    }

    function verifySig(bytes32 message, bytes memory signature, address signerAddress) internal pure {
        address signerAddressRecovered = ECDSA.recover(message, signature);
        if (signerAddressRecovered != signerAddress) revert InvalidSignature();
    }
}
