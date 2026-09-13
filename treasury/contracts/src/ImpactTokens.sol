// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

/// @title ImpactTokens
/// @notice Initial impact token addresses for the SHIT Protocol protocol (Base chain)
/// @dev These are the tokens auto-whitelisted in the TokenRegistry at deployment on Base.
library ImpactTokens {
    struct TokenInfo {
        string name;
        string symbol;
        string website;
        address base;
        uint256 initialAllocation;
    }

    /// @notice Number of initial impact tokens
    uint256 public constant COUNT = 5;

    /// @notice Get token info by index (0-4)
    /// @dev Order: 0=Solarcoin, 1=Treegens, 2=Regen, 3=DOVU, 4=KVCM
    function getToken(uint256 index) internal pure returns (TokenInfo memory) {
        if (index == 0) {
            return TokenInfo({
                name: "Solarcoin",
                symbol: "SLR",
                website: "https://solarcoin.org/",
                base: 0x4E9e4Ab99Cfc14B852f552f5Fb3Aa68617825B6c,
                initialAllocation: 88_000e18
            });
        } else if (index == 1) {
            return TokenInfo({
                name: "Treegens",
                symbol: "TREE",
                website: "https://treegens.app/",
                base: 0xD75dfa972C6136f1c594Fec1945302f885E1ab29,
                initialAllocation: 85_000e18
            });
        } else if (index == 2) {
            return TokenInfo({
                name: "Regen",
                symbol: "REGEN",
                website: "https://www.regen.network/",
                base: 0x2E6C05f1f7D1f4Eb9A088bf12257f1647682b754,
                initialAllocation: 16_000e18
            });
        } else if (index == 3) {
            return TokenInfo({
                name: "DOVU",
                symbol: "DOVU",
                website: "https://dovu.earth/",
                base: 0xB38266e0e9D9681b77aEB0A280E98131b953F865,
                initialAllocation: 841_000e18
            });
        } else {
            return TokenInfo({
                name: "KVCM",
                symbol: "KVCM",
                website: "https://www.klimaprotocol.com/",
                base: 0x00fBAC94Fec8D4089d3fe979F39454F48c71A65d,
                initialAllocation: 66_000e18
            });
        }
    }

    /// @notice Get all Base chain token addresses
    function getAddresses() internal pure returns (address[] memory) {
        address[] memory result = new address[](COUNT);
        for (uint256 i = 0; i < COUNT; ++i) {
            result[i] = getToken(i).base;
        }
        return result;
    }
}
