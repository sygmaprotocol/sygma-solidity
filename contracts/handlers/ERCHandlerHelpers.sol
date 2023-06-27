// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;

import "../interfaces/IERCHandler.sol";

/**
    @title Function used across handler contracts.
    @author ChainSafe Systems.
    @notice This contract is intended to be used with the Bridge contract.
 */
contract ERCHandlerHelpers is IERCHandler {
    address public immutable _bridgeAddress;

    uint8 public constant defaultDecimals = 18;

    struct Decimals {
        bool isSet;
        uint8 externalDecimals;
    }

    struct ERCTokenContractProperties {
      bytes32 resourceID;
      bool isWhitelisted;
      bool isBurnable;
      Decimals decimals;
    }

    error ContractAddressNotWhitelisted(address contractAddress);

    // resourceID => token contract address
    mapping (bytes32 => address) public _resourceIDToTokenContractAddress;

    // token contract address => ERCTokenContractProperties
    mapping (address => ERCTokenContractProperties) public _tokenContractAddressToTokenProperties;



    modifier onlyBridge() {
        _onlyBridge();
        _;
    }

    /**
        @param bridgeAddress Contract address of previously deployed Bridge.
     */
    constructor(
        address          bridgeAddress
    ) {
        _bridgeAddress = bridgeAddress;
    }

    function _onlyBridge() private view {
        require(msg.sender == _bridgeAddress, "sender must be bridge contract");
    }

    /**
        @notice First verifies {contractAddress} is whitelisted, then sets
        {_tokenContractAddressToTokenProperties[contractAddress].isBurnable} to true.
        @param contractAddress Address of contract to be used when making or executing deposits.
     */
    function setBurnable(address contractAddress) external override onlyBridge{
        _setBurnable(contractAddress);
    }

    function withdraw(bytes memory data) external virtual override {}

    function _setResource(bytes32 resourceID, address contractAddress) internal {
        _resourceIDToTokenContractAddress[resourceID] = contractAddress;
        _tokenContractAddressToTokenProperties[contractAddress].resourceID = resourceID;
        _tokenContractAddressToTokenProperties[contractAddress].isWhitelisted = true;
        _tokenContractAddressToTokenProperties[contractAddress].isBurnable = false;
    }

    function _setBurnable(address contractAddress) internal {
        if (!_tokenContractAddressToTokenProperties[contractAddress].isWhitelisted) revert ContractAddressNotWhitelisted(contractAddress);
        _tokenContractAddressToTokenProperties[contractAddress].isBurnable = true;
    }

    /**
        @notice First verifies {contractAddress} is whitelisted,
        then sets {_tokenContractAddressToTokenProperties[contractAddress].decimals.externalDecimals} to it's decimals value and
        {_tokenContractAddressToTokenProperties[contractAddress].decimals.isSet} to true.
        @param contractAddress Address of contract to be used when making or executing deposits.
        @param externalDecimals Decimal places of token that is transferred.
     */
    function _setDecimals(address contractAddress, uint8 externalDecimals) internal {
        if (!_tokenContractAddressToTokenProperties[contractAddress].isWhitelisted) revert ContractAddressNotWhitelisted(contractAddress);
        _tokenContractAddressToTokenProperties[contractAddress].decimals = Decimals({
            isSet: true,
            externalDecimals: externalDecimals
        });
    }

    /**
        @notice Converts token amount based on decimal places difference between the nework
        deposit is made on and bridge.
        @param tokenAddress Address of contract to be used when executing proposals.
        @param amount Decimals value to be set for {contractAddress}.
    */
    function convertToExternalBalance(address tokenAddress, uint256 amount) internal view returns(uint256) {
        Decimals memory decimals = _tokenContractAddressToTokenProperties[tokenAddress].decimals;
        if (!decimals.isSet) {
            return amount;
        } else if (decimals.externalDecimals >= defaultDecimals) {
            return amount * (10 ** (decimals.externalDecimals - defaultDecimals));
        } else {
            return amount / (10 ** (defaultDecimals - decimals.externalDecimals));
        }
    }

    /**
        @notice Converts token amount based on decimal places difference between the bridge and nework
        deposit is executed on.
        @param tokenAddress Address of contract to be used when executing proposals.
        @param amount Decimals value to be set for {contractAddress}.
    */
    function convertToInternalBalance(address tokenAddress, uint256 amount) internal view returns(bytes memory) {
        Decimals memory decimals = _tokenContractAddressToTokenProperties[tokenAddress].decimals;
        uint256 convertedBalance;
        if (!decimals.isSet) {
            return "";
        } else if (decimals.externalDecimals >= defaultDecimals) {
            convertedBalance =  amount / (10 ** (decimals.externalDecimals - defaultDecimals));
        } else {
            convertedBalance = amount * (10 ** (defaultDecimals - decimals.externalDecimals));
        }

        return abi.encodePacked(convertedBalance);
    }
}
