// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

// Import standard ERC20 from OpenZeppelin
import {ERC20} from "@openzeppelin/token/ERC20/ERC20.sol";

contract MockUSD is ERC20 {
    // 1. Set the name and symbol in the constructor
    constructor() ERC20("Mock USD", "mUSD") {}

    // 2. The "Faucet" Function
    // This is NOT safe for production (anyone can mint), but essential for testing.
    // It allows you to give users tokens in your Foundry setup.
    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}