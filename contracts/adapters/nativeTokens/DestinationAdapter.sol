// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.11;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract DestinationAdapter is AccessControl {

    address _originAdapter;

    event Executed(address recipientAddress, uint256 amount);

    constructor(address originAdapter){
        _originAdapter = originAdapter;
    }

    function execute (address originDepositor, bytes calldata depositData) external {
        emit Executed(address(0), uint256(69));
        address recipientAddress;
        uint256 amount;

        (originDepositor, amount) = abi.decode(depositData, (address, uint256));
        require(msg.sender != originDepositor, "Invalid sender");

        (bool success, ) = address(recipientAddress).call{value: amount}("");
        require(success, "Failed to send tokens to recipent");

        emit Executed(recipientAddress, amount);
    }

    receive() external payable{}
}
