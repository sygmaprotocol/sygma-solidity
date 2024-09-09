// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;

import "./ERCHandlerHelpers.sol";
import "../interfaces/ISygmaMessageReceiver.sol";

/**
    @title Function used across handler contracts.
    @author ChainSafe Systems.
    @notice This contract is intended to be used with the Bridge contract.
 */
contract DepositDataHelper is ERCHandlerHelpers {
    address public immutable _defaultMessageReceiver;
    uint16 internal constant maxReturnBytes = 256;
    address internal constant transformRecipient = address(0);

    enum OptionalMessageCheck { Absent, Valid, Invalid }

    struct DepositData {
        address tokenAddress;
        uint256 amount;
        address recipientAddress;
        uint256 externalAmount;
        uint256 gas;
        OptionalMessageCheck optionalMessageCheck;
        bytes message;
    }

    /**
        @param bridgeAddress Contract address of previously deployed Bridge.
        @param defaultMessageReceiver Contract address of previously deployed DefaultMessageReceiver.
     */
    constructor(
        address bridgeAddress,
        address defaultMessageReceiver
    ) ERCHandlerHelpers(bridgeAddress) {
        _defaultMessageReceiver = defaultMessageReceiver;
    }

    /**
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
    function parseDepositData(bytes32 resourceID, bytes calldata data) internal view returns(DepositData memory) {
        uint256 amount;
        uint256 lenDestinationRecipientAddress;

        (amount, lenDestinationRecipientAddress) = abi.decode(data, (uint256, uint256));
        address recipientAddress = address(bytes20(bytes(data[64:64 + lenDestinationRecipientAddress])));

        address tokenAddress = _resourceIDToTokenContractAddress[resourceID];
        uint256 externalAmount = convertToExternalBalance(tokenAddress, amount);

        // Optional message recipient transformation.
        uint256 pointer = 64 + lenDestinationRecipientAddress;
        uint256 gas;
        uint256 messageLength;
        bytes memory message;
        OptionalMessageCheck optionalMessageCheck;
        if (data.length > (pointer + 64)) {
            (gas, messageLength) = abi.decode(data[pointer:], (uint256, uint256));
            pointer += 64;
            if (gas > 0 && messageLength > 0 && (messageLength + pointer) <= data.length) {
                optionalMessageCheck = OptionalMessageCheck.Valid;
                if (recipientAddress == transformRecipient) {
                    recipientAddress = _defaultMessageReceiver;
                }
                message = abi.encodeWithSelector(
                    ISygmaMessageReceiver(recipientAddress).handleSygmaMessage.selector,
                    tokenAddress,
                    externalAmount,
                    bytes(data[pointer:pointer + messageLength])
                );
            } else {
                optionalMessageCheck = OptionalMessageCheck.Invalid;
                message = abi.encode(
                    tokenAddress,
                    recipientAddress,
                    amount,
                    abi.encodeWithSignature("InvalidEncoding()")
                );
            }
        }

        return DepositData(
            tokenAddress,
            amount,
            recipientAddress,
            externalAmount,
            gas,
            optionalMessageCheck,
            message
        );
    }
}
