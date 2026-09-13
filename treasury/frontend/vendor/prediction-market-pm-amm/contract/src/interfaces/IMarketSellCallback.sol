// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IMarketSellCallback {
    function marketSellCallback(uint256 tokenIn, bytes calldata data) external;
}
