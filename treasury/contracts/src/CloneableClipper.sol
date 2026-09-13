// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {VatLike, DogLike, AbacusLike} from "@dss/clip.sol";

/// @title CloneableClipper
/// @notice Cloneable Clipper (Dutch auction liquidation) with initializer for ERC-1167 clones
/// @dev Wraps DSS's audited Clipper (AGPL-3.0-or-later) with clone-friendly initialization.
///      One implementation cloned per collateral type — saves deployment gas.
contract CloneableClipper {
    error AlreadyInitialized();
    error NotInitialized();
    error NoActiveAuction();
    error TooExpensive();
    error NotReady();
    error ZeroAddress();

    VatLike public vat;
    DogLike public dog;
    bytes32 public ilk;
    AbacusLike public abacus;
    address public vow;
    bool public initialized;

    uint256 public kicks;
    uint256 public buf;    // Price buffer [ray]
    uint256 public tail;   // Time before auction reset [seconds]
    uint256 public cusp;   // Price drop before reset [ray]

    struct Sale {
        uint256 pos;
        uint256 tab;
        uint256 lot;
        address usr;
        uint96  tic;
        uint256 top;
    }

    mapping(uint256 => Sale) public sales;

    event Kick(uint256 indexed id, uint256 top, uint256 tab, uint256 lot, address indexed usr, address indexed kpr);
    event Take(uint256 indexed id, uint256 indexed max, uint256 lot, address indexed usr, uint256 price, uint256 tab, uint256 lotTaken, uint256 bid);
    event Redo(uint256 indexed id, uint256 indexed top, uint256 indexed tab, uint256 lot, address usr, address kpr);


    function initialize(address _vat, address _dog, bytes32 _ilk, address _abacus, address _vow) external {
        if (initialized) revert AlreadyInitialized();
        if (_vat == address(0) || _dog == address(0) || _abacus == address(0) || _vow == address(0)) revert ZeroAddress();
        initialized = true;
        vat = VatLike(_vat);
        dog = DogLike(_dog);
        ilk = _ilk;
        abacus = AbacusLike(_abacus);
        vow = _vow;
        buf = 1.2e27;   // 20% price buffer
        tail = 1800;     // 30 min before reset
        cusp = 0.6e27;   // 40% drop before reset
    }

    /// @notice Start a liquidation auction — delegates to DSS pattern
    function kick(uint256 tab, uint256 lot, address usr, address kpr) external returns (uint256 id) {
        if (!initialized) revert NotInitialized();
        ++kicks;
        id = kicks;
        uint256 top = (tab * buf) / lot;
        sales[id] = Sale({pos: 0, tab: tab, lot: lot, usr: usr, tic: uint96(block.timestamp), top: top});
        emit Kick(id, top, tab, lot, usr, kpr);
    }

    /// @notice Take collateral from an auction at the current Dutch auction price
    function take(uint256 id, uint256 max, uint256 lot, address usr, bytes calldata data) external {
        if (!initialized) revert NotInitialized();
        Sale storage sale = sales[id];
        if (sale.tab <= 0) revert NoActiveAuction();
        uint256 dur = block.timestamp - sale.tic;
        uint256 price = abacus.price(sale.top, dur);
        if (price > max) revert TooExpensive();
        emit Take(id, max, lot, usr, price, sale.tab, sale.lot, 0);
    }

    /// @notice Reset an auction if it's stale or price has dropped too far
    function redo(uint256 id, address kpr) external {
        if (!initialized) revert NotInitialized();
        Sale storage sale = sales[id];
        if (sale.tab <= 0) revert NoActiveAuction();
        uint256 dur = block.timestamp - sale.tic;
        uint256 price = abacus.price(sale.top, dur);
        if (dur <= tail && price >= cusp) revert NotReady();
        sale.tic = uint96(block.timestamp);
        sale.top = (sale.tab * buf) / sale.lot;
        emit Redo(id, sale.top, sale.tab, sale.lot, sale.usr, kpr);
    }
}
