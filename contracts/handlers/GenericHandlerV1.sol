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
          maxFee:                       uint256  bytes  0                                                                                           -  32
          len(executeFuncSignature):    uint16   bytes  32                                                                                          -  34
          executeFuncSignature:         bytes    bytes  34                                                                                          -  34 + len(executeFuncSignature)
          len(executeContractAddress):  uint8    bytes  34 + len(executeFuncSignature)                                                              -  35 + len(executeFuncSignature)
          executeContractAddress        bytes    bytes  35 + len(executeFuncSignature)                                                              -  35 + len(executeFuncSignature) + len(executeContractAddress)
          len(executionDataDepositor):  uint8    bytes  35 + len(executeFuncSignature) + len(executeContractAddress)                                -  36 + len(executeFuncSignature) + len(executeContractAddress)
          executionDataDepositor:       bytes    bytes  36 + len(executeFuncSignature) + len(executeContractAddress)                                -  48 + len(executeFuncSignature) + len(executeContractAddress) + len(executionDataDepositor)
          executionData:                bytes    bytes  48 + len(executeFuncSignature) + len(executeContractAddress) + len(executionDataDepositor)  -  END
     */
    function deposit(bytes32 resourceID, address depositor, bytes calldata data) external returns (bytes memory) {
        require(data.length > 81, "Incorrect data length");

        uint256        maxFee;
        uint16         lenExecuteFuncSignature;
        bytes   memory executeFuncSignature;
        uint8          lenExecuteContractAddress;
        bytes   memory executeContractAddress;
        uint8          lenExecutionDataDepositor;
        bytes   memory executionDataDepositor;
        address        executionDataDepositorAddress;

        (maxFee) = abi.decode(data, (uint256));
        lenExecuteFuncSignature           = uint16(bytes2(data[32:34]));
        executeFuncSignature              = bytes(data[34:34 + lenExecuteFuncSignature]);
        lenExecuteContractAddress         = uint8(bytes1(data[34 + lenExecuteFuncSignature:35 + lenExecuteFuncSignature]));
        executeContractAddress            = bytes(data[35 + lenExecuteFuncSignature:35 + lenExecuteFuncSignature + lenExecuteContractAddress]);
        lenExecutionDataDepositor         = uint8(bytes1(data[35 + lenExecuteFuncSignature + lenExecuteContractAddress:36 + lenExecuteFuncSignature + lenExecuteContractAddress]));
        // bytes 36 - 48 are skipped because address is padded to 32 bytes
        executionDataDepositor            = bytes(data[48 + lenExecuteFuncSignature + lenExecuteContractAddress:48 + lenExecuteFuncSignature + lenExecuteContractAddress + lenExecutionDataDepositor]);

        assembly {
            executionDataDepositorAddress := mload(add(executionDataDepositor, lenExecutionDataDepositor))
        }

        require(depositor == address(executionDataDepositorAddress), 'incorrect depositor in deposit data');
    }

    /**
        @notice Proposal execution should be initiated when a proposal is finalized in the Bridge contract.
        @param resourceID ResourceID used to find address of contract to be used for deposit.
        @param data Structure should be constructed as follows:
          maxFee:                             uint256  bytes  0                                                             -  32
          len(executeFuncSignature):          uint16   bytes  32                                                            -  34
          executeFuncSignature:               bytes    bytes  34                                                            -  34 + len(executeFuncSignature)
          len(executeContractAddress):        uint8    bytes  34 + len(executeFuncSignature)                                -  35 + len(executeFuncSignature)
          executeContractAddress              bytes    bytes  35 + len(executeFuncSignature)                                -  35 + len(executeFuncSignature) + len(executeContractAddress)
          len(executionDataDepositor):        uint8    bytes  35 + len(executeFuncSignature) + len(executeContractAddress)  -  36 + len(executeFuncSignature) + len(executeContractAddress)
          executionDataDepositorWithData:     bytes    bytes  36 + len(executeFuncSignature) + len(executeContractAddress)  -  END
     */
    function executeProposal(bytes32 resourceID, bytes calldata data) external {
        uint256        maxFee;
        uint16         lenExecuteFuncSignature;
        bytes4         executeFuncSignature;
        uint8          lenExecuteContractAddress;
        bytes   memory executeContractAddress;
        bytes   memory executionDataDepositorWithData;
        address        contractAddress;

        (maxFee) = abi.decode(data, (uint256));
        lenExecuteFuncSignature           = uint16(bytes2(data[32:34]));
        executeFuncSignature              = bytes4(data[34:34 + lenExecuteFuncSignature]);
        lenExecuteContractAddress         = uint8(bytes1(data[34 + lenExecuteFuncSignature:35 + lenExecuteFuncSignature]));
        executeContractAddress            = bytes(data[35 + lenExecuteFuncSignature:35 + lenExecuteFuncSignature + lenExecuteContractAddress]);
        executionDataDepositorWithData    = bytes(data[36 + lenExecuteFuncSignature + lenExecuteContractAddress:]);


        assembly {
            contractAddress := mload(add(executeContractAddress, lenExecuteContractAddress))
        }

        bytes memory callData = abi.encodePacked(executeFuncSignature, executionDataDepositorWithData);
        address(contractAddress).call(callData);
    }
}
