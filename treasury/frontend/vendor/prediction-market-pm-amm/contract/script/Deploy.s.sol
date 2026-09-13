// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {Router} from "src/Router.sol";
import {MockUSD} from "src/MockUSD.sol";

contract Deploy is Script {
    uint256 constant INITIAL_LIQUIDITY = 10000 ether; // 10,000 mUSD
    uint256 constant SAMPLE_MARKET_DURATION = 7 days;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deploying from:", deployer);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // 1. Deploy MockUSD
        MockUSD mUSD = new MockUSD();
        console.log("MockUSD deployed at:", address(mUSD));
        
        // 2. Deploy Router
        Router router = new Router(address(mUSD));
        console.log("Router deployed at:", address(router));
        
        // 3. Mint tokens to deployer for sample market
        mUSD.mint(deployer, INITIAL_LIQUIDITY);
        console.log("Minted", INITIAL_LIQUIDITY / 1e18, "mUSD to deployer");
        
        // 4. Create a sample market
        mUSD.approve(address(router), INITIAL_LIQUIDITY);
        router.create(
            "Will ETH reach $10,000 by December 2026?",
            "This market resolves YES if ETH/USD spot price reaches or exceeds $10,000 on CoinGecko at any point before December 31, 2026 23:59 UTC.",
            "CoinGecko ETH/USD",
            false, // isDynamic
            SAMPLE_MARKET_DURATION,
            INITIAL_LIQUIDITY
        );
        
        (address sampleMarket,) = router.getMarketAtIndex(0);
        console.log("Sample market deployed at:", sampleMarket);
        
        vm.stopBroadcast();
        
        // Output for frontend consumption
        console.log("\n=== DEPLOYMENT COMPLETE ===");
        console.log("NEXT_PUBLIC_MUSD_ADDRESS=", address(mUSD));
        console.log("NEXT_PUBLIC_ROUTER_ADDRESS=", address(router));
        console.log("NEXT_PUBLIC_SAMPLE_MARKET=", sampleMarket);
    }
}
