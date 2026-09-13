// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title wstSHIT
/// @notice Non-rebasing wrapper for stSHIT, based on Lido WstETH pattern (Apache-2.0)
/// @dev Fixed balance — compatible with collateral systems (Cooler, Morpho, DSS, Pendle).
///      Pattern: https://github.com/lidofinance/lido-dao/blob/master/contracts/0.6.12/WstETH.sol
contract WstSHIT is ERC20Permit {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error InsufficientAmount();

    IERC20 public immutable stSHIT;

    constructor(address _stShit) ERC20("Wrapped staked SHIT", "wstSHIT") ERC20Permit("Wrapped staked SHIT") {
        if (_stShit == address(0)) revert ZeroAddress();
        stSHIT = IERC20(_stShit);
    }

    /// @notice Wrap stSHIT into wstSHIT
    function wrap(uint256 _stShitAmount) external returns (uint256) {
        if (_stShitAmount == 0) revert InsufficientAmount();
        uint256 wstShitAmount = stShitToWstShit(_stShitAmount);
        _mint(msg.sender, wstShitAmount);
        stSHIT.safeTransferFrom(msg.sender, address(this), _stShitAmount);
        return wstShitAmount;
    }

    /// @notice Unwrap wstSHIT back to stSHIT
    function unwrap(uint256 _wstShitAmount) external returns (uint256) {
        if (_wstShitAmount == 0) revert InsufficientAmount();
        uint256 stShitAmount = wstShitToStShit(_wstShitAmount);
        _burn(msg.sender, _wstShitAmount);
        stSHIT.safeTransfer(msg.sender, stShitAmount);
        return stShitAmount;
    }

    /// @notice Get amount of wstSHIT for a given stSHIT amount
    function stShitToWstShit(uint256 _stShitAmount) public view returns (uint256) {
        if (totalSupply() == 0) return _stShitAmount;
        return (_stShitAmount * totalSupply()) / stSHIT.totalSupply();
    }

    /// @notice Get amount of stSHIT for a given wstSHIT amount
    function wstShitToStShit(uint256 _wstShitAmount) public view returns (uint256) {
        uint256 totalStShit = stSHIT.totalSupply();
        if (totalSupply() == 0) return _wstShitAmount;
        return (_wstShitAmount * totalStShit) / totalSupply();
    }

    /// @notice Get stSHIT per wstSHIT
    function stShitPerToken() external view returns (uint256) {
        if (totalSupply() == 0) return 1e18;
        return (stSHIT.totalSupply() * 1e18) / totalSupply();
    }
}
