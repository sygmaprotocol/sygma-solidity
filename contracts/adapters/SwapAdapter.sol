// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../../contracts/interfaces/IBridge.sol";
import "../../contracts/interfaces/IFeeHandler.sol";
import "../../contracts/adapters/interfaces/INativeTokenAdapter.sol";
import "../../contracts/adapters/interfaces/IWETH.sol";
import "../../contracts/adapters/interfaces/IV3SwapRouter.sol";

/**
    @title Contract that swaps tokens to ETH or ETH to tokens using Uniswap
        and then makes a deposit to the Bridge.
    @author ChainSafe Systems.
 */
contract SwapAdapter is AccessControl {

    using SafeERC20 for IERC20;

    IBridge public immutable _bridge;
    address immutable _weth;
    IV3SwapRouter public _swapRouter;
    INativeTokenAdapter _nativeTokenAdapter;

    mapping(address => bytes32) public tokenToResourceID;

    error CallerNotAdmin();
    error AlreadySet();
    error TokenInvalid();
    error PathInvalid();
    error MsgValueLowerThanFee(uint256 value);
    error InsufficientAmount(uint256 amount);
    error FailedFundsTransfer();
    error AmountLowerThanFee(uint256 amount);

    event TokenResourceIDSet(address token, bytes32 resourceID);
    event TokensSwapped(address token, uint256 amountOut);

    constructor(
        IBridge bridge,
        address weth,
        IV3SwapRouter swapRouter,
        INativeTokenAdapter nativeTokenAdapter
    ) {
        _bridge = bridge;
        _weth = weth;
        _swapRouter = swapRouter;
        _nativeTokenAdapter = nativeTokenAdapter;
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    modifier onlyAdmin() {
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert CallerNotAdmin();
        _;
    }

    // Admin functions
    function setTokenResourceID(address token, bytes32 resourceID) external onlyAdmin {
        if (tokenToResourceID[token] == resourceID) revert AlreadySet();
        tokenToResourceID[token] = resourceID;
        emit TokenResourceIDSet(token, resourceID);
    }

    /**
        @notice Function for depositing tokens, performing swap to ETH and bridging the ETH.
        @param destinationDomainID  ID of chain deposit will be bridged to.
        @param recipient Recipient of the deposit.
        @param  token Input token to be swapped.
        @param  tokenAmount Amount of tokens to be swapped.
        @param amountOutMinimum Minimal amount of ETH to be accepted as a swap output.
        @param pathTokens Addresses of the tokens for Uniswap swap. WETH address is used for ETH.
        @param pathFees Fees for Uniswap pools.
    */
    function depositTokensToEth(
        uint8 destinationDomainID,
        address recipient,
        address token,
        uint256 tokenAmount,
        uint256 amountOutMinimum,
        address[] memory pathTokens,
        uint24[] memory pathFees
    ) external {
        if (tokenToResourceID[token] == bytes32(0)) revert TokenInvalid();

        // Swap all tokens to ETH (exact input)
        IERC20(token).safeTransferFrom(msg.sender, address(this), tokenAmount);
        IERC20(token).safeApprove(address(_swapRouter), tokenAmount);

        uint256 amount;

        {
            bytes memory path = _verifyAndEncodePath(
                pathTokens,
                pathFees,
                token,
                _weth
            );
            IV3SwapRouter.ExactInputParams memory params = IV3SwapRouter.ExactInputParams({
                path: path,
                recipient: address(this),
                amountIn: tokenAmount,
                amountOutMinimum: amountOutMinimum
            });

            amount = _swapRouter.exactInput(params);
        }

        if (amount == 0) revert InsufficientAmount(amount);

        emit TokensSwapped(_weth, amount);
        IWETH(_weth).withdraw(amount);

        // Make Native Token deposit
        _nativeTokenAdapter.depositToEVM{value: amount}(destinationDomainID, recipient);

        // Return unspent fee to msg.sender
        uint256 leftover = address(this).balance;
        if (leftover > 0) {
            payable(msg.sender).call{value: leftover}("");
            // Do not revert if sender does not want to receive.
        }
    }

    /**
        @notice Function for depositing tokens, performing swap to ETH and bridging the ETH.
        @param destinationDomainID  ID of chain deposit will be bridged to.
        @param recipient Recipient of the deposit.
        @param  token Output token to be deposited after swapping.
        @param amountOutMinimum Minimal amount of tokens to be accepted as a swap output.
        @param pathTokens Addresses of the tokens for Uniswap swap. WETH address is used for ETH.
        @param pathFees Fees for Uniswap pools.
    */
   function depositEthToTokens(
        uint8 destinationDomainID,
        address recipient,
        address token,
        uint256 amountOutMinimum,
        address[] memory pathTokens,
        uint24[] memory pathFees
    ) external payable {
        bytes32 resourceID = tokenToResourceID[token];
        if (resourceID == bytes32(0)) revert TokenInvalid();

        // Compose depositData
        bytes memory depositDataAfterAmount = abi.encodePacked(
            uint256(20),
            recipient
        );
        if (msg.value == 0) revert InsufficientAmount(msg.value);
        uint256 fee;
        {
            address feeHandlerRouter = _bridge._feeHandler();
            (fee, ) = IFeeHandler(feeHandlerRouter).calculateFee(
                address(this),
                _bridge._domainID(),
                destinationDomainID,
                resourceID,
                abi.encodePacked(msg.value, depositDataAfterAmount),
                ""  // feeData - not parsed
            );
        }

        if (msg.value < fee) revert MsgValueLowerThanFee(msg.value);
        uint256 amountOut;
        {
            uint256 swapAmount = msg.value - fee;
            // Convert everything except the fee

            // Swap ETH to tokens (exact input)
            bytes memory path = _verifyAndEncodePath(
                pathTokens,
                pathFees,
                _weth,
                token 
            );
            IV3SwapRouter.ExactInputParams memory params = IV3SwapRouter.ExactInputParams({
                path: path,
                recipient: address(this),
                amountIn: swapAmount,
                amountOutMinimum: amountOutMinimum
            });

            amountOut = _swapRouter.exactInput{value: swapAmount}(params);
            emit TokensSwapped(token, amountOut);
        }

        bytes memory depositData = abi.encodePacked(
            amountOut,
            depositDataAfterAmount
        );

        address ERC20HandlerAddress = _bridge._resourceIDToHandlerAddress(resourceID);
        IERC20(token).safeApprove(address(ERC20HandlerAddress), amountOut);
        _bridge.deposit{value: fee}(destinationDomainID, resourceID, depositData, "");

        // Return unspent fee to msg.sender
        uint256 leftover = address(this).balance;
        if (leftover > 0) {
            payable(msg.sender).call{value: leftover}("");
            // Do not revert if sender does not want to receive.
        }
    }

    function _verifyAndEncodePath(
        address[] memory tokens,
        uint24[] memory fees,
        address tokenIn,
        address tokenOut
    ) internal view returns (bytes memory path) {
        if (tokens.length != fees.length + 1) {
            revert PathInvalid();
        }

        tokenIn = tokenIn == address(0) ? address(_weth) : tokenIn;
        if (tokens[0] != tokenIn) revert PathInvalid();

        tokenOut = tokenOut == address(0) ? address(_weth) : tokenOut;
        if (tokens[tokens.length - 1] != tokenOut) revert PathInvalid();

        for (uint256 i = 0; i < tokens.length - 1; i++){
            path = abi.encodePacked(path, tokens[i], fees[i]);
        }
        path = abi.encodePacked(path, tokens[tokens.length - 1]);
    }

    receive() external payable {}
}
