// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.19;

import {FixedPointMathLib} from "lib/solady/src/utils/FixedPointMathLib.sol";
import {Gaussian} from "./Gaussian.sol";

library Math {
    using FixedPointMathLib for uint256;
    using FixedPointMathLib for int256;

    /**
     * @dev calculates the price of token
     */
    function calcPrice(uint256 x, uint256 y, uint256 l) public pure returns(uint256){
        // price = cdf((x-y) / L)

        int256 delta = int256(y) - int256(x);
        int256 z = delta.sDivWad(int256(l));

        int256 price = Gaussian.cdf(z);
        return uint256(price);
    }

    function calcInitialLiquidity(uint256 amount) public pure returns(uint256) {
        // amount/ pdf(0) = L
        return FixedPointMathLib.divWad(
            amount, uint256(Gaussian.pdf(0))
        );
    }

    function calcLiquidity(uint256 liquidity, uint256 deadline, uint256 currentTime) public pure returns(uint256) {
        // liquidity = L * (T - t)^0.5
        uint256 deltaTime = deadline - currentTime;
        uint256 sqrtDeltaTimeWad = FixedPointMathLib.sqrt(deltaTime) * 1e9;
        return FixedPointMathLib.mulWad(liquidity, sqrtDeltaTimeWad);
    }
}