// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {MonoCooler} from "@shit-v3/policies/cooler/MonoCooler.sol";
import {ShitCoolerComposites} from "../src/ShitCoolerComposites.sol";

contract DeployComposites is Script {
    // Existing deployed MonoCooler on Base Sepolia
    address constant MONOCOOLER = 0xB132a9bf2A2fb148523648D6Ef0E9fd87a509B13;
    address constant SAFE = 0x47bB7d3048c0aB38aEb4075FB5116307d39f68F1;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        console2.log("=== Deploying ShitCoolerComposites ===");
        console2.log("MonoCooler:", MONOCOOLER);

        ShitCoolerComposites composites = new ShitCoolerComposites(
            MonoCooler(MONOCOOLER),
            deployer
        );
        console2.log("ShitCoolerComposites:", address(composites));

        composites.enable("");
        console2.log("Composites enabled");

        vm.stopBroadcast();
    }
}
