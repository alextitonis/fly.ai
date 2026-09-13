// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

interface IBondAuctioneer {
    function createMarket(bytes memory params_) external returns (uint256);
    function closeMarket(uint256 id_) external;
}
interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
}
interface IMintable {
    function mint(address to, uint256 amount) external;
}

/// @notice Close the mispriced impact-token bond markets and recreate them with a
///         correct ~1:1 SHIT payout rate, plus mint SHIT to the owner so payouts
///         can actually be covered.
///
/// Root cause of TRANSFER_FROM_FAILED: the impact markets were created with
/// formattedInitialPrice ~4e29 while scale = 1e36, so payout = amount * scale/price
/// was ~2.5e6x too large and the owner could never cover the SHIT payout.
/// For 18-dec quote + 18-dec payout, scaleAdjustment = 0 -> scale = 1e36, and a
/// price of 1e36 gives a 1:1 rate (decaying to 5e35 -> up to 2:1 discount).
contract FixImpactMarkets is Script {
    address constant SHIT = 0x823d5d44F9E647402c949376E54f709Ab3a9015b;
    address constant TELLER = 0xf4816c51221Cb49BdF24a30e69a1fa26B0cE0703;
    address constant AUCTIONEER = 0x2baa439C3d29B6B7fE6df60Fdf0840AdEf77fF0a;
    address constant DEPLOYER = 0x47bB7d3048c0aB38aEb4075FB5116307d39f68F1;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);

        // 1. Mint SHIT to the deployer (market owner) so it can cover payouts.
        //    Deployer is the SHIT multisig, so mint() is authorized.
        IMintable(SHIT).mint(DEPLOYER, 5_000_000e18); // 5,000,000 SHIT
        console2.log("Minted 5,000,000 SHIT to deployer");

        // 2. Ensure the teller can pull SHIT payouts from the owner.
        IERC20(SHIT).approve(TELLER, type(uint256).max);
        console2.log("Approved SHIT to teller");

        // 3. Close the broken impact markets (deployer is the owner of each).
        uint256[7] memory oldMarkets = [uint256(2), 3, 4, 5, 6, 7, 8];
        for (uint256 i = 0; i < oldMarkets.length; i++) {
            try IBondAuctioneer(AUCTIONEER).closeMarket(oldMarkets[i]) {
                console2.log("Closed market", oldMarkets[i]);
            } catch {
                console2.log("closeMarket failed (already closed?)", oldMarkets[i]);
            }
        }

        // 4. Recreate one correctly-priced market per unique impact token.
        address[6] memory impactTokens = [
            0xaC1f1b7C607ec0416c5174973dbc858e732054A7, // SLR
            0x815c5b6e910c9159d1bCf3569f833acd0dDf8d2A, // TREE
            0x5D3cEFD66EBf2ed769C13b05C85Dc25Aa4e72153, // REGEN
            0x28f7EFEa7E76F530425f73e410d97f958Ed60018, // DOVU
            0x2434eAf23175c983B23D3d044921fCF3ea3dCAcC, // KLIMA
            0x4d866898f3a4FF80416F1d37c2bF0EDb647a9b37  // CEN
        ];

        for (uint256 i = 0; i < impactTokens.length; i++) {
            bytes memory params = abi.encode(
                SHIT,                                          // payoutToken
                impactTokens[i],                                // quoteToken
                address(0),                                     // callbackAddr
                true,                                           // capacityInQuote
                uint256(100000000000000000000000),              // capacity (100,000 impact tokens)
                uint256(1000000000000000000000000000000000000), // formattedInitialPrice 1e36 (~1:1)
                uint256(500000000000000000000000000000000000),  // formattedMinimumPrice 5e35 (up to 2:1)
                uint32(50000),                                  // debtBuffer
                uint48(1209600),                                // vesting (14 days)
                uint48(0),                                      // start (immediate)
                uint32(5184000),                                // duration (60 days)
                uint32(3600),                                   // depositInterval (1 hour)
                int8(0)                                         // scaleAdjustment (18-dec quote & payout)
            );
            uint256 marketId = IBondAuctioneer(AUCTIONEER).createMarket(params);
            console2.log("Created market", marketId, "for quote", impactTokens[i]);
        }

        vm.stopBroadcast();
    }
}
