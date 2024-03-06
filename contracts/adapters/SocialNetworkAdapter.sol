// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;

import "../interfaces/IBridge.sol";
import "../interfaces/IERCHandler.sol";
import "../interfaces/ISocialNetworkController.sol";
import "../interfaces/ISocialNetworkBitcoin.sol";
import "../interfaces/ISocialNetworkPercentageFeeHandler.sol";
import "../handlers/fee/SocialNetworkPercentageFeeHandler.sol";


contract SocialNetworkAdapter {

    address public immutable _permissionlessHandler;
    ISocialNetworkController public immutable _socialNetworkController;
    ISocialNetworkPercentageFeeHandler public immutable _feeHandler;

    mapping(string => mapping(address => uint256)) public _btcToEthDepositorToStakedAmount;


    function _onlyPermissionlessHandler() private view {
        require(msg.sender == _permissionlessHandler, "sender must be bridge contract");
    }

    modifier onlyPermissionlessHandler() {
        _onlyPermissionlessHandler();
        _;
    }

    constructor (
        address permissionlessHandler,
        ISocialNetworkPercentageFeeHandler feeHandler,
        ISocialNetworkController socialNetworkController
    ) {
        _permissionlessHandler = permissionlessHandler;
        _socialNetworkController = socialNetworkController;
        _feeHandler = feeHandler;
    }

    event TestExecute(address depositor, uint256 depositAmount, string btcDepositorAddress);

    function stakeBTC (address ethDepositorAddress, bytes calldata data) external onlyPermissionlessHandler {
        (uint256 amount, string memory btcDepositorAddress) = abi.decode(data, (uint256, string));

        (uint256 fee) = _feeHandler.calculateFee(amount);
        uint256 stakedAmount = amount - fee;

        _btcToEthDepositorToStakedAmount[btcDepositorAddress][ethDepositorAddress] = stakedAmount;
        _socialNetworkController.stakeBTC(amount, ethDepositorAddress);
    }
}
