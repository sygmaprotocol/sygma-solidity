// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "../../../interfaces/IFeeHandler.sol";
import "../../../interfaces/IERCHandler.sol";
import "../../../interfaces/IBridge.sol";
import "./TwapOracle.sol";

/**
    @title Handles deposit fees based on Effective rates provided by Fee oracle.
    @author ChainSafe Systems.
    @notice This contract is intended to be used with the Bridge contract.
 */
abstract contract DynamicFeeHandlerV2 is IFeeHandler, AccessControl {
    address public immutable _bridgeAddress;
    address public immutable _feeHandlerRouterAddress;

    TwapOracle public twapOracle;

    uint32 public _gasUsed;

    mapping(uint8 => address) public destinationNativeCoinWrap;
    mapping(uint8 => uint256) public destinationGasPrice;

    event FeeOracleAddressSet(TwapOracle feeOracleAddress);
    event FeePropertySet(uint32 gasUsed);
    event GasPriceSet(uint8 destinationDomainID, uint256 gasPrice);
    event WrapTokenAddressSet(uint8 destinationDomainID, address wrapTokenAddress);

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

    /**
        @notice Exposes getter function for fee handler type
     */
    function feeHandlerType() virtual public returns (string memory) {
        return "twap";
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
    function setFeeOracle(TwapOracle oracleAddress) external onlyAdmin {
        twapOracle = oracleAddress;
        emit FeeOracleAddressSet(oracleAddress);
    }

    /**
        @notice Sets the gas price for destination chain.
        @param destinationDomainID ID of destination chain.
        @param gasPrice Gas price of destination chain.
     */
    function setGasPrice(uint8 destinationDomainID, uint256 gasPrice) external onlyAdmin {
        destinationGasPrice[destinationDomainID] = gasPrice;
        emit GasPriceSet(destinationDomainID, gasPrice);
    }

    /**
        @notice Sets the wrap token address for destination chain.
        @param destinationDomainID ID of destination chain.
        @param wrapToken Wrap token address of destination chain.
     */
    function setWrapTokenAddress(uint8 destinationDomainID, address wrapToken) external onlyAdmin {
        destinationNativeCoinWrap[destinationDomainID] = wrapToken;
        emit WrapTokenAddressSet(destinationDomainID, wrapToken);
    }

    /**
        @notice Sets the fee properties.
        @param gasUsed Gas used for transfer.
     */
    function setFeeProperties(uint32 gasUsed) external onlyAdmin {
        _gasUsed = gasUsed;
        emit FeePropertySet(gasUsed);
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
        (uint256 fee, ) = _calculateFee(sender, fromDomainID, destinationDomainID, resourceID, depositData, feeData);
        if (msg.value < fee) revert IncorrectFeeSupplied(msg.value);
        uint256 remaining = msg.value - fee;
        if (remaining != 0) {
            (bool sent, ) = sender.call{value: remaining}("");
            require(sent, "Failed to send remaining Ether");
        }
        emit FeeCollected(sender, fromDomainID, destinationDomainID, resourceID, fee, address(0));
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

    function _calculateFee(address sender, uint8 fromDomainID, uint8 destinationDomainID, bytes32 resourceID, bytes calldata depositData, bytes calldata feeData) internal view virtual returns(uint256 fee, address tokenAddress);

    /**
        @notice Transfers eth in the contract to the specified addresses. The parameters addrs and amounts are mapped 1-1.
        This means that the address at index 0 for addrs will receive the amount (in WEI) from amounts at index 0.
        @param addrs Array of addresses to transfer {amounts} to.
        @param amounts Array of amounts to transfer to {addrs}.
     */
    function transferFee(address payable[] calldata addrs, uint[] calldata amounts) external onlyAdmin {
        require(addrs.length == amounts.length, "addrs[], amounts[]: diff length");
        for (uint256 i = 0; i < addrs.length; i++) {
            (bool success,) = addrs[i].call{value: amounts[i]}("");
            require(success, "Fee ether transfer failed");
            emit FeeDistributed(address(0), addrs[i], amounts[i]);
        }
    }
}
