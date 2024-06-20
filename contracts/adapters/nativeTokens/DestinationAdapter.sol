// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.11;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract DestinationAdapter is AccessControl {
    event FundsTransferred(address recipient, uint256 amount);

    address _originAdapter;
    address _gmpAddress;

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

    /**
        This helper can be used to prepare execution data for Bridge.deposit() on the source chain
        if GmpHandler is used
        and if the target function accepts (address depositor, bytes executionData).
        The execution data (packed as bytes) will be packed together with depositorAddress
        in GmpHandler before execution on the target chain.
        This function packs the bytes parameter together with a fake address and removes the address.
        After repacking in the handler together with depositorAddress, the offsets will be correct.
        Usage: pack all parameters as bytes, then use this function, then pack the result of this function
        together with maxFee, executeFuncSignature etc and pass it to Bridge.deposit().
    */
    function prepareDepositData(bytes calldata executionData) view external returns (bytes memory) {
        bytes memory encoded = abi.encode(address(0), executionData);
        return this.slice(encoded, 32);
    }

    function slice(bytes calldata input, uint256 position) pure public returns (bytes memory) {
        return input[position:];
    }

    function transferFunds(address originAdapter, bytes calldata data) external {
        if(_originAdapter != originAdapter) revert InvalidOriginAdapter(originAdapter);
        if(msg.sender != _gmpAddress) revert InvalidHandler(msg.sender);

        uint256 amount;
        address recipient;

        (recipient, amount) = abi.decode(data, (address, uint256));
        (bool success, ) = address(recipient).call{value: amount}("");
        if(!success) revert FailedFundsTransfer();
        emit FundsTransferred(recipient, amount);
    }
    receive() external payable {}
}
