// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./interfaces/IHandler.sol";
import "./interfaces/IDepositContract.sol";
import "./interfaces/IDepositAdapterTarget.sol";

/**
    @title Makes deposits to Goerli deposit contract.
    @author ChainSafe Systems.
    @notice This contract is intended to be used with the Bridge contract and PermissionlessGenericHandler.
 */
contract DepositAdapterTarget is AccessControl, IDepositAdapterTarget {
    address payable public immutable _depositContract;

    address public immutable _handlerAddress;
    mapping(address => bool) public originAdapters;

    event DepositAdapterOriginSet(
        address originAdapter,
        bool isAdapter
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
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "DepositTarget: sender doesn't have admin role");
        _;
    }

    modifier onlyHandler() {
        require(msg.sender == _handlerAddress, "DepositTarget: sender must be handler contract");
        _;
    }

    /**
        @param handlerAddress Contract address of previously deployed generic handler.
        @param depositContract Address of the DepositContract.
     */
    constructor(address handlerAddress, address payable depositContract) {
        _handlerAddress = handlerAddress;
        require(address(depositContract).code.length > 0, "DepositTarget: invalid deposit contract");
        _depositContract = depositContract;
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
        @notice Sets new address of the deposit adapter on the target chain (used for checks on source chain).
        @notice Only callable by admin.
        @param depositAdapterOrigin Value {_depositAdapterOrigin} will be updated to.
     */
    function setOriginAdapter(address depositAdapterOrigin, bool isAdapter) external onlyAdmin {
        originAdapters[depositAdapterOrigin] = isAdapter;
        emit DepositAdapterOriginSet(depositAdapterOrigin, isAdapter);
    }

    /**
        @notice Executes the deposit.
        @notice Only callable by handler.
        @param originDepositor The depositor from the origin chain.
        @param depositData Data for the deposit.
     */
    function execute(address originDepositor, bytes calldata depositData) external onlyHandler {
        require(originAdapters[originDepositor], "DepositTarget: invalid origin depositor");

        bytes memory withdrawal_credentials;
        (, withdrawal_credentials, ,) = abi.decode(depositData, (bytes, bytes, bytes, bytes32));
        require(withdrawal_credentials.length == 32,
            "DepositTarget: invalid withdrawal_credentials length");
        bytes32 credentials = bytes32(withdrawal_credentials);
        require(credentials == bytes32(abi.encodePacked(hex"010000000000000000000000", address(this))),
            "DepositTarget: wrong withdrawal_credentials address");

        (bool success, ) = _depositContract.call{value: 32 ether}(abi.encodePacked(
            IDepositContract(address(0)).deposit.selector,
            depositData)
        );
        require(success, "DepositTarget: deposit failed");
    }

    /**
        @notice Receives Eth.
     */
    receive() external payable {
    }

    /**
        @notice Transfers eth in the contract to the admin.
        @param amount Amount to transfer.
     */
    function withdraw(uint amount) external onlyAdmin {
        require(address(this).balance >= amount, "Not enough balance");
        (bool success,) = msg.sender.call{value: amount}("");
        require(success, "Withdrawal failed");
        emit Withdrawal(msg.sender, amount);
    }
}