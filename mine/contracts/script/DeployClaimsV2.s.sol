// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {MonthlyClaimsV2} from "../src/MonthlyClaimsV2.sol";

/// Deploy MonthlyClaimsV2 (monthly miner claims from October 2026 on) behind a TransparentUpgradeableProxy. OWNER (the
/// dev wallet) owns the contract AND its ProxyAdmin (the upgrade key); any key can send the deploy.
///   required: OWNER
///   optional: TOKEN (default the live $FLYAI), CLAIM_WINDOW_DAYS (default 30), MIN_HOLD_WEI (default 0)
///     OWNER=0x6258... forge script script/DeployClaimsV2.s.sol --rpc-url https://rpc.mainnet.chain.robinhood.com --broadcast --private-key <deployer>
/// Then: fly secrets set CLAIMS_CONTRACT=<proxy> CLAIMS_LEGACY=202609:0x9C11Cfba5564Fb6e3f0258DDcB92Fd6BA6b4d77A
/// (months up to and including 202609 stay on the first contract). Later, from OWNER: setMinHold(1e18) for 1 FLYAI.
contract DeployClaimsV2 is Script {
    bytes32 constant ADMIN_SLOT = 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;

    function run() external returns (MonthlyClaimsV2 claims) {
        address owner = vm.envAddress("OWNER");
        IERC20 token = IERC20(vm.envOr("TOKEN", address(0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C)));
        uint64 window = SafeCast.toUint64(vm.envOr("CLAIM_WINDOW_DAYS", uint256(30)) * 1 days);
        uint256 minHold = vm.envOr("MIN_HOLD_WEI", uint256(0));
        vm.startBroadcast();
        address impl = address(new MonthlyClaimsV2());
        claims = MonthlyClaimsV2(address(new TransparentUpgradeableProxy(impl, owner,
            abi.encodeCall(MonthlyClaimsV2.initialize, (token, window, minHold, owner)))));
        vm.stopBroadcast();
        console.log("MonthlyClaimsV2 (proxy)", address(claims));
        console.log("implementation", impl);
        console.log("ProxyAdmin", address(uint160(uint256(vm.load(address(claims), ADMIN_SLOT)))));
        console.log("owner + ProxyAdmin owner", owner);
        console.log("token", address(token));
        console.log("claim window (s)", window);
        console.log("min hold (wei)", minHold);
    }
}
