// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IMarketBondCallback {
    function marketBondCallback(uint256 bond, bytes calldata data) external;
}
