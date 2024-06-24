// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.11;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "../../interfaces/IBridge.sol";
import "../interfaces/IDepositAdapterTarget.sol";
import "../../interfaces/IBasicFeeHandler.sol";


contract OriginAdapter is AccessControl {
    IBridge public immutable _bridge;
    bytes32 public immutable _resourceID;
    IBasicFeeHandler public _feeHandler;

    event Withdrawal(address recipient, uint amount);

    error SenderNotAdmin();
    error InsufficientMsgValueAmount(uint256 amount);
    error MsgValueLowerThanFee(uint256 amount);
    error TokenWithdrawalFailed();
    error InsufficientBalance();

    modifier onlyAdmin() {
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert SenderNotAdmin();
        _;
    }

    constructor(IBridge bridge, IBasicFeeHandler feeHandler, bytes32 resourceID) {
        _bridge = bridge;
        _resourceID = resourceID;
        _feeHandler = feeHandler;
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function deposit(uint8 destinationDomainID, address executionContractAddress, address recipientAddress) external payable {
        if (msg.value <= 0) revert InsufficientMsgValueAmount(msg.value);
        uint256 fee = _feeHandler._domainResourceIDToFee(destinationDomainID, _resourceID);
        if (msg.value < fee) revert MsgValueLowerThanFee(msg.value);
        uint256 transferAmount = msg.value - fee;

        bytes memory depositData = abi.encodePacked(
            // uint256 maxFee
            uint256(950000),
            // uint16 len(executeFuncSignature)
            uint16(4),
            // bytes executeFuncSignature
            IDepositAdapterTarget(address(0)).transferFunds.selector,
            // uint8 len(executeContractAddress)
            uint8(20),
            // bytes executeContractAddress
            executionContractAddress,
            // uint8 len(executionDataDepositor)
            uint8(20),
            // bytes executionDataDepositor
            address(this),
            // bytes executionDataDepositor + executionData
            prepareDepositData(recipientAddress, transferAmount)
        );

        _bridge.deposit{value: fee}(destinationDomainID, _resourceID, depositData, "");
    }

    function changeFeeHandler(address newFeeHandler) external onlyAdmin {
        _feeHandler = IBasicFeeHandler(newFeeHandler);
    }

    function withdraw(uint amount) external onlyAdmin {
        if (address(this).balance <= amount) revert InsufficientBalance();
        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) revert TokenWithdrawalFailed();
        emit Withdrawal(msg.sender, amount);
    }

    function slice(bytes calldata input, uint256 position) public pure returns (bytes memory) {
        return input[position:];
    }

    function prepareDepositData(
        address recipientAddress,
        uint256 bridgingAmount
    ) public view returns (bytes memory) {
        bytes memory encoded = abi.encode(address(0), recipientAddress, bridgingAmount);
        return this.slice(encoded, 32);
    }
}
