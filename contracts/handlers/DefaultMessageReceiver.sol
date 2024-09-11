// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "../utils/AccessControl.sol";
import "../interfaces/ISygmaMessageReceiver.sol";

contract DefaultMessageReceiver is ISygmaMessageReceiver, AccessControl, ERC721Holder, ERC1155Holder {
    bytes32 public constant SYGMA_HANDLER_ROLE = keccak256("SYGMA_HANDLER_ROLE");

    address internal constant zeroAddress = address(0);

    uint256 public immutable _recoverGas;

    struct Action {
        uint256 nativeValue;
        address callTo;
        address approveTo;
        address tokenSend;
        address tokenReceive;
        bytes data;
    }

    error InsufficientGasLimit();
    error InvalidContract();
    error InsufficientPermission();
    error ActionFailed();
    error InsufficientNativeBalance();
    error ReturnNativeLeftOverFailed();
    
    event Executed(
        bytes32 transactionId,
        address tokenSend,
        address receiver,
        uint256 amount
    );

    event TransferRecovered(
        bytes32 transactionId,
        address tokenSend,
        address receiver,
        uint256 amount
    );

    /// Constructor ///

    /// @param sygmaHandlers The contract addresses with access to message processing.
    /// @param recoverGas The amount of gas needed to forward the original amount to receiver.
    constructor(address[] memory sygmaHandlers, uint256 recoverGas) {
        _recoverGas = recoverGas;
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        for (uint i = 0; i < sygmaHandlers.length; i++) {
            _setupRole(SYGMA_HANDLER_ROLE, sygmaHandlers[i]);
        }
    }

    /**
        @notice Users have to understand the design and limitations behind the Actions processing.
        The contract will try to return all the leftover tokens and native token to the
        receiver address. This logic is applied to the native token if there was a balance
        increase during the message processing, then to the tokenSent which is received from
        Sygma proposal and finally to every Action.tokenReceive. In the vast majority of
        cases that would be enough, though user can come up with a scenario where an Action
        produces results in a receival of more than one token, while only one could be
        specified in this particular Action.tokenReceive property. In such a case it is
        a users responsibility to either send it all with a transferBalanceAciton() Action or to
        include an extra action[s] with tokenReceive set to each of the tokens received.
     */
    function handleSygmaMessage(
        address tokenSent,
        uint256 amount,
        bytes memory message
    ) external payable override {
        if (!hasRole(SYGMA_HANDLER_ROLE, _msgSender())) revert InsufficientPermission();
        (
            bytes32 transactionId,
            Action[] memory actions,
            address receiver
        ) = abi.decode(message, (bytes32, Action[], address));

        _execute(transactionId, actions, tokenSent, payable(receiver), amount);
    }

    function _execute(
        bytes32 transactionId,
        Action[] memory actions,
        address tokenSent,
        address payable receiver,
        uint256 amount
    ) internal {
        uint256 cacheGasLeft = gasleft();
        if (cacheGasLeft < _recoverGas) revert InsufficientGasLimit();
        
        uint256 startingNativeBalance = address(this).balance - msg.value;
        /// We are wrapping the Actions processing in new call in order to be
        /// able to recover, ie. send funds to the receiver, in case of fail or
        /// running out of gas. Otherwise we can only revert whole execution
        /// which would result in the need to manually process proposal resolution
        /// to unstuck the assets.
        try this.performActions{gas: cacheGasLeft - _recoverGas}(
            tokenSent,
            receiver,
            startingNativeBalance,
            actions
        ) {
            emit Executed(
                transactionId,
                tokenSent,
                receiver,
                amount
            );
        } catch {
            cacheGasLeft = gasleft();
            if (cacheGasLeft < _recoverGas) revert InsufficientGasLimit();
            transferBalance(tokenSent, receiver);
            if (address(this).balance > startingNativeBalance) {
                transferNativeBalance(receiver);
            }

            emit TransferRecovered(
                transactionId,
                tokenSent,
                receiver,
                amount
            );
        }
    }

    /// @dev See the comment inside of the _execute() function.
    function performActions(
        address tokenSent,
        address payable receiver,
        uint256 startingNativeBalance,
        Action[] memory actions
    ) external {
        if (msg.sender != address(this)) revert InsufficientPermission();

        uint256 numActions = actions.length;
        for (uint256 i = 0; i < numActions; i++) {
            // Allow EOA if the data is empty. Could be used to send native currency.
            if (!isContract(actions[i].callTo) && actions[i].data.length > 0) revert InvalidContract();
            uint256 nativeValue = actions[i].nativeValue;
            if (nativeValue > 0 && address(this).balance < nativeValue) {
                revert InsufficientNativeBalance();
            }
            approveERC20(IERC20(actions[i].tokenSend), actions[i].approveTo, type(uint256).max);

            (bool success, ) = actions[i].callTo.call{value: nativeValue}(actions[i].data);
            if (!success) {
                revert ActionFailed();
            }
        }
        if (address(this).balance > startingNativeBalance) {
            transferNativeBalance(receiver);
        }
        transferBalance(tokenSent, receiver);
        returnLeftOvers(actions, receiver);
    }

    function returnLeftOvers(Action[] memory actions, address payable receiver) internal {
        for (uint256 i; i < actions.length; i++) {
            transferBalance(actions[i].tokenReceive, receiver);
            approveERC20(IERC20(actions[i].tokenSend), actions[i].approveTo, 0);
        }
    }

    function transferNativeBalance(address payable receiver) internal {
        (bool success, ) = receiver.call{value: address(this).balance}("");
        if (!success) {
            revert ReturnNativeLeftOverFailed();
        }
    }

    function transferBalance(address token, address receiver) internal {
        if (token != zeroAddress) {
            uint256 tokenBalance = IERC20(token).balanceOf(address(this));
            if (tokenBalance > 0) {
                SafeERC20.safeTransfer(IERC20(token), receiver, tokenBalance);
            }
        }
    }

    /// @notice Helper function that could be used as an Action to itself to transfer whole
    /// @notice balance of a particular token.
    function transferBalanceAciton(address token, address receiver) external {
        if (msg.sender != address(this)) revert InsufficientPermission();
        if (token != zeroAddress) {
            transferBalance(token, receiver);
        } else {
            transferNativeBalance(payable(receiver));
        }
    }

    function isContract(address contractAddr) internal view returns (bool) {
        uint256 size;
        assembly {
            size := extcodesize(contractAddr)
        }
        return size > 0;
    }

    function approveERC20(
        IERC20 token,
        address spender,
        uint256 amount
    ) internal {
        if (address(token) != zeroAddress && spender != zeroAddress) {
            // Ad-hoc SafeERC20.forceApprove() because OZ lib from dependencies does not have one yet.
            (bool success, ) = address(token).call(abi.encodeWithSelector(token.approve.selector, spender, 0));
            if (amount > 0) {
                (success, ) = address(token).call(abi.encodeWithSelector(token.approve.selector, spender, amount));
            }
        }
    }

    receive() external payable {}
}
