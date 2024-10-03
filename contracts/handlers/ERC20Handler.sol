// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;

import "../interfaces/IHandler.sol";
import "./ERCHandlerHelpers.sol";
import { ERC20Safe } from "../ERC20Safe.sol";
import "./DepositDataHelper.sol";
import "../utils/ExcessivelySafeCall.sol";

/**
    @title Handles ERC20 deposits and deposit executions.
    @author ChainSafe Systems.
    @notice This contract is intended to be used with the Bridge contract.
 */
contract ERC20Handler is IHandler, ERCHandlerHelpers, DepositDataHelper, ERC20Safe {
    using SanityChecks for *;
    using ExcessivelySafeCall for address;

    error OptionalMessageCallFailed();

    /**
        @param bridgeAddress Contract address of previously deployed Bridge.
        @param defaultMessageReceiver Contract address of previously deployed DefaultMessageReceiver.
     */
    constructor(
        address bridgeAddress,
        address defaultMessageReceiver
    ) DepositDataHelper(bridgeAddress, defaultMessageReceiver) {}

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
        @return 32-length byte array with internal bridge amount OR empty byte array if conversion is not needed.
     */
    function deposit(
        bytes32 resourceID,
        address depositor,
        bytes   calldata data
    ) external override onlyBridge returns (bytes memory) {
        uint256 amount;
        (amount) = abi.decode(data, (uint256));

        address tokenAddress = _resourceIDToTokenContractAddress[resourceID];
        if (!_tokenContractAddressToTokenProperties[tokenAddress].isWhitelisted) revert ContractAddressNotWhitelisted(tokenAddress);

        if (_tokenContractAddressToTokenProperties[tokenAddress].isBurnable) {
            burnERC20(tokenAddress, depositor, amount);
        } else {
            lockERC20(tokenAddress, depositor, address(this), amount);
        }

        return convertToInternalBalance(tokenAddress, amount);
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
        DepositData memory depositData = parseDepositData(resourceID, data);

        if (!_tokenContractAddressToTokenProperties[depositData.tokenAddress].isWhitelisted) revert ContractAddressNotWhitelisted(depositData.tokenAddress);

        if (_tokenContractAddressToTokenProperties[depositData.tokenAddress].isBurnable) {
            mintERC20(depositData.tokenAddress, depositData.recipientAddress, depositData.externalAmount);
        } else {
            releaseERC20(depositData.tokenAddress, depositData.recipientAddress, depositData.externalAmount);
        }

        if (depositData.optionalMessageCheck == OptionalMessageCheck.Invalid) {
            return depositData.message;
        }

        if (depositData.optionalMessageCheck == OptionalMessageCheck.Valid) {
            (bool success, bytes memory result) =
                depositData.recipientAddress.excessivelySafeCall(depositData.gas, 0, maxReturnBytes, depositData.message);
            if (!success && !ExcessivelySafeCall.revertWith(result)) revert OptionalMessageCallFailed();
            return abi.encode(depositData.tokenAddress, depositData.recipientAddress, depositData.amount, result);
        }

        return abi.encode(depositData.tokenAddress, depositData.recipientAddress, depositData.amount);
    }

    /**
        @notice Used to manually release ERC20 tokens from ERC20Safe.
        @param data Consists of {tokenAddress}, {recipient}, and {amount} all padded to 32 bytes.
        @notice Data passed into the function should be constructed as follows:
        tokenAddress                           address     bytes  0 - 32
        recipient                              address     bytes  32 - 64
        amount                                 uint        bytes  64 - 96
     */
    function withdraw(bytes memory data) external override onlyAuthorized {
        address tokenAddress;
        address recipient;
        uint amount;

        (tokenAddress, recipient, amount) = abi.decode(data, (address, address, uint));

        recipient.mustNotBeZero();
        releaseERC20(tokenAddress, recipient, amount);
    }

    /**
        @notice Sets {_resourceIDToContractAddress} with {contractAddress},
        {_tokenContractAddressToTokenProperties[tokenAddress].resourceID} with {resourceID} and
        {_tokenContractAddressToTokenProperties[tokenAddress].isWhitelisted} to true for {contractAddress} in ERCHandlerHelpers contract.
        Sets decimals value for contractAddress if value is provided in args.
        @param resourceID ResourceID to be used when making deposits.
        @param contractAddress Address of contract to be called when a deposit is made and a deposited is executed.
        @param args Byte array which is either empty if the token contract decimals are the same as the bridge defaultDecimals,
                    or has a first byte set to the uint8 decimals value of the token contract.
     */
    function setResource(bytes32 resourceID, address contractAddress, bytes calldata args) external onlyBridge {
        contractAddress.mustNotBeZero();
        _setResource(resourceID, contractAddress);

        if (args.length > 0) {
            uint8 externalTokenDecimals = uint8(bytes1(args));
            _setDecimals(contractAddress, externalTokenDecimals);
        }
    }
}
