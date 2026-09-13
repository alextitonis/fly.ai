// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MockERC20} from "solmate/test/utils/mocks/MockERC20.sol";

interface IBondAuctioneer {
    function createMarket(bytes memory params_) external returns (uint256);
}
interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
}

contract RedeployAzusd is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);

        // 1. Deploy new AZUSD mock with non-impersonating name/symbol
        MockERC20 azusd = new MockERC20("AZUSD", "AZUSD", 6);
        console2.log("New AZUSD:", address(azusd));

        // 2. Approve SHIT payout to the teller so the market can pay out
        address SHIT = 0x823d5d44F9E647402c949376E54f709Ab3a9015b;
        address TELLER = 0xf4816c51221Cb49BdF24a30e69a1fa26B0cE0703;
        IERC20(SHIT).approve(TELLER, type(uint256).max);
        console2.log("Approved SHIT to teller");

        // 3. Create bond market replicating market 1 params with new quote token
        address AUCTIONEER = 0x2baa439C3d29B6B7fE6df60Fdf0840AdEf77fF0a;
        bytes memory params = abi.encode(
            SHIT,                                            // payoutToken
            address(azusd),                                   // quoteToken (new)
            address(0),                                       // callbackAddr
            true,                                             // capacityInQuote
            uint256(50000000000),                             // capacity (50,000 AZUSD)
            uint256(1000000000000000000000000000000000000),   // formattedInitialPrice 1e36
            uint256(500000000000000000000000000000000000),    // formattedMinimumPrice 5e35
            uint32(50000),                                    // debtBuffer
            uint48(1209600),                                  // vesting (14 days)
            uint48(0),                                        // start (immediate)
            uint32(5184000),                                  // duration (60 days)
            uint32(3600),                                     // depositInterval (1 hour)
            int8(6)                                           // scaleAdjustment
        );
        uint256 marketId = IBondAuctioneer(AUCTIONEER).createMarket(params);
        console2.log("New market id:", marketId);

        vm.stopBroadcast();
    }
}
