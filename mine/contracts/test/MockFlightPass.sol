// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Stand-ins for the FlightPass NFT and its FlyMarket (flytrade/contracts), for src/flightpasstest.ts: only the reads
/// the server makes (ownerOf, totalSupply, isListed), set directly by the test.
contract MockFlightPass {
    mapping(uint256 => address) private owners;
    uint256 public totalSupply;

    function set(uint256 id, address owner) external {
        owners[id] = owner;
        if (id > totalSupply) totalSupply = id;
    }

    function ownerOf(uint256 id) external view returns (address) {
        address o = owners[id];
        require(o != address(0), "ERC721NonexistentToken");
        return o;
    }
}

contract MockPassMarket {
    mapping(uint256 => bool) public isListed;

    function set(uint256 id, bool listed) external {
        isListed[id] = listed;
    }
}
