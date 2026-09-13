// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {TwapLibrary} from "./TwapLibrary.sol";
import {ITokenPriceFeed} from "./ITokenPriceFeed.sol";

/// @title ImpactOracleAdapter
/// @notice TWAP-based price oracle for impact token collateral valuation
/// @dev Uses Uniswap V3 pool TWAP via TwapLibrary (MIT) — no Chainlink, no paid oracles.
///      Each token gets its own Uni V3 pool, with configurable TWAP period.
///      Prices are normalized to 1e18 decimals.

contract ImpactOracleAdapter is AccessControl, ITokenPriceFeed {
    error ZeroAddress();
    error InsufficientObservations();
    error TokenNotConfigured();

    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");

    uint32 public constant DEFAULT_TWAP_PERIOD = 1800; // 30 minutes
    uint32 public constant MAX_TWAP_PERIOD = 3600; // 1 hour
    uint32 public constant MIN_TWAP_PERIOD = 300; // 5 minutes

    struct TokenConfig {
        address pool; // Uniswap V3 pool for this token
        bool tokenIsToken1; // if true, token is token1 in the pool
        uint32 twapPeriod;
        bool active;
    }

    mapping(address => TokenConfig) public tokenConfigs;

    event TokenAdded(address indexed token, address indexed pool, bool indexed tokenIsToken1, uint32 twapPeriod);
    event TokenRemoved(address indexed token);


    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MANAGER_ROLE, admin);
    }

    function addToken(address token, address pool, bool tokenIsToken1) external onlyRole(MANAGER_ROLE) {
        _addToken(token, pool, tokenIsToken1, DEFAULT_TWAP_PERIOD);
    }

    function addTokenWithTwapPeriod(
        address token,
        address pool,
        bool tokenIsToken1,
        uint32 _twapPeriod
    ) external onlyRole(MANAGER_ROLE) {
        if (_twapPeriod < MIN_TWAP_PERIOD || _twapPeriod > MAX_TWAP_PERIOD) {
            revert TokenNotConfigured();
        }
        _addToken(token, pool, tokenIsToken1, _twapPeriod);
    }

    function _addToken(address token, address pool, bool tokenIsToken1, uint32 _twapPeriod) internal {
        if (token == address(0) || pool == address(0)) revert ZeroAddress();
        tokenConfigs[token] = TokenConfig(pool, tokenIsToken1, _twapPeriod, true);
        emit TokenAdded(token, pool, tokenIsToken1, _twapPeriod);
    }

    function removeToken(address token) external onlyRole(MANAGER_ROLE) {
        tokenConfigs[token].active = false;
        emit TokenRemoved(token);
    }

    function getTokenPrice(address token) external view returns (uint256 price) {
        TokenConfig memory config = tokenConfigs[token];
        if (!config.active) revert TokenNotConfigured();

        price = TwapLibrary.getTwapPrice(config.pool, config.twapPeriod, config.tokenIsToken1);
    }

    function isTokenActive(address token) external view returns (bool) {
        return tokenConfigs[token].active;
    }
}
