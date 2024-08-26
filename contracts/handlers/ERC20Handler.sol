// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;

import "../interfaces/IHandler.sol";
import "../interfaces/ISygmaMessageReceiver.sol";
import "./ERCHandlerHelpers.sol";
import "../ERC20Safe.sol";
import "../utils/ExcessivelySafeCall.sol";

/**
    @title Handles ERC20 deposits and deposit executions.
    @author ChainSafe Systems.
    @notice This contract is intended to be used with the Bridge contract.
 */
contract ERC20Handler is IHandler, ERCHandlerHelpers, ERC20Safe {
    using ExcessivelySafeCall for address;

    uint16 internal constant maxReturnBytes = 256;
    address internal constant transformRecipient = address(0);
    address public immutable _defaultMessageReceiver;

    enum OptionalMessageCheck { Absent, Valid, Invalid }

    /**
        @param bridgeAddress Contract address of previously deployed Bridge.
     */
    constructor(
        address bridgeAddress,
        address defaultMessageReceiver
    ) ERCHandlerHelpers(bridgeAddress) {
        _defaultMessageReceiver = defaultMessageReceiver;
    }

    /**
        @notice A deposit is initiated by making a deposit in the Bridge contract.
        @param resourceID ResourceID used to find address of token to be used for deposit.
        @param depositor Address of account making the deposit in the Bridge contract.
        @param data Consists of {amount}, {recipient}, {optionalGas}, {optionalMessage},
        padded to 32 bytes.
        @notice Data passed into the function should be constructed as follows:
        amount                             uint256 bytes  0 - 32
        destinationRecipientAddress length uint256 bytes 32 - 64
        destinationRecipientAddress        bytes   bytes 64 - (64 + len(destinationRecipientAddress))
        optionalGas                        uint256 bytes (64 + len(destinationRecipientAddress)) - (96 + len(destinationRecipientAddress))
        optionalMessage             length uint256 bytes (96 + len(destinationRecipientAddress)) - (128 + len(destinationRecipientAddress))
        optionalMessage                    bytes   bytes (160 + len(destinationRecipientAddress)) - END
        @dev Depending if the corresponding {tokenAddress} for the parsed {resourceID} is
        marked true in {_tokenContractAddressToTokenProperties[tokenAddress].isBurnable}, deposited tokens will be burned, if not, they will be locked.
        @return an empty data.
     */
    function deposit(
        bytes32 resourceID,
        address depositor,
        bytes   calldata data
    ) external override onlyBridge returns (bytes memory) {
        uint256        amount;
        (amount) = abi.decode(data, (uint));

        address tokenAddress = _resourceIDToTokenContractAddress[resourceID];
        if (!_tokenContractAddressToTokenProperties[tokenAddress].isWhitelisted) revert ContractAddressNotWhitelisted(tokenAddress);

        if (_tokenContractAddressToTokenProperties[tokenAddress].isBurnable) {
            burnERC20(tokenAddress, depositor, amount);
        } else {
            lockERC20(tokenAddress, depositor, address(this), amount);
        }

        return abi.encodePacked(convertToInternalBalance(tokenAddress, amount));
    }

    /**
        @notice Proposal execution should be initiated when a proposal is finalized in the Bridge contract.
        by a relayer on the deposit's destination chain.
        @param resourceID ResourceID to be used when making deposits.
        @param data Consists of {amount}, {recipient}, {optionalGas}, {optionalMessage},
        padded to 32 bytes.
        @notice Data passed into the function should be constructed as follows:
        amount                             uint256 bytes  0 - 32
        destinationRecipientAddress length uint256 bytes 32 - 64
        destinationRecipientAddress        bytes   bytes 64 - (64 + len(destinationRecipientAddress))
        optionalGas                        uint256 bytes (64 + len(destinationRecipientAddress)) - (96 + len(destinationRecipientAddress))
        optionalMessage             length uint256 bytes (96 + len(destinationRecipientAddress)) - (128 + len(destinationRecipientAddress))
        optionalMessage                    bytes   bytes (160 + len(destinationRecipientAddress)) - END
     */
    function executeProposal(bytes32 resourceID, bytes calldata data) external override onlyBridge returns (bytes memory) {
        uint256      amount;
        uint256      lenDestinationRecipientAddress;

        (amount, lenDestinationRecipientAddress) = abi.decode(data, (uint256, uint256));
        address recipientAddress = address(bytes20(bytes(data[64:64 + lenDestinationRecipientAddress])));

        address tokenAddress = _resourceIDToTokenContractAddress[resourceID];

        // Optional message recipient transformation.
        uint256 pointer = 64 + lenDestinationRecipientAddress;
        uint256 gas;
        uint256 messageLength;
        OptionalMessageCheck optionalMessageCheck;
        if (data.length > (pointer + 64)) {
            (gas, messageLength) = abi.decode(data[pointer:], (uint256, uint256));
            pointer += 64;
            if (gas > 0 && messageLength > 0 && (messageLength + pointer) <= data.length) {
                optionalMessageCheck = OptionalMessageCheck.Valid;
                if (recipientAddress == transformRecipient) {
                    recipientAddress = _defaultMessageReceiver;
                }
            } else {
                optionalMessageCheck = OptionalMessageCheck.Invalid;
            }
        }

        if (!_tokenContractAddressToTokenProperties[tokenAddress].isWhitelisted) revert ContractAddressNotWhitelisted(tokenAddress);

        uint256 externalAmount = convertToExternalBalance(tokenAddress, amount);
        if (_tokenContractAddressToTokenProperties[tokenAddress].isBurnable) {
            mintERC20(tokenAddress, recipientAddress, externalAmount);
        } else {
            releaseERC20(tokenAddress, recipientAddress, externalAmount);
        }

        if (optionalMessageCheck == OptionalMessageCheck.Invalid) {
            return abi.encode(
                tokenAddress,
                recipientAddress,
                amount,
                abi.encode(false, abi.encodeWithSignature("InvalidEncoding()"))
            );
        }
        if (optionalMessageCheck == OptionalMessageCheck.Valid) {
            bytes memory message = bytes(data[pointer:pointer + messageLength]);
            bytes memory recipientMessage = abi.encodeWithSelector(
                ISygmaMessageReceiver(recipientAddress).handleSygmaMessage.selector,
                tokenAddress,
                externalAmount,
                message
            );
            (bool success, bytes memory result) =
                recipientAddress.excessivelySafeCall(gas, 0, maxReturnBytes, recipientMessage);
            return abi.encode(tokenAddress, recipientAddress, amount, abi.encode(success, result));
        }

        return abi.encode(tokenAddress, recipientAddress, amount);
    }

    /**
        @notice Used to manually release ERC20 tokens from ERC20Safe.
        @param data Consists of {tokenAddress}, {recipient}, and {amount} all padded to 32 bytes.
        @notice Data passed into the function should be constructed as follows:
        tokenAddress                           address     bytes  0 - 32
        recipient                              address     bytes  32 - 64
        amount                                 uint        bytes  64 - 96
     */
    function withdraw(bytes memory data) external override onlyBridge {
        address tokenAddress;
        address recipient;
        uint amount;

        (tokenAddress, recipient, amount) = abi.decode(data, (address, address, uint));

        releaseERC20(tokenAddress, recipient, amount);
    }

    /**
        @notice Sets {_resourceIDToContractAddress} with {contractAddress},
        {_tokenContractAddressToTokenProperties[tokenAddress].resourceID} with {resourceID} and
        {_tokenContractAddressToTokenProperties[tokenAddress].isWhitelisted} to true for {contractAddress} in ERCHandlerHelpers contract.
        Sets decimals value for contractAddress if value is provided in args.
        @param resourceID ResourceID to be used when making deposits.
        @param contractAddress Address of contract to be called when a deposit is made and a deposited is executed.
        @param args Additional data to be passed to specified handler.
     */
    function setResource(bytes32 resourceID, address contractAddress, bytes calldata args) external onlyBridge {
        _setResource(resourceID, contractAddress);

        if (args.length > 0) {
            uint8 externalTokenDecimals = uint8(bytes1(args));
            _setDecimals(contractAddress, externalTokenDecimals);
        }
    }
}
