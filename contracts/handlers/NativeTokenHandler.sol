// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;

import "../interfaces/IHandler.sol";
import "./ERCHandlerHelpers.sol";

/**
    @title Handles native token deposits and deposit executions.
    @author ChainSafe Systems.
    @notice This contract is intended to be used with the Bridge contract.
 */
contract NativeTokenHandler is IHandler, ERCHandlerHelpers {

    address public immutable _nativeTokenAdapterAddress;

    /**
        @param bridgeAddress Contract address of previously deployed Bridge.
     */
    constructor(
        address bridgeAddress,
        address nativeTokenAdapterAddress
    ) ERCHandlerHelpers(bridgeAddress) {
        _nativeTokenAdapterAddress = nativeTokenAdapterAddress;
    }

    event Withdrawal(address recipient, uint256 amount);
    event FundsTransferred(address recipient, uint256 amount);

    error FailedFundsTransfer();
    error InsufficientBalance();
    error InvalidSender(address sender);

    /**
        @notice A deposit is initiated by making a deposit to the NativeTokenAdapter which constructs the required
        deposit data and propagates it to the Bridge contract.
        @param resourceID ResourceID used to find address of token to be used for deposit.
        @param depositor Address of account making the deposit in the Bridge contract.
        @param data Consists of {amount} padded to 32 bytes.
        @notice Data passed into the function should be constructed as follows:
        amount                                      uint256     bytes   0 - 32
        destinationRecipientAddress     length      uint256     bytes  32 - 64
        destinationRecipientAddress                 bytes       bytes  64 - END
        @return deposit amount internal representation.
     */
    function deposit(
        bytes32 resourceID,
        address depositor,
        bytes   calldata data
    ) external override onlyBridge returns (bytes memory) {
        uint256        amount;
        (amount) = abi.decode(data, (uint256));

        if(depositor != _nativeTokenAdapterAddress) revert InvalidSender(depositor);

        address tokenAddress = _resourceIDToTokenContractAddress[resourceID];

        return abi.encodePacked(convertToInternalBalance(tokenAddress, amount));
    }

    /**
        @notice Proposal execution should be initiated when a proposal is finalized in the Bridge contract
        by a relayer on the deposit's destination chain.
        @param resourceID ResourceID to be used when making deposits.
        @param data Consists of {amount}, {lenDestinationRecipientAddress}
        and {destinationRecipientAddress}.
        @notice Data passed into the function should be constructed as follows:
        amount                                 uint256     bytes  0 - 32
        destinationRecipientAddress length     uint256     bytes  32 - 64 // not used
        destinationRecipientAddress            bytes       bytes  64 - 84
     */
    function executeProposal(bytes32 resourceID, bytes calldata data) external override onlyBridge returns (bytes memory) {
        (uint256 amount) = abi.decode(data, (uint256));
        address tokenAddress = _resourceIDToTokenContractAddress[resourceID];
        address recipientAddress = address(bytes20(bytes(data[64:84])));

        (bool success, ) = address(recipientAddress).call{value: amount}("");
        if(!success) revert FailedFundsTransfer();
        emit FundsTransferred(recipientAddress, amount);

        return abi.encode(tokenAddress, address(recipientAddress), amount);
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
        address recipient;
        uint amount;

        if (address(this).balance <= amount) revert InsufficientBalance();
        (, recipient, amount) = abi.decode(data, (address, address, uint));

        (bool success, ) = address(recipient).call{value: amount}("");
        if(!success) revert FailedFundsTransfer();
        emit Withdrawal(recipient, amount);
    }

    /**
        @notice Sets {_resourceIDToContractAddress} with {contractAddress},
        {_tokenContractAddressToTokenProperties[tokenAddress].resourceID} with {resourceID} and
        {_tokenContractAddressToTokenProperties[tokenAddress].isWhitelisted} to true for {contractAddress} in ERCHandlerHelpers contract.
        Sets decimals value for contractAddress if value is provided in args.
        @param resourceID ResourceID to be used when making deposits.
        @param contractAddress Address of contract to be called when a deposit is made and a deposited is executed.
        @param args Additional data passed to the handler - this should be 1 byte containing number of decimals places.
     */
    function setResource(bytes32 resourceID, address contractAddress, bytes calldata args) external onlyBridge {
        _setResource(resourceID, contractAddress);

        if (args.length > 0) {
            uint8 externalTokenDecimals = uint8(bytes1(args));
            _setDecimals(contractAddress, externalTokenDecimals);
        }
    }

    receive() external payable {}
}
