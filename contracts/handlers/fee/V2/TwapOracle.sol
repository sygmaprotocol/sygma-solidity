// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;

import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol';
import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import "../../../utils/TickMath.sol";
import "../../../utils/FullMath.sol";
import "../../../utils/PoolAddress.sol";
import "../../../utils/AccessControl.sol";

contract TwapOracle is AccessControl {
    IUniswapV3Factory public immutable UNISWAP_V3_FACTORY;
    address public immutable WETH;
    uint24[] internal _knownFeeTiers;

    uint32 internal _timeWindow;

    event TimeWindowUpdated(uint32 timeWindow);

    error PairNotSupported();

    modifier onlyAdmin() {
        _onlyAdmin();
        _;
    }

    function _onlyAdmin() private view {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "sender doesn't have admin role");
    }

    constructor(IUniswapV3Factory _uniswapFactory, address _weth, uint32 timeWindow) {
        UNISWAP_V3_FACTORY = _uniswapFactory;
        WETH = _weth;
        _timeWindow = timeWindow;
        _knownFeeTiers.push(500);
        _knownFeeTiers.push(3000);
        _knownFeeTiers.push(10000);
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function isPairSupported(address tokenA, address tokenB) public view returns (bool) {
        uint256 length = _knownFeeTiers.length;
        for (uint256 i; i < length; i++) {
            address _pool = PoolAddress.computeAddress(address(UNISWAP_V3_FACTORY), PoolAddress.getPoolKey(tokenA, tokenB, _knownFeeTiers[i]));
            if (Address.isContract(_pool)) {
                return true;
            } 
        }
        return false;
    }

    function getPrice(address quoteToken) external view returns (uint256 quotePrice) {
        if (!isPairSupported(WETH, quoteToken)) revert PairNotSupported();
        address _pool = PoolAddress.computeAddress(address(UNISWAP_V3_FACTORY), PoolAddress.getPoolKey(WETH, quoteToken, 500));

        uint32 secondsAgo = _timeWindow;
        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = secondsAgo;
        secondsAgos[1] = 0;

        (int56[] memory tickCumulatives, ) = IUniswapV3Pool(_pool).observe(secondsAgos);
        int56 tickCumulativesDelta = tickCumulatives[1] - tickCumulatives[0];
        int24 arithmeticMeanTick = int24(tickCumulativesDelta / int56(uint56(secondsAgo)));
        // Always round to negative infinity
        if (tickCumulativesDelta < 0 && (tickCumulativesDelta % int56(uint56(secondsAgo)) != 0)) arithmeticMeanTick--;
        
        uint160 sqrtRatioX96 = TickMath.getSqrtRatioAtTick(arithmeticMeanTick);

        // Calculate quoteAmount with better precision if it doesn't overflow when multiplied by itself
        if (sqrtRatioX96 <= type(uint128).max) {
            uint256 ratioX192 = uint256(sqrtRatioX96) * sqrtRatioX96;
            quotePrice = quoteToken < WETH
                ? FullMath.mulDiv(ratioX192, 1e18, 1 << 192)
                : FullMath.mulDiv(1 << 192, 1e18, ratioX192);
        } else {
            uint256 ratioX128 = FullMath.mulDiv(sqrtRatioX96, sqrtRatioX96, 1 << 64);
            quotePrice = quoteToken < WETH
                ? FullMath.mulDiv(ratioX128, 1e18, 1 << 128)
                : FullMath.mulDiv(1 << 128, 1e18, ratioX128);
        }
        return quotePrice;
    }

    function updateTimeWindow(uint32 timeWindow) external onlyAdmin {
        _timeWindow = timeWindow;
        emit TimeWindowUpdated(timeWindow);
    }
}
