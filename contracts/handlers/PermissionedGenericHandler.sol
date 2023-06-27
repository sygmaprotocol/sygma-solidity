// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;

import "../interfaces/IHandler.sol";

/**
    @title Handles generic deposits and deposit executions.
    @author ChainSafe Systems.
    @notice This contract is intended to be used with the Bridge contract.
 */
contract PermissionedGenericHandler is IHandler {
    address public immutable _bridgeAddress;

    struct TokenContractProperties {
      bytes32 resourceID;
      bytes4 depositFunctionSignature; // deposit function signature
      uint16 depositFunctionDepositorOffset; // depositor address position offset in the metadata
      bytes4 executeFunctionSignature; // execute proposal function signature
      bool isWhitelisted;
    }

    error ContractAddressNotWhitelisted(address contractAddress);

    // token contract address => TokenContractProperties
    mapping (address => TokenContractProperties) public _tokenContractAddressToTokenProperties;

    // resourceID => contract address
    mapping (bytes32 => address) public _resourceIDToContractAddress;

    event FailedHandlerExecution();

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
    ) {
        _bridgeAddress = bridgeAddress;
    }

    /**
        @notice Sets {_resourceIDToContractAddress} with {contractAddress},
        {_tokenContractAddressToTokenProperties[contractAddress].resourceID} with {resourceID},
        {_tokenContractAddressToTokenProperties[contractAddress].depositFunctionSignature} with {depositFunctionSig},
        {_tokenContractAddressToTokenProperties[contractAddress].depositFunctionDepositorOffset} with {depositFunctionDepositorOffset},
        {_tokenContractAddressToTokenProperties[contractAddress].executeFunctionSignature} with {executeFunctionSig},
        and {_tokenContractAddressToTokenProperties[contractAddress].isWhitelisted} to true for {contractAddress}.
        @param resourceID ResourceID to be used when making deposits.
        @param contractAddress Address of contract to be called when a deposit is made and a deposited is executed.
        @param args Additional data to be passed to specified handler.
        Permissioned handler structure should be it constructed as follows:
          depositFunctionSig:              bytes4  bytes 0 - 4
          depositFunctionDepositorOffset:  uint16  bytes 4 - 6
          executeFunctionSig:              bytes4  bytes 6 - 10
     */
    function setResource(
        bytes32 resourceID,
        address contractAddress,
        bytes calldata args
    ) external onlyBridge {
        bytes4  depositFunctionSig = bytes4(args[0:4]);
        uint16  depositFunctionDepositorOffset = uint16(bytes2(args[4:6]));
        bytes4  executeFunctionSig = bytes4(args[6:10]);

        _setResource(resourceID, contractAddress, depositFunctionSig, depositFunctionDepositorOffset, executeFunctionSig);
    }

    /**
        @notice A deposit is initiated by making a deposit in the Bridge contract.
        @param resourceID ResourceID used to find address of contract to be used for deposit.
        @param depositor Address of the account making deposit in the Bridge contract.
        @param data Consists of: {resourceID}, {lenMetaData}, and {metaData} all padded to 32 bytes.
        @notice Data passed into the function should be constructed as follows:
        len(data)                              uint256     bytes  0  - 32
        data                                   bytes       bytes  32 - END
        @notice {contractAddress} is required to be whitelisted
        @notice If {_tokenContractAddressToTokenProperties[contractAddress].depositFunctionSignature} is set,
        {metaData} is expected to consist of needed function arguments.
        @return Returns the raw bytes returned from the call to {contractAddress}.
     */
    function deposit(bytes32 resourceID, address depositor, bytes calldata data) external onlyBridge returns (bytes memory) {
        uint256      lenMetadata;
        bytes memory metadata;

        lenMetadata = abi.decode(data, (uint256));
        metadata = bytes(data[32:32 + lenMetadata]);

        address contractAddress = _resourceIDToContractAddress[resourceID];
        uint16 depositorOffset = _tokenContractAddressToTokenProperties[contractAddress].depositFunctionDepositorOffset;
        if (depositorOffset > 0) {
            uint256 metadataDepositor;
            // Skipping 32 bytes of length prefix and depositorOffset bytes.
            assembly {
                metadataDepositor := mload(add(add(metadata, 32), depositorOffset))
            }
            // metadataDepositor contains 0xdepositorAddressdepositorAddressdeposite************************
            // Shift it 12 bytes right:   0x000000000000000000000000depositorAddressdepositorAddressdeposite
            require(depositor == address(uint160(metadataDepositor >> 96)), 'incorrect depositor in the data');
        }

        if (!_tokenContractAddressToTokenProperties[contractAddress].isWhitelisted) revert ContractAddressNotWhitelisted(contractAddress);

        bytes4 sig = _tokenContractAddressToTokenProperties[contractAddress].depositFunctionSignature;
        if (sig != bytes4(0)) {
            bytes memory callData = abi.encodePacked(sig, metadata);
            (bool success, bytes memory handlerResponse) = contractAddress.call(callData);
            require(success, "call to contractAddress failed");
            return handlerResponse;
        }
    }

    /**
        @notice Proposal execution should be initiated when a proposal is finalized in the Bridge contract.
        @param resourceID ResourceID to be used when making deposits.
        @param data Consists of {resourceID}, {lenMetaData}, and {metaData}.
        @notice Data passed into the function should be constructed as follows:
        len(data)                              uint256     bytes  0  - 32
        data                                   bytes       bytes  32 - END
        @notice {contractAddress} is required to be whitelisted
        @notice If {_tokenContractAddressToTokenProperties[contractAddress].executeFunctionSignature} is set,
        {metaData} is expected to consist of needed function arguments.
     */
    function executeProposal(bytes32 resourceID, bytes calldata data) external onlyBridge returns (bytes memory) {
        uint256      lenMetadata;
        bytes memory metaData;

        lenMetadata = abi.decode(data, (uint256));
        metaData = bytes(data[32:32 + lenMetadata]);

        address contractAddress = _resourceIDToContractAddress[resourceID];
        if (!_tokenContractAddressToTokenProperties[contractAddress].isWhitelisted) revert ContractAddressNotWhitelisted(contractAddress);

        bytes4 sig = _tokenContractAddressToTokenProperties[contractAddress].executeFunctionSignature;
        if (sig != bytes4(0)) {
            bytes memory callData = abi.encodePacked(sig, metaData);
            (bool success, bytes memory returndata) = contractAddress.call(callData);

            if (!success) {
                emit FailedHandlerExecution();
            }
            return abi.encode(success, returndata);
        }
    }

    function _setResource(
        bytes32 resourceID,
        address contractAddress,
        bytes4 depositFunctionSig,
        uint16 depositFunctionDepositorOffset,
        bytes4 executeFunctionSig
    ) internal {

        _resourceIDToContractAddress[resourceID] = contractAddress;
        _tokenContractAddressToTokenProperties[contractAddress].resourceID = resourceID;
        _tokenContractAddressToTokenProperties[contractAddress].depositFunctionSignature = depositFunctionSig;
        _tokenContractAddressToTokenProperties[contractAddress].depositFunctionDepositorOffset = depositFunctionDepositorOffset;
        _tokenContractAddressToTokenProperties[contractAddress].executeFunctionSignature = executeFunctionSig;

        _tokenContractAddressToTokenProperties[contractAddress].isWhitelisted = true;
    }
}
