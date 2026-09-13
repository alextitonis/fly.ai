// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IMarketRedeemCallback {
    function marketRedeemCallback(uint256 amountYes, uint256 amountNo, bytes calldata data) external;
}
