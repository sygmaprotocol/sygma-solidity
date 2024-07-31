// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;

import "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";
import "../../contracts/interfaces/IBridge.sol";
import "../../contracts/interfaces/IFeeHandler.sol";
import "../XERC20/interfaces/IXERC20.sol";

contract GmpTransferAdapter {
    using ERC165Checker for address;

    IBridge public immutable _bridge;
    bytes32 public immutable _resourceID;
    address immutable _gmpAddress;

    error InsufficientMsgValueAmount(uint256 amount);
    error InvalidHandler(address handler);
    error InvalidOriginAdapter(address adapter);

    error FailedRefund();

    /**
        @notice This contract requires for transfer that the origin adapter address is the same across all networks.
        Because of that it should be deployed using multichain deployer or create2.
     */
    constructor(IBridge bridge, address newGmpAddress, bytes32 resourceID) {
        _bridge = bridge;
        _gmpAddress = newGmpAddress;
        _resourceID = resourceID;
    }

    function deposit(uint8 destinationDomainID, address recipientAddress, address XERC20Address, uint256 tokenAmount) external payable {
        address feeHandlerRouter = _bridge._feeHandler();
        (uint256 fee, ) = IFeeHandler(feeHandlerRouter).calculateFee(
            address(this),
            _bridge._domainID(),
            destinationDomainID,
            _resourceID,
            "", // depositData - not parsed
            ""  // feeData - not parsed
        );

        if (msg.value < fee) {
            revert InsufficientMsgValueAmount(msg.value);
        // refund excess msg.value
        } else if (msg.value > fee) {
            (bool success, ) = msg.sender.call{value: msg.value - fee}("");
            if (!success) revert FailedRefund();
        }

        bytes memory depositData = abi.encodePacked(
            // uint256 maxFee
            uint256(950000),
            // uint16 len(executeFuncSignature)
            uint16(4),
            // bytes executeFuncSignature
            IXERC20(address(0)).mint.selector,
            // uint8 len(executeContractAddress)
            uint8(20),
            // bytes executeContractAddress
            XERC20Address,
            // uint8 len(executionDataDepositor)
            uint8(20),
            // bytes executionDataDepositor
            address(this),
            // bytes executionDataDepositor + executionData
            prepareDepositData(recipientAddress, XERC20Address, tokenAmount)
        );

        IXERC20(XERC20Address).burn(msg.sender, tokenAmount);

        _bridge.deposit{value: fee}(destinationDomainID, _resourceID, depositData, "");
    }

    function executeProposal(address gmpAdapter, address recipient, address XERC20Address, uint256 amount) external {
        if (gmpAdapter != address(this)) revert InvalidOriginAdapter(gmpAdapter);
        if (msg.sender != _gmpAddress) revert InvalidHandler(msg.sender);

        IXERC20(XERC20Address).mint(recipient, amount);
    }

    function slice(bytes calldata input, uint256 position) public pure returns (bytes memory) {
        return input[position:];
    }

    function prepareDepositData(
        address recipientAddress,
        address XERC20Address,
        uint256 bridgingAmount
    ) public view returns (bytes memory) {
        bytes memory encoded = abi.encode(address(0), recipientAddress, XERC20Address, bridgingAmount);
        return this.slice(encoded, 32);
    }

    receive() external payable {}
}
