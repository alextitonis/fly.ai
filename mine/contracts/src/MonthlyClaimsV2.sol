// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";

/// @title Monthly $FLYAI claims for fly.ai compute miners, from October 2026 on
/// @notice Same flow and ABI as MonthlyClaims (which keeps paying September 2026 until its own deadline): after a
/// month ends the owner posts the mining server's Merkle root of (wallet, amount) and funds its total in one
/// transaction, each wallet claims its own amount with a proof, and once the claim window is over the owner sweeps
/// what's left. Two things are settings here instead of fixed:
///  - `claimWindow`: how long a month stays claimable (30 days at launch). A change applies to months opened after
///    it; a month's deadline is fixed when it opens.
///  - `minHold`: the $FLYAI a wallet must already hold to claim (0 at launch). Checked on the receiving account.
/// @dev Behind a TransparentUpgradeableProxy whose ProxyAdmin the owner holds. Storage lives in one ERC-7201
/// namespace, so an upgrade can append fields to it. What the owner can't do: change a month's root or deadline once
/// posted, or take a month's funds before its window closes.
/// Leaves are OpenZeppelin's standard: keccak256(bytes.concat(keccak256(abi.encode(account, amount)))).
contract MonthlyClaimsV2 is Ownable2StepUpgradeable {
    using SafeERC20 for IERC20;

    struct Month {
        bytes32 root;
        uint128 total;
        uint128 claimed;
        uint64 deadline;
        bool swept;
    }

    /// @custom:storage-location erc7201:flyai.storage.MonthlyClaims
    struct ClaimsStorage {
        IERC20 token;
        uint64 claimWindow;
        uint256 minHold;
        mapping(uint256 => Month) months;
        mapping(uint256 => mapping(address => bool)) hasClaimed;
    }

    // keccak256(abi.encode(uint256(keccak256("flyai.storage.MonthlyClaims")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant STORAGE = 0x26c2f869306af6c1fea4948398aaac9159604b3c9750c07ae928111bdf1e8700;

    uint64 public constant MIN_WINDOW = 7 days;
    uint64 public constant MAX_WINDOW = 730 days;

    event MonthOpened(uint256 indexed month, bytes32 root, uint256 total, uint256 deadline);
    event Claimed(uint256 indexed month, address indexed account, uint256 amount);
    event Swept(uint256 indexed month, address indexed to, uint256 amount);
    event ClaimWindowSet(uint64 window);
    event MinHoldSet(uint256 amount);

    error BadMonth();
    error MonthExists();
    error UnknownMonth();
    error EmptyRoot();
    error NotFullyFunded();
    error AlreadyClaimed();
    error BadProof();
    error OverTotal();
    error WindowOpen();
    error WindowClosed();
    error AlreadySwept();
    error ZeroAddress();
    error BadWindow();
    error RenounceDisabled();
    error HoldTooLow(uint256 held, uint256 needed);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(IERC20 token_, uint64 claimWindow_, uint256 minHold_, address owner_) external initializer {
        if (address(token_) == address(0)) revert ZeroAddress();
        __Ownable_init(owner_);
        __Ownable2Step_init();
        _s().token = token_;
        _setClaimWindow(claimWindow_);
        _setMinHold(minHold_);
    }

    function _s() private pure returns (ClaimsStorage storage s) {
        assembly {
            s.slot := STORAGE
        }
    }

    // ---- views (same names as MonthlyClaims, so the server's calldata works on both) ----

    function token() external view returns (IERC20) {
        return _s().token;
    }

    /// @notice seconds a month opened from now on stays claimable
    function claimWindow() external view returns (uint64) {
        return _s().claimWindow;
    }

    /// @notice $FLYAI (wei) a wallet must hold to claim
    function minHold() external view returns (uint256) {
        return _s().minHold;
    }

    /// @notice by month id, YYYYMM (202610 is October 2026)
    function months(uint256 month)
        external
        view
        returns (bytes32 root, uint128 total, uint128 claimed, uint64 deadline, bool swept)
    {
        Month storage m = _s().months[month];
        return (m.root, m.total, m.claimed, m.deadline, m.swept);
    }

    function hasClaimed(uint256 month, address account) external view returns (bool) {
        return _s().hasClaimed[month][account];
    }

    // ---- owner settings ----

    /// @notice Applies to months opened after this call; open months keep their deadline.
    function setClaimWindow(uint64 window) external onlyOwner {
        _setClaimWindow(window);
    }

    function setMinHold(uint256 amount) external onlyOwner {
        _setMinHold(amount);
    }

    function _setClaimWindow(uint64 window) private {
        // too short and the owner could sweep before anyone has had a chance to claim
        if (window < MIN_WINDOW || window > MAX_WINDOW) revert BadWindow();
        _s().claimWindow = window;
        emit ClaimWindowSet(window);
    }

    function _setMinHold(uint256 amount) private {
        _s().minHold = amount;
        emit MinHoldSet(amount);
    }

    // ---- months ----

    /// @notice Post a month's root and fund it. The owner must have approved `total` first.
    function openMonth(uint256 month, bytes32 root, uint128 total) external onlyOwner {
        ClaimsStorage storage s = _s();
        if (month < 202001 || month > 299912 || month % 100 == 0 || month % 100 > 12) revert BadMonth();
        if (s.months[month].root != bytes32(0)) revert MonthExists();
        if (root == bytes32(0)) revert EmptyRoot();
        uint64 deadline = uint64(block.timestamp) + s.claimWindow;
        s.months[month] = Month(root, total, 0, deadline, false);
        uint256 before = s.token.balanceOf(address(this));
        s.token.safeTransferFrom(msg.sender, address(this), total);
        // a token that takes a fee on transfer would leave the month short of what claims add up to
        if (s.token.balanceOf(address(this)) - before != total) revert NotFullyFunded();
        emit MonthOpened(month, root, total, deadline);
    }

    /// @notice Pay `account` its amount for `month`. Anyone may send it; the tokens always go to `account`, and it's
    /// `account` that must hold `minHold`.
    function claim(uint256 month, address account, uint256 amount, bytes32[] calldata proof) external {
        ClaimsStorage storage s = _s();
        Month storage m = s.months[month];
        if (m.root == bytes32(0)) revert UnknownMonth();
        if (block.timestamp > m.deadline) revert WindowClosed();
        if (s.hasClaimed[month][account]) revert AlreadyClaimed();
        uint256 need = s.minHold;
        if (need != 0) {
            uint256 held = s.token.balanceOf(account);
            if (held < need) revert HoldTooLow(held, need);
        }
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(account, amount))));
        if (!MerkleProof.verifyCalldata(proof, m.root, leaf)) revert BadProof();
        if (amount > m.total - m.claimed) revert OverTotal();
        s.hasClaimed[month][account] = true;
        m.claimed += uint128(amount);
        s.token.safeTransfer(account, amount);
        emit Claimed(month, account, amount);
    }

    /// @notice After a month's window, return what nobody claimed.
    function sweep(uint256 month, address to) external onlyOwner {
        Month storage m = _s().months[month];
        if (m.root == bytes32(0)) revert UnknownMonth();
        if (block.timestamp <= m.deadline) revert WindowOpen();
        if (m.swept) revert AlreadySwept();
        if (to == address(0)) revert ZeroAddress();
        m.swept = true;
        uint256 left = m.total - m.claimed;
        _s().token.safeTransfer(to, left);
        emit Swept(month, to, left);
    }

    /// @notice Disabled: without an owner no month could be opened and unclaimed tokens could never be swept.
    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }
}
