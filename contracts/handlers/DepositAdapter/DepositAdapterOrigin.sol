// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./interfaces/IBridge.sol";
import "./interfaces/IDepositContract.sol";
import "./interfaces/IDepositAdapterTarget.sol";

/**
    @title Receives messages for making deposits to Goerli deposit contract.
    @author ChainSafe Systems.
    @notice This contract is intended to be used with the Bridge contract and Permissionless Generic handler.
 */
contract DepositAdapterOrigin is AccessControl {
    IBridge public immutable _bridgeAddress;
    bytes32 public immutable _resourceID;
    address public _targetDepositAdapter;
    uint256 public _depositFee;

    event FeeChanged(
        uint256 newFee
    );

    event DepositAdapterTargetChanged(
        address newDepositAdapter
    );

    /**
        @notice This event is emitted during withdrawal.
        @param recipient Address that receives the money.
        @param amount Amount that is distributed.
     */
    event Withdrawal(
        address recipient,
        uint256 amount
    );

    modifier onlyAdmin() {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "DepositOrigin: sender doesn't have admin role");
        _;
    }

    /**
        @param bridgeAddress Contract address of previously deployed Bridge.
        @param resourceID ResourceID in the Bridge used to find address of handler to be used for deposit.
     */
    constructor(IBridge bridgeAddress, bytes32 resourceID) {
        _bridgeAddress = bridgeAddress;
        _resourceID = resourceID;
        _depositFee = 3.2 ether;
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
        @notice Sets new value of the fee.
        @notice Only callable by admin.
        @param newFee Value {_depositFee} will be updated to.
     */
    function changeFee(uint256 newFee) external onlyAdmin {
        require(_depositFee != newFee, "DepositOrigin: current fee is equal to new fee");
        _depositFee = newFee;
        emit FeeChanged(newFee);
    }

    /**
        @notice Sets new address of the deposit adapter on the target chain (used for checks on source chain).
        @notice Only callable by admin.
        @param targetDepositAdapter Value {_targetDepositAdapter} will be updated to.
     */
    function changeTargetAdapter(address targetDepositAdapter) external onlyAdmin {
        require(_targetDepositAdapter != targetDepositAdapter, "DepositOrigin: new deposit adapter address is equal to old");
        _targetDepositAdapter = targetDepositAdapter;
        emit DepositAdapterTargetChanged(targetDepositAdapter);
    }

    /**
        @notice Deposits to the Bridge contract using the PermissionlessGenericHandler.
        @notice Called by the user on the origin chain.
        @notice Value supplied must be _depositFee + Bridge Fee.
        @param destinationDomainID ID of chain deposit will be bridged to.
        @param depositContractCalldata Additional data to be passed to the PermissionlessGenericHandler.
        @param feeData Additional data to be passed to the fee handler.
     */
    function deposit(
        uint8 destinationDomainID,
        bytes calldata depositContractCalldata,
        bytes calldata feeData
    ) external payable {
        // Collect fee
        require(msg.value >= _depositFee, "DepositOrigin: incorrect fee supplied");
        // Check input data
        bytes memory withdrawal_credentials;
        (, withdrawal_credentials, ,) = abi.decode(depositContractCalldata, (bytes, bytes, bytes, bytes32));
        require(withdrawal_credentials.length == 32,
            "DepositOrigin: invalid withdrawal_credentials length");
        bytes32 credentials = bytes32(withdrawal_credentials);
        address depositAdapter = _targetDepositAdapter;
        require(credentials == bytes32(abi.encodePacked(hex"010000000000000000000000", depositAdapter)),
            "DepositOrigin: wrong withdrawal_credentials address");
        bytes memory depositData = abi.encodePacked(
            uint256(0),             // uint256 maxFee
            uint16(4),              // uint16 len(executeFuncSignature)
            IDepositAdapterTarget(address(0)).execute.selector, // bytes executeFuncSignature
            uint8(20),              // uint8 len(executeContractAddress)
            _targetDepositAdapter,  // bytes executeContractAddress
            uint8(20),
            address(this),
            depositContractCalldata
        );
        IBridge(_bridgeAddress).deposit{value: msg.value - _depositFee}(destinationDomainID, _resourceID, depositData, feeData);
    }

    /**
        @notice Transfers eth in the contract to the receiver.
        @param recipient Address to receive eth.
        @param amount Amount to transfer.
     */
    function withdraw(address payable recipient, uint amount) external onlyAdmin {
        require(address(this).balance >= amount, "DepositOrigin: not enough balance");
        (bool success,) = recipient.call{value: amount}("");
        require(success, "DepositOrigin: withdrawal failed");
        emit Withdrawal(recipient, amount);
    }
}