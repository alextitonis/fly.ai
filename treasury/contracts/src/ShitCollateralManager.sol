// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

import {Vat} from "@dss/vat.sol";
import {Spotter} from "@dss/spot.sol";
import {Dog} from "@dss/dog.sol";
import {DaiJoin} from "@dss/join.sol";

import {CloneableGemJoin} from "./CloneableGemJoin.sol";
import {CloneableClipper} from "./CloneableClipper.sol";
import {CloneableOSM} from "./CloneableOSM.sol";
import {OraclePipAdapter} from "./OraclePipAdapter.sol";

interface ILinearDecrease {
    function file(bytes32, uint256) external;
}

/// @title ShitCollateralManager
/// @notice Thin manager for multi-collateral Bucky stablecoin using DSS infrastructure
/// @dev All heavy lifting is done by DSS (Vat, Spotter, Dog, Clipper, GemJoin, DaiJoin).
///      This contract only:
///        1. Registers new collateral types (ilks) in the Vat
///        2. Deploys ERC-1167 clones for GemJoin, Clipper, OSM per collateral
///        3. Provides convenience depositAndMint / burnAndWithdraw wrappers
///
///      Architecture:
///        - Stablecoin collateral (USDC, USDT): 100% ratio, no liquidation needed
///        - Impact token collateral: 150%+ ratio, Dutch auction liquidation via Clipper
///        - OraclePipAdapter wraps ImpactOracleAdapter into DSS PipLike interface
///        - CloneableOSM provides 1-hour price delay for governance reaction
///
///      DSS is AGPL-3.0 (copyleft is fine). OZ Clones is MIT.
contract ShitCollateralManager is AccessControl {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error CollateralAlreadyListed();
    error CollateralNotListed();
    error InvalidRatio();
    error NotSafe();
    error InsufficientBalance();

    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    uint256 public constant RAY = 10 ** 27;
    uint256 public constant WAD = 10 ** 18;
    uint256 public constant RAD = 10 ** 45;

    struct CollateralInfo {
        bytes32 ilk;              // DSS ilk identifier
        address gemJoin;          // CloneableGemJoin clone address
        address clipper;          // CloneableClipper clone address (address(0) for stablecoins)
        address osm;              // CloneableOSM clone address
        address pipAdapter;       // OraclePipAdapter address
        uint256 mat;              // Liquidation ratio in ray (e.g. 1.5e27 = 150%)
        bool isStablecoin;        // If true, no liquidation (PSM behavior)
        bool active;
    }

    Vat public immutable vat;
    Spotter public immutable spotter;
    Dog public immutable dog;
    DaiJoin public immutable daiJoin;
    address public immutable buckyToken;
    address public immutable vow;       // DSS Vow (surplus/auction destination)
    address public immutable abacus;    // DSS LinearDecrease for Clipper pricing

    mapping(address => CollateralInfo) public collaterals;
    address[] public collateralList;

    // Implementation templates for ERC-1167 clones
    CloneableGemJoin public immutable gemJoinImpl;
    CloneableClipper public immutable clipperImpl;
    CloneableOSM public immutable osmImpl;

    event CollateralAdded(address indexed token, bytes32 indexed ilk, address gemJoin, address clipper, address osm, uint256 mat, bool isStablecoin);
    event CollateralRemoved(address indexed token);
    event DepositAndMint(address indexed user, address indexed collateralToken, uint256 collateralAmount, uint256 buckyMinted);
    event BurnAndWithdraw(address indexed user, address indexed collateralToken, uint256 buckyBurned, uint256 collateralReturned);

    constructor(
        address _vat,
        address _spotter,
        address _dog,
        address _daiJoin,
        address _buckyToken,
        address _vow,
        address _abacus,
        address _admin
    ) {
        if (_vat == address(0) || _spotter == address(0) || _dog == address(0) ||
            _daiJoin == address(0) || _buckyToken == address(0) || _vow == address(0) ||
            _abacus == address(0) || _admin == address(0)) revert ZeroAddress();

        vat = Vat(_vat);
        spotter = Spotter(_spotter);
        dog = Dog(_dog);
        daiJoin = DaiJoin(_daiJoin);
        buckyToken = _buckyToken;
        vow = _vow;
        abacus = _abacus;

        // Deploy implementation templates for cloning
        gemJoinImpl = new CloneableGemJoin();
        clipperImpl = new CloneableClipper();
        osmImpl = new CloneableOSM();

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(MANAGER_ROLE, _admin);
    }

    // ======== Collateral Registration ========

    function addCollateral(
        address token,
        address oracle,       // IPriceFeed-compatible (getTokenPrice(address) → uint256)
        uint256 mat,           // Liquidation ratio in ray (1e27 = 100%, 1.5e27 = 150%)
        uint256 debtCeiling,   // Max Bucky mintable against this collateral [rad]
        bool isStablecoin      // true for USDC/USDT (no liquidation), false for impact tokens
    ) external onlyRole(MANAGER_ROLE) returns (bytes32 ilk) {
        if (token == address(0) || oracle == address(0)) revert ZeroAddress();
        if (collaterals[token].active) revert CollateralAlreadyListed();
        if (mat < RAY) revert InvalidRatio(); // Must be >= 100%

        // Generate ilk from token address
        ilk = bytes32(uint256(uint160(token)));

        // Initialize ilk in Vat
        vat.init(ilk);

        // Set liquidation ratio in Spotter
        spotter.file(ilk, "mat", mat);

        // Deploy OraclePipAdapter (wraps IPriceFeed into PipLike)
        OraclePipAdapter pipAdapter = new OraclePipAdapter(oracle, token);

        // Set pip in Spotter
        spotter.file(ilk, "pip", address(pipAdapter));

        // Deploy OSM clone (1-hour price delay)
        CloneableOSM osm = CloneableOSM(address(Clones.clone(address(osmImpl))));
        osm.initialize(address(pipAdapter), ilk);

        // Set OSM as pip in Spotter (so Spotter reads from OSM, not raw oracle)
        spotter.file(ilk, "pip", address(osm));

        // Poke spotter to set initial spot price
        spotter.poke(ilk);

        // Deploy GemJoin clone
        CloneableGemJoin gemJoin = CloneableGemJoin(address(Clones.clone(address(gemJoinImpl))));
        gemJoin.initialize(address(vat), ilk, token);

        // Set debt ceiling in Vat
        vat.file(ilk, "line", debtCeiling);

        // Deploy Clipper clone only for non-stablecoin collateral
        address clipperAddr = address(0);
        if (!isStablecoin) {
            CloneableClipper clipper = CloneableClipper(address(Clones.clone(address(clipperImpl))));
            clipper.initialize(address(vat), address(dog), ilk, abacus, vow);
            clipperAddr = address(clipper);
        }

        collaterals[token] = CollateralInfo({
            ilk: ilk,
            gemJoin: address(gemJoin),
            clipper: clipperAddr,
            osm: address(osm),
            pipAdapter: address(pipAdapter),
            mat: mat,
            isStablecoin: isStablecoin,
            active: true
        });
        collateralList.push(token);

        emit CollateralAdded(token, ilk, address(gemJoin), clipperAddr, address(osm), mat, isStablecoin);
    }

    function removeCollateral(address token) external onlyRole(MANAGER_ROLE) {
        if (!collaterals[token].active) revert CollateralNotListed();
        collaterals[token].active = false;
        emit CollateralRemoved(token);
    }

    // ======== Convenience Wrappers ========

    /// @notice Deposit collateral and mint Bucky in one transaction
    /// @dev This wraps: GemJoin.join → Vat.frob → DaiJoin.exit
    function depositAndMint(address collateralToken, uint256 collateralAmount, uint256 buckyToMint)
        external
        returns (uint256)
    {
        CollateralInfo memory c = collaterals[collateralToken];
        if (!c.active) revert CollateralNotListed();

        // 1. Transfer collateral from user to GemJoin
        IERC20(collateralToken).safeTransferFrom(msg.sender, c.gemJoin, collateralAmount);

        // 2. Join collateral into Vat
        CloneableGemJoin(c.gemJoin).join(msg.sender, collateralAmount);

        // 3. Authorize manager to frob on user's behalf
        // User must have called vat.hope(address(this)) beforehand
        vat.frob(c.ilk, msg.sender, msg.sender, msg.sender, int256(collateralAmount), int256(buckyToMint));

        // 4. Exit Bucky from Vat via DaiJoin
        // Move dai balance from user to this contract, then exit to user
        vat.move(msg.sender, address(this), buckyToMint * RAD);
        daiJoin.exit(msg.sender, buckyToMint);

        emit DepositAndMint(msg.sender, collateralToken, collateralAmount, buckyToMint);
        return buckyToMint;
    }

    /// @notice Burn Bucky and withdraw collateral in one transaction
    /// @dev This wraps: DaiJoin.join → Vat.frob → GemJoin.exit
    function burnAndWithdraw(address collateralToken, uint256 buckyToBurn, uint256 collateralToReturn)
        external
        returns (uint256)
    {
        CollateralInfo memory c = collaterals[collateralToken];
        if (!c.active) revert CollateralNotListed();

        // 1. Transfer Bucky from user to this contract
        IERC20(buckyToken).safeTransferFrom(msg.sender, address(this), buckyToBurn);

        // 2. Join Bucky into Vat (burn token, credit Vat balance)
        IERC20(buckyToken).approve(address(daiJoin), buckyToBurn);
        daiJoin.join(msg.sender, buckyToBurn);

        // 3. Frob: reduce debt and unlock collateral
        vat.frob(c.ilk, msg.sender, msg.sender, msg.sender, -int256(collateralToReturn), -int256(buckyToBurn));

        // 4. Exit collateral from Vat via GemJoin
        CloneableGemJoin(c.gemJoin).exit(msg.sender, collateralToReturn);

        emit BurnAndWithdraw(msg.sender, collateralToken, buckyToBurn, collateralToReturn);
        return collateralToReturn;
    }

    // ======== View Functions ========

    function getCollateralCount() external view returns (uint256) {
        return collateralList.length;
    }

    function getCollateralInfo(address token) external view returns (CollateralInfo memory) {
        return collaterals[token];
    }

    // ======== Admin ========

    function setDebtCeiling(address token, uint256 ceiling) external onlyRole(MANAGER_ROLE) {
        CollateralInfo memory c = collaterals[token];
        if (!c.active) revert CollateralNotListed();
        vat.file(c.ilk, "line", ceiling);
    }

    function pokeSpotter(address token) external {
        CollateralInfo memory c = collaterals[token];
        if (!c.active) revert CollateralNotListed();
        // Update OSM first (shifts next → current)
        CloneableOSM(c.osm).poke();
        // Then poke spotter to update spot price in Vat
        spotter.poke(c.ilk);
    }
}
