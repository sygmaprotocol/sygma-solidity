// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.11;

import "../interfaces/IHandler.sol";
import "./ERCHandlerHelpers.sol";
import "../ERC1155Safe.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/IERC1155MetadataURI.sol";

contract ERC1155Handler is IHandler, ERCHandlerHelpers, ERC1155Safe, ERC1155Holder {
    using ERC165Checker for address;

    bytes4 private constant _INTERFACE_ERC1155_METADATA = 0x0e89341c;
    bytes private constant EMPTY_BYTES = "";

    /**
        @param bridgeAddress Contract address of previously deployed Bridge.
     */
    constructor(
        address bridgeAddress
    ) ERCHandlerHelpers(bridgeAddress) {
    }

    /**
        @notice A deposit is initiated by making a deposit in the Bridge contract.
        @param resourceID ResourceID used to find address of token to be used for deposit.
        @param depositor Address of account making the deposit in the Bridge contract.
        @param data Consists of ABI-encoded arrays of tokenIDs and amounts.
        @notice Data passed into the function should be constructed as ABI encoding of:
        tokenIDs                                    uint256[]  bytes
        amounts                                     uint256[]  bytes
        destinationRecipientAddress                   bytes    bytes
        transferData                                  bytes    bytes
     */
    function deposit(bytes32 resourceID, address depositor, bytes calldata data) external override onlyBridge returns (bytes memory metaData) {
        uint[] memory tokenIDs;
        uint[] memory amounts;

        (tokenIDs, amounts) = abi.decode(data, (uint[], uint[]));

        address tokenAddress = _resourceIDToTokenContractAddress[resourceID];
        require(tokenAddress != address(0), "provided resourceID does not exist");

        if (_burnList[tokenAddress]) {
            burnBatchERC1155(tokenAddress, depositor, tokenIDs, amounts);
        } else {
            lockBatchERC1155(tokenAddress, depositor, address(this), tokenIDs, amounts, EMPTY_BYTES);
        }
    }

    /**
        @notice Proposal execution should be initiated when a proposal is finalized in the Bridge contract.
        by a relayer on the deposit's destination chain.
        @param resourceID ResourceID to be used when making deposits.
        @param data Consists of ABI-encoded {tokenIDs}, {amounts}, {recipient},
        and {transferData} of types uint[], uint[], bytes, bytes.
        @notice Data passed into the function should be constructed as ABI encoding of:
        tokenIDs                                    uint256[]  bytes
        amounts                                     uint256[]  bytes
        destinationRecipientAddress                   bytes    bytes
        transferData                                  bytes    bytes
     */
    function executeProposal(bytes32 resourceID, bytes calldata data) external override onlyBridge {
        uint[] memory tokenIDs;
        uint[] memory amounts;
        bytes memory recipient;
        bytes memory transferData;

        (tokenIDs, amounts, recipient, transferData) = abi.decode(data, (uint[], uint[], bytes, bytes));

        bytes20 recipientAddress;

        assembly {
            recipientAddress := mload(add(recipient, 0x20))
        }

        address tokenAddress = _resourceIDToTokenContractAddress[resourceID];
        require(_contractWhitelist[address(tokenAddress)], "provided tokenAddress is not whitelisted");

        if (_burnList[tokenAddress]) {
            mintBatchERC1155(tokenAddress, address(recipientAddress), tokenIDs, amounts, transferData);
        } else {
            releaseBatchERC1155(tokenAddress, address(this), address(recipientAddress), tokenIDs, amounts, transferData);
        }
    }

    /**
        @notice Used to manually release ERC1155 tokens from ERC1155Safe.
        @param data Consists of ABI-encoded {tokenAddress}, {recipient}, {tokenIDs},
        {amounts}, and {transferData} of types address, address, uint[], uint[], bytes.
     */
    function withdraw(bytes memory data) external override onlyBridge {
        address tokenAddress;
        address recipient;
        uint[] memory tokenIDs;
        uint[] memory amounts;
        bytes memory transferData;

        (tokenAddress, recipient, tokenIDs, amounts, transferData) = abi.decode(data, (address, address, uint[], uint[], bytes));

        releaseBatchERC1155(tokenAddress, address(this), recipient, tokenIDs, amounts, transferData);
    }

    /**
        @notice Sets {_resourceIDToContractAddress} with {contractAddress},
        {_contractAddressToResourceID} with {resourceID} and
        {_contractWhitelist} to true for {contractAddress} in ERCHandlerHelpers contract.
        @param handlerAddress Address of handler resource will be set for.
        @param resourceID ResourceID to be used when making deposits.
        @param contractAddress Address of contract to be called when a deposit is made and a deposited is executed.
        @param args Additional data to be passed to specified handler.
     */
    function adminSetResource(address handlerAddress, bytes32 resourceID, address contractAddress, bytes calldata args) external override onlyBridge {
        _setResource(resourceID, contractAddress);
    }
}
