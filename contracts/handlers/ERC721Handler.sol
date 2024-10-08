// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;

import "../interfaces/IHandler.sol";
import "./ERCHandlerHelpers.sol";
import { ERC721Safe } from "../ERC721Safe.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";


/**
    @title Handles ERC721 deposits and deposit executions.
    @author ChainSafe Systems.
    @notice This contract is intended to be used with the Bridge contract.
 */
contract ERC721Handler is IHandler, ERCHandlerHelpers, ERC721Safe {
    using SanityChecks for *;
    using ERC165Checker for address;

    bytes4 private constant _INTERFACE_ERC721_METADATA = 0x5b5e139f;

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
        @param data Consists of {tokenID} padded to 32 bytes.
        @notice Data passed into the function should be constructed as follows:
        tokenID                                     uint256    bytes    0  - 32
        destinationRecipientAddress     length      uint256    bytes    32 - 64
        destinationRecipientAddress                   bytes    bytes    64 - (64 + len(destinationRecipientAddress))
        metadata                        length      uint256    bytes    (64 + len(destinationRecipientAddress)) - (64 + len(destinationRecipientAddress) + 32)
        metadata                                      bytes    bytes    (64 + len(destinationRecipientAddress) + 32) - END
        @notice If the corresponding {tokenAddress} for the parsed {resourceID} supports {_INTERFACE_ERC721_METADATA},
        then {metaData} will be set according to the {tokenURI} method in the token contract.
        @dev Depending if the corresponding {tokenAddress} for the parsed {resourceID} is
        marked true in {_tokenContractAddressToTokenProperties[tokenAddress].isBurnable}, deposited tokens will be burned, if not, they will be locked.
        @return metaData : the deposited token metadata acquired by calling a {tokenURI} method in the token contract.
     */
    function deposit(
        bytes32    resourceID,
        address     depositor,
        bytes       calldata data
    ) external override onlyBridge returns (bytes memory metaData) {
        uint         tokenID;

        (tokenID) = abi.decode(data, (uint));

        address tokenAddress = _resourceIDToTokenContractAddress[resourceID];
        if (!_tokenContractAddressToTokenProperties[tokenAddress].isWhitelisted) revert ContractAddressNotWhitelisted(tokenAddress);

        // Check if the contract supports metadata, fetch it if it does
        if (tokenAddress.supportsInterface(_INTERFACE_ERC721_METADATA)) {
            IERC721Metadata erc721 = IERC721Metadata(tokenAddress);
            metaData = bytes(erc721.tokenURI(tokenID));
        }

        if (_tokenContractAddressToTokenProperties[tokenAddress].isBurnable) {
            burnERC721(tokenAddress, depositor, tokenID);
        } else {
            lockERC721(tokenAddress, depositor, address(this), tokenID);
        }
    }

    /**
        @notice Proposal execution should be initiated when a proposal is finalized in the Bridge contract.
        by a relayer on the deposit's destination chain.
        @param resourceID ResourceID to be used when making deposits.
        @param data Consists of {tokenID}, {resourceID}, {lenDestinationRecipientAddress},
        {destinationRecipientAddress}, {lenMeta}, and {metaData} all padded to 32 bytes.
        @notice Data passed into the function should be constructed as follows:
        tokenID                                     uint256    bytes    0  - 32
        destinationRecipientAddress     length      uint256    bytes    32 - 64
        destinationRecipientAddress                   bytes    bytes    64 - (64 + len(destinationRecipientAddress))
        metadata                        length      uint256    bytes    (64 + len(destinationRecipientAddress)) - (64 + len(destinationRecipientAddress) + 32)
        metadata                                      bytes    bytes    (64 + len(destinationRecipientAddress) + 32) - END
     */
    function executeProposal(bytes32 resourceID, bytes calldata data) external override onlyBridge returns (bytes memory) {
        uint         tokenID;
        uint         lenDestinationRecipientAddress;
        bytes memory destinationRecipientAddress;
        uint         offsetMetaData;
        uint         lenMetaData;
        bytes memory metaData;

        (tokenID, lenDestinationRecipientAddress) = abi.decode(data, (uint, uint));
        lenDestinationRecipientAddress.mustBe(20);
        offsetMetaData = 84;
        destinationRecipientAddress = bytes(data[64:offsetMetaData]);
        lenMetaData = abi.decode(data[offsetMetaData:], (uint));
        metaData = bytes(data[offsetMetaData + 32:offsetMetaData + 32 + lenMetaData]);

        bytes20 recipientAddress;

        assembly {
            recipientAddress := mload(add(destinationRecipientAddress, 0x20))
        }

        address tokenAddress = _resourceIDToTokenContractAddress[resourceID];
        if (!_tokenContractAddressToTokenProperties[tokenAddress].isWhitelisted) revert ContractAddressNotWhitelisted(tokenAddress);

        if (_tokenContractAddressToTokenProperties[tokenAddress].isBurnable) {
            mintERC721(tokenAddress, address(recipientAddress), tokenID, metaData);
        } else {
            releaseERC721(tokenAddress, address(this), address(recipientAddress), tokenID);
        }
        return abi.encode(tokenAddress, address(recipientAddress), tokenID);
    }

    /**
        @notice Used to manually release ERC721 tokens from ERC721Safe.
        @param data Consists of {tokenAddress}, {recipient}, and {tokenID} all padded to 32 bytes.
        @notice Data passed into the function should be constructed as follows:
        tokenAddress                           address     bytes  0 - 32
        recipient                              address     bytes  32 - 64
        tokenID                                uint        bytes  64 - 96
     */
    function withdraw(bytes memory data) external override onlyAuthorized {
        address tokenAddress;
        address recipient;
        uint tokenID;

        (tokenAddress, recipient, tokenID) = abi.decode(data, (address, address, uint));

        recipient.mustNotBeZero();
        releaseERC721(tokenAddress, address(this), recipient, tokenID);
    }

    /**
        @notice Sets {_resourceIDToContractAddress} with {contractAddress},
        {_tokenContractAddressToTokenProperties[tokenAddress].resourceID} with {resourceID} and
        {_tokenContractAddressToTokenProperties[tokenAddress].isWhitelisted} to true for {contractAddress} in ERCHandlerHelpers contract.
        @param resourceID ResourceID to be used when making deposits.
        @param contractAddress Address of contract to be called when a deposit is made and a deposited is executed.
        @param args Additional data to be passed to specified handler.
     */
    function setResource(bytes32 resourceID, address contractAddress, bytes calldata args) external onlyBridge {
        contractAddress.mustNotBeZero();
        _setResource(resourceID, contractAddress);
    }
}
