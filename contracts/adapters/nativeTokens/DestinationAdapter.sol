// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.11;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract DestinationAdapter is AccessControl {
    event FundsTransferred(address recipient, uint256 amount);

    address _originAdapter;
    address immutable _gmpAddress;

    error Unauthorized();
    error InvalidHandler(address handler);
    error InvalidOriginAdapter(address adapter);
    error FailedFundsTransfer();

    modifier onlyAdmin() {
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert Unauthorized();
        _;
    }

    constructor(address newGmpAddress) {
        _gmpAddress = newGmpAddress;
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function setOriginAdapter(address newOriginAdapter) public onlyAdmin() {
        _originAdapter = newOriginAdapter;
    }

    function transferFunds(address originAdapter, address payable recipient, uint256 amount) external {
        if(_originAdapter != originAdapter) revert InvalidOriginAdapter(originAdapter);
        if(msg.sender != _gmpAddress) revert InvalidHandler(msg.sender);

        (bool success, ) = address(recipient).call{value: amount}("");
        if(!success) revert FailedFundsTransfer();
        emit FundsTransferred(recipient, amount);
    }
    receive() external payable {}
}
