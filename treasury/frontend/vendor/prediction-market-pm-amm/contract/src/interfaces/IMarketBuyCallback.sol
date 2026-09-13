// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IMarketBuyCallback {
    function marketBuyCallback(uint256 collateralIn, bytes calldata data) external;
}
