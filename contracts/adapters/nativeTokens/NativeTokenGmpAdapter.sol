// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.11;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "../../interfaces/IBridge.sol";
import "../../interfaces/IFeeHandler.sol";
import "../interfaces/INativeTokenGmpAdapter.sol";


contract NativeTokenGmpAdapter is INativeTokenGmpAdapter, AccessControl {
    IBridge public immutable _bridge;
    bytes32 public immutable _resourceID;
    address immutable _gmpAddress;


    event Withdrawal(address recipient, uint amount);
    event FundsTransferred(address recipient, uint256 amount);

    error SenderNotAdmin();
    error InsufficientMsgValueAmount(uint256 amount);
    error MsgValueLowerThanFee(uint256 amount);
    error TokenWithdrawalFailed();
    error InsufficientBalance();
    error InvalidHandler(address handler);
    error InvalidOriginAdapter(address adapter);
    error FailedFundsTransfer();

    modifier onlyAdmin() {
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert SenderNotAdmin();
        _;
    }

    /**
        @notice This contract requires for transfer that the origin adapter address is the same across all networks.
        Because of that it should be deployed using multichain deployer or create2.
     */
    constructor(IBridge bridge, address newGmpAddress, bytes32 resourceID) {
        _bridge = bridge;
        _resourceID = resourceID;
        _gmpAddress = newGmpAddress;
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function deposit(uint8 destinationDomainID, address recipientAddress) external payable {
        if (msg.value <= 0) revert InsufficientMsgValueAmount(msg.value);
        address feeHandlerRouter = _bridge._feeHandler();
        (uint256 fee, ) = IFeeHandler(feeHandlerRouter).calculateFee(
            address(this),
            _bridge._domainID(),
            destinationDomainID,
            _resourceID,
            "", // depositData - not parsed
            ""  // feeData - not parsed
        );
        if (msg.value < fee) revert MsgValueLowerThanFee(msg.value);
        uint256 transferAmount = msg.value - fee;

        bytes memory depositData = abi.encodePacked(
            // uint256 maxFee
            uint256(950000),
            // uint16 len(executeFuncSignature)
            uint16(4),
            // bytes executeFuncSignature
            INativeTokenGmpAdapter(address(0)).transferFunds.selector,
            // uint8 len(executeContractAddress)
            uint8(20),
            // bytes executeContractAddress
            address(this),
            // uint8 len(executionDataDepositor)
            uint8(20),
            // bytes executionDataDepositor
            address(this),
            // bytes executionDataDepositor + executionData
            prepareDepositData(recipientAddress, transferAmount)
        );

        _bridge.deposit{value: fee}(destinationDomainID, _resourceID, depositData, "");
    }

    function withdraw(uint amount) external onlyAdmin {
        if (address(this).balance <= amount) revert InsufficientBalance();
        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) revert TokenWithdrawalFailed();
        emit Withdrawal(msg.sender, amount);
    }

    function transferFunds(address nativeTokenGmpAdapter, address payable recipient, uint256 amount) external {
        if (nativeTokenGmpAdapter != address(this)) revert InvalidOriginAdapter(nativeTokenGmpAdapter);
        if (msg.sender != _gmpAddress) revert InvalidHandler(msg.sender);

        (bool success, ) = recipient.call{value: amount}("");
        if (!success) revert FailedFundsTransfer();
        emit FundsTransferred(recipient, amount);
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

    receive() external payable {}
}
