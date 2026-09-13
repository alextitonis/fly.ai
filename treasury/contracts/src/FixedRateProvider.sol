// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

interface IRateProviderLike {
    function getConversionRate() external view returns (uint256);
}

contract FixedRateProvider is IRateProviderLike {
    function getConversionRate() external pure returns (uint256) {
        return 1e27;
    }
}
