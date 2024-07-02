// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.11;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "../../interfaces/IBridge.sol";
import "../../interfaces/IBasicFeeHandler.sol";


contract NativeTokenAdapter is AccessControl {
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

    constructor(address bridge, IBasicFeeHandler feeHandler, bytes32 resourceID) {
        _bridge = IBridge(bridge);
        _resourceID = resourceID;
        _feeHandler = feeHandler;
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function deposit(uint8 destinationDomainID, string calldata recipientAddress) external payable {
        if (msg.value <= 0) revert InsufficientMsgValueAmount(msg.value);
        uint256 fee = _feeHandler._domainResourceIDToFee(destinationDomainID, _resourceID);
        if (msg.value < fee) revert MsgValueLowerThanFee(msg.value);
        uint256 transferAmount = msg.value - fee;

        bytes memory depositData = abi.encode(
            transferAmount,
            bytes(recipientAddress).length,
            recipientAddress
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

    receive() external payable {}
}
