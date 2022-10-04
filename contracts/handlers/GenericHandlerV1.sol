// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.11;

import "../interfaces/IGenericHandler.sol";

/**
    @title Handles generic deposits and deposit executions.
    @author ChainSafe Systems.
    @notice This contract is intended to be used with the Bridge contract.
 */
contract GenericHandlerV1 is IGenericHandler {
    address public immutable _bridgeAddress;

    modifier onlyBridge() {
        _onlyBridge();
        _;
    }

    function _onlyBridge() private view {
        require(msg.sender == _bridgeAddress, "sender must be bridge contract");
    }

    /**
        @param bridgeAddress Contract address of previously deployed Bridge.
     */
    constructor(
        address          bridgeAddress
    ) public {
        _bridgeAddress = bridgeAddress;
    }

    /**
        @notice Temporary doesn't do anything, required in IGenericHandler.
        @notice Sets {_resourceIDToContractAddress} with {contractAddress}
        @param resourceID ResourceID to be used when making deposits.
        @param contractAddress Address of contract to be called when a deposit is made and a deposited is executed.
        @param depositFunctionSig Function signature of method to be called in {contractAddress} when a deposit is made.
        @param depositFunctionDepositorOffset Depositor address position offset in the metadata, in bytes.
        @param executeFunctionSig Function signature of method to be called in {contractAddress} when a deposit is executed.
     */
    function setResource(
        bytes32 resourceID,
        address contractAddress,
        bytes4 depositFunctionSig,
        uint256 depositFunctionDepositorOffset,
        bytes4 executeFunctionSig
    ) external onlyBridge override {}

    /**
        @notice A deposit is initiated by making a deposit in the Bridge contract.
        @param resourceID ResourceID used to find address of contract to be used for deposit.
        @param depositor Address of the account making deposit in the Bridge contract.
        @param data Structure should be constructed as follows:
          len(metaData):               uint256                        bytes 0   - 32
          executeFuntionSignature:     bytes4    padded to 32 bytes   bytes 32  - 64
          executeContractAddress       address   padded to 32 bytes   bytes 64  - 96
          maxFee:                      uint256                        bytes 96  - 128
          metaData:
            metadataDepositor:         address   padded to 32 bytes   bytes 128 - 156
            executionData:             bytes                          bytes 128 - len(metaData)
     */
    function deposit(bytes32 resourceID, address depositor, bytes calldata data) external returns (bytes memory) {
        require(data.length > 160, "Incorrect data length");

        uint256        lenMetadata;
        uint256        metadataDepositor;
        bytes   memory metaData;

        lenMetadata = abi.decode(data, (uint256));
        metaData = bytes(data[128:128 + lenMetadata]);

        assembly {
            metadataDepositor := mload(add(metaData, 44))
        }
        // metaData contains:       0x + depositorAddress + executionData************************
        // Shift it 12 bytes right: 0x000000000000000000000000depositorAddress
        require(depositor == address(uint160(metadataDepositor >> 96)), 'incorrect depositor in deposit data');
    }

    /**
        @notice Proposal execution should be initiated when a proposal is finalized in the Bridge contract.
        @param resourceID ResourceID used to find address of contract to be used for deposit.
        @param data Structure should be constructed as follows:
          len(metaData):               uint256                        bytes 0   - 32
          executeFuntionSignature:     bytes4    padded to 32 bytes   bytes 32  - 64
          executeContractAddress       address   padded to 32 bytes   bytes 64  - 96
          maxFee:                      uint256                        bytes 96  - 128
          metadata:
            metadataDepositor:         address   padded to 32 bytes   bytes 128 - 160
            executionData:             bytes                          bytes 128 - len(metaData)
     */
    function executeProposal(bytes32 resourceID, bytes calldata data) external {
        uint256        lenMetadata;
        bytes32        executeFuntionSignature;
        uint256        executeContractAddress;
        uint256        maxFee;
        bytes   memory metadata;
        bytes4         functionSignature;
        address        contractAddress;

        (lenMetadata, executeFuntionSignature, executeContractAddress, maxFee) = abi.decode(data, (uint256, bytes32, uint256, uint256));

        functionSignature = bytes4(bytes(data[60:64]));
        metadata          = bytes(data[128:128 + lenMetadata]);
        contractAddress   = address(uint160(executeContractAddress));

        bytes memory callData = abi.encodePacked(functionSignature, metadata);
        contractAddress.call(callData);
    }
}
