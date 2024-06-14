// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.11;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "../../interfaces/IBridge.sol";
import "../interfaces/IDepositAdapterTarget.sol";

contract OriginAdapter is AccessControl {
    IBridge public immutable _bridge;
    bytes32 public immutable _resourceID;

    event Withdrawal(address recipient, uint amount);

    modifier onlyAdmin() {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "OriginAdapter: sender does not have admin role");
        _;
    }

    constructor(IBridge bridge, bytes32 resourceID) {
        _bridge = bridge;
        _resourceID = resourceID;
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function deposit(uint8 destinationDomainID, uint256 fee, address executionContractAddress, address recipientAddress) external payable {
        // require(msg.value > 0, "OriginAdapter: insufficent msg.value amount");
        // require(msg.value >= fee, "OriginAdapter: bridging fee exceeded");
        uint bridgingAmount = msg.value - fee;
        bytes memory depositData = abi.encodePacked(
            // uint256 maxFee
            uint256(950000),
            // uint16 len(executeFuncSignature)
            uint16(4),
            // bytes executeFuncSignature
            IDepositAdapterTarget(address(0)).execute.selector,
            // uint8 len(executeContractAddress)
            uint8(20),
            // bytes executeContractAddress
            executionContractAddress,
            // uint8 len(executionDataDepositor)
            uint8(20),
            // bytes executionDataDepositor
            address(this),
            // bytes executionDataDepositor + executionData
            prepareDepositData(bridgingAmount)
        );

        _bridge.deposit{value: fee}(destinationDomainID, _resourceID, depositData, "");
    }

    function withdraw(uint amount) external onlyAdmin {
        require(address(this).balance >= amount, "Insufficient token balance");
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Failed to withdraw tokens");
        emit Withdrawal(msg.sender, amount);
    }

    function slice(bytes calldata input, uint256 position) public pure returns (bytes memory) {
        return input[position:];
    }

    function prepareDepositData(
        uint256 bridgingAmount
    ) public view returns (bytes memory) {
        bytes memory encoded = abi.encode(address(0), bridgingAmount);
        return this.slice(encoded, 32);
    }
}
