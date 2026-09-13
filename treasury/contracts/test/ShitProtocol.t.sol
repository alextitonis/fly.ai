// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {Kernel, Actions} from "@shit-v3/Kernel.sol";
import {SHIT ProtocolRoles} from "@shit-v3/modules/ROLES/SHIT ProtocolRoles.sol";
import {Vat} from "@dss/vat.sol";
import {Spotter} from "@dss/spot.sol";
import {Dog} from "@dss/dog.sol";
import {DaiJoin} from "@dss/join.sol";
import {LinearDecrease} from "@dss/abaci.sol";
import {PipLike} from "@dss/spot.sol";

import {ShitToken} from "../src/ShitToken.sol";
import {WstSHIT} from "../src/wstSHIT.sol";
import {MultisigGuard} from "../src/MultisigGuard.sol";
import {ShitDeployer} from "../src/ShitDeployer.sol";
import {TokenRegistry} from "../src/TokenRegistry.sol";
import {TokenOnboardingManager} from "../src/TokenOnboardingManager.sol";
import {ImpactTokens} from "../src/ImpactTokens.sol";
import {ShitStaking} from "../src/ShitStaking.sol";
import {StakingAdapter} from "../src/StakingAdapter.sol";
import {ShitPriceFeed} from "../src/ShitPriceFeed.sol";
import {TwapLibrary} from "../src/TwapLibrary.sol";
import {IPriceFeed} from "../src/IPriceFeed.sol";
import {ITreasuryPolicy} from "../src/ITreasuryPolicy.sol";
import {TreasuryValuation} from "../src/TreasuryValuation.sol";
import {ShitInverseBond} from "../src/ShitInverseBond.sol";
import {ShitCircuitBreaker} from "../src/ShitCircuitBreaker.sol";
import {ShitDefenseBudget} from "../src/ShitDefenseBudget.sol";
import {ShitBondPricer} from "../src/ShitBondPricer.sol";
import {ShitCollateralManager} from "../src/ShitCollateralManager.sol";
import {ShitLiquidationKeeper} from "../src/ShitLiquidationKeeper.sol";
import {OraclePipAdapter} from "../src/OraclePipAdapter.sol";
import {CloneableAbacus} from "../src/CloneableAbacus.sol";
import {CloneableClipper} from "../src/CloneableClipper.sol";
import {CloneableGemJoin} from "../src/CloneableGemJoin.sol";
import {CloneableOSM} from "../src/CloneableOSM.sol";
import {ShitTreasuryIntegration} from "../src/ShitTreasuryIntegration.sol";
import {ImpactOracleAdapter} from "../src/ImpactOracleAdapter.sol";
import {FixedRateProvider} from "../src/FixedRateProvider.sol";
import {ReferralRegistry} from "../src/ReferralRegistry.sol";
import {IHedgeyClaimCampaigns} from "../src/IHedgeyClaimCampaigns.sol";

// ==================== MOCKS ====================

contract ERC20Mock is ERC20 {
    uint8 private _decimals;
    constructor(string memory n, string memory s, uint8 d) ERC20(n, s) { _decimals = d; }
    function decimals() public view override returns (uint8) { return _decimals; }
    function mint(address to, uint256 a) external virtual { _mint(to, a); }
    function burn(address f, uint256 a) external { _burn(f, a); }
    function burn(uint256 a) external { _burn(msg.sender, a); }
}

contract MockERC20Simple is ERC20 {
    constructor(string memory n, string memory s) ERC20(n, s) {}
    function mint(address to, uint256 a) external { _mint(to, a); }
}

contract MockHedgeyClaimCampaigns {
    mapping(bytes16 => IHedgeyClaimCampaigns.Campaign) public campaigns;
    mapping(bytes16 => mapping(address => bool)) public claimed;
    function setCampaign(bytes16 id, IHedgeyClaimCampaigns.Campaign memory c) external { campaigns[id] = c; }
    function setClaimed(bytes16 id, address u, bool v) external { claimed[id][u] = v; }
}

contract MockV3Pool {
    uint160 public sqrtPriceX96;
    uint16 public observationCardinality;
    int56[] public tickCumulatives;
    function setSqrtPriceX96(uint160 v) external { sqrtPriceX96 = v; }
    function setObservationCardinality(uint16 v) external { observationCardinality = v; }
    function setTickCumulatives(int56[] memory v) external { tickCumulatives = v; }
    function slot0() external view returns (uint160, int24, uint16, uint16, uint16, uint8, bool) {
        return (sqrtPriceX96, 0, 0, observationCardinality, 0, 0, false);
    }
    function observe(uint32[] calldata) external view returns (int56[] memory, uint160[] memory) {
        int56[] memory c = new int56[](2);
        c[0] = tickCumulatives[0]; c[1] = tickCumulatives[1];
        uint160[] memory s = new uint160[](2);
        return (c, s);
    }
}

contract MockTreasuryPolicyForFeed {
    function navPerShit() external pure returns (uint256) { return 0; }
    function floorPrice() external pure returns (uint256) { return 0; }
    function rfv() external pure returns (uint256) { return 0; }
    function enforceRfvInvariant(uint256) external view {}
}

contract TestPriceFeed is IPriceFeed {
    function getTokenPrice(address) external pure returns (uint256) { return 1e18; }
    function getNavPerToken() external pure returns (uint256) { return 1e18; }
}

contract PremiumPriceFeed is IPriceFeed {
    function getTokenPrice(address) external pure returns (uint256) { return 1.5e18; }
    function getNavPerToken() external pure returns (uint256) { return 1e18; }
}

contract TestTreasuryPolicy is ITreasuryPolicy {
    function enforceRfvInvariant(uint256) external pure {}
    function floorPrice() external pure returns (uint256) { return 1e18; }
    function navPerShit() external pure returns (uint256) { return 1e18; }
    function rfv() external pure returns (uint256) { return 1e18; }
}

contract CBMockPriceFeed {
    uint256 public buckyPrice;
    function setPrice(uint256 p) external { buckyPrice = p; }
    function getTokenPrice(address) external view returns (uint256) { return buckyPrice; }
}

contract CBMockTreasuryPolicy {
    uint256 public rfv;
    uint256 public floorPrice;
    function setRfv(uint256 v) external { rfv = v; }
    function setFloorPrice(uint256 v) external { floorPrice = v; }
}

contract CBMockOperator {
    bool public operateCalled;
    function operate() external { operateCalled = true; }
}

contract MockOracle {
    uint256 public price;
    constructor(uint256 p) { price = p; }
    function getTokenPrice(address) external view returns (uint256) { return price; }
}

contract MockFlashSource {
    address public keeper;
    function setKeeper(address k) external { keeper = k; }
    function flashLoan(address token, uint256 amount, bytes calldata data) external {
        ERC20Mock(token).mint(address(keeper), amount);
        bytes32 r = ShitLiquidationKeeper(keeper).onFlashLoan(address(this), token, amount, 0, data);
        require(r == keccak256("ERC3156FlashBorrower.onFlashLoan"), "bad");
    }
    function maxFlashLoan(address) external pure returns (uint256) { return type(uint256).max; }
}

contract MockDog {
    address public keeper;
    bool public shouldFail;
    function setKeeper(address k) external { keeper = k; }
    function setShouldFail(bool f) external { shouldFail = f; }
    function bark(bytes32, address, address) external returns (uint256) {
        if (shouldFail) revert("bark failed");
        return 1;
    }
}

contract MockVat {
    function urns(bytes32, address) external pure returns (uint256, uint256) { return (0, 0); }
    function ilks(bytes32) external pure returns (uint256, uint256, uint256, uint256, uint256) { return (0, 0, 0, 0, 0); }
}

struct ExactInputSingleParams {
    address tokenIn; address tokenOut; uint24 fee; address recipient;
    uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96;
}

contract MockSwapRouter {
    address public keeper;
    uint256 public returnAmount;
    function setKeeper(address k) external { keeper = k; }
    function setReturnAmount(uint256 v) external { returnAmount = v; }
    function exactInputSingle(ExactInputSingleParams memory p) external returns (uint256) {
        ERC20Mock(p.tokenIn).transferFrom(p.recipient, address(this), p.amountIn);
        ERC20Mock(p.tokenOut).mint(p.recipient, returnAmount);
        return returnAmount;
    }
}

contract TestPriceSource is PipLike {
    bytes32 public val;
    bool public has;
    constructor(bytes32 v) { val = v; has = true; }
    function peek() external returns (bytes32, bool) { return (val, has); }
}

contract TestMultisigGuard is MultisigGuard {
    bool public called;
    constructor(address m) MultisigGuard(m) {}
    function protectedFunction() external onlyMultisig { called = true; }
}

contract ERC1967Proxy {
    bytes32 internal constant _SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
    constructor(address impl, bytes memory data) {
        assembly { sstore(_SLOT, impl) }
        (bool ok,) = impl.delegatecall(data);
        require(ok, "init failed");
    }
    fallback() external payable {
        assembly {
            let impl := sload(_SLOT)
            calldatacopy(0, 0, calldatasize())
            let r := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch r
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}

// ==================== TOKEN TESTS ====================

contract ShitTokenTest is Test {
    ShitToken public shitToken;
    WstSHIT public govToken;
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public multisig = makeAddr("multisig");

    function setUp() public {
        shitToken = new ShitToken(address(this));
        govToken = new WstSHIT(address(shitToken));
    }

    function testTokenMetadata() public view {
        assertEq(shitToken.name(), "SHIT Protocol");
        assertEq(shitToken.symbol(), "SHIT");
        assertEq(shitToken.decimals(), 18);
    }

    function testMintAndBurn() public {
        shitToken.mint(alice, 100e18);
        assertEq(shitToken.balanceOf(alice), 100e18);
        vm.prank(alice);
        shitToken.burn(40e18);
        assertEq(shitToken.balanceOf(alice), 60e18);
    }

    function testBurnFrom() public {
        shitToken.mint(alice, 100e18);
        vm.prank(alice);
        shitToken.approve(bob, 50e18);
        vm.prank(bob);
        shitToken.burnFrom(alice, 30e18);
        assertEq(shitToken.balanceOf(alice), 70e18);
    }

    function testMaxSupply() public {
        shitToken.mint(alice, 100_000_000e18);
        vm.expectRevert(ShitToken.MaxSupplyExceeded.selector);
        shitToken.mint(alice, 1);
    }

    function testOnlyMinterCanMint() public {
        vm.prank(alice);
        vm.expectRevert();
        shitToken.mint(alice, 100e18);
    }

    function testConstructorRevertZeroAddress() public {
        vm.expectRevert();
        new ShitToken(address(0));
    }

    function testSetAuthorizedMinter() public {
        ShitToken token = new ShitToken(multisig);
        address minter = makeAddr("minter");
        vm.prank(multisig);
        token.setAuthorizedMinter(minter);
        assertEq(token.authorizedMinter(), minter);
        vm.prank(minter);
        token.mint(makeAddr("to"), 100e18);
        assertEq(token.totalSupply(), 100e18);
    }
}

contract ImpactTokensTest is Test {
    function testTokenCount() public pure { assertEq(ImpactTokens.COUNT, 5); }
    function testSolarcoinInfo() public pure {
        ImpactTokens.TokenInfo memory i = ImpactTokens.getToken(0);
        assertEq(i.name, "Solarcoin"); assertEq(i.symbol, "SLR");
        assertEq(i.base, 0x4E9e4Ab99Cfc14B852f552f5Fb3Aa68617825B6c);
    }
    function testGetAddresses() public pure {
        address[] memory a = ImpactTokens.getAddresses();
        assertEq(a.length, 5);
    }
}

contract TokenManagementTest is Test {
    TokenRegistry registry;
    TokenOnboardingManager onboarding;
    MockERC20Simple tokenA;
    address admin = address(this);

    function setUp() public {
        registry = new TokenRegistry(admin);
        onboarding = new TokenOnboardingManager(registry, admin);
        tokenA = new MockERC20Simple("Token A", "TKA");
        registry.grantRole(registry.MANAGER_ROLE(), address(onboarding));
    }

    function testRegistryWhitelist() public {
        assertFalse(registry.isWhitelisted(address(tokenA)));
        registry.whitelist(address(tokenA));
        assertTrue(registry.isWhitelisted(address(tokenA)));
    }

    function testRegistryRemove() public {
        registry.whitelist(address(tokenA));
        registry.remove(address(tokenA));
        assertFalse(registry.isWhitelisted(address(tokenA)));
    }

    function testRegistryNotContract() public {
        vm.expectRevert(abi.encodeWithSelector(TokenRegistry.NotAContract.selector, address(0xDEAD)));
        registry.whitelist(address(0xDEAD));
    }

    function testOnboardingExecuteAfterDelay() public {
        onboarding.proposeAdd(address(tokenA), "ipfs://metadata");
        vm.expectRevert(abi.encodeWithSelector(TokenOnboardingManager.ProposalNotReady.selector, address(tokenA)));
        onboarding.execute(address(tokenA));
        vm.warp(block.timestamp + 3 days);
        onboarding.execute(address(tokenA));
        assertTrue(registry.isWhitelisted(address(tokenA)));
    }

    function testOnboardingExpired() public {
        onboarding.proposeAdd(address(tokenA), "ipfs://metadata");
        vm.warp(block.timestamp + 15 days);
        vm.expectRevert(abi.encodeWithSelector(TokenOnboardingManager.ProposalExpired.selector, address(tokenA)));
        onboarding.execute(address(tokenA));
    }
}

contract ShitDeployerTest is Test {
    function testConstructor() public {
        ShitDeployer d = new ShitDeployer();
        assertTrue(d.hasRole(d.DEFAULT_ADMIN_ROLE(), address(this)));
    }

    function testDeployCreate2() public {
        ShitDeployer d = new ShitDeployer();
        bytes memory code = abi.encodePacked(type(ERC20Mock).creationCode, abi.encode("T", "T", 18));
        address addr = d.deployCreate2(code, bytes32(uint256(1)));
        assertTrue(addr != address(0));
    }

    function testDeployCreate2RevertNotManager() public {
        ShitDeployer d = new ShitDeployer();
        vm.prank(makeAddr("no"));
        vm.expectRevert();
        d.deployCreate2("", bytes32(0));
    }
}

// ==================== STAKING TESTS ====================

contract ShitStakingTest is Test {
    ERC20Mock shit;
    ShitStaking staking;
    address multisig;

    function setUp() public {
        shit = new ERC20Mock("ROOT", "ROOT", 18);
        multisig = makeAddr("multisig");
        staking = new ShitStaking(address(shit), address(new TestPriceFeed()), address(new TestTreasuryPolicy()), multisig);
    }

    function testConstructor() public {
        assertEq(address(staking.shitToken()), address(shit));
        assertEq(staking.index(), 1e18);
    }

    function testStake() public {
        shit.mint(address(this), 100e18);
        shit.approve(address(staking), 100e18);
        uint256 st = staking.stake(100e18);
        assertEq(st, 100e18);
    }

    function testUnstake() public {
        shit.mint(address(this), 100e18);
        shit.approve(address(staking), 100e18);
        staking.stake(100e18);
        uint256 r = staking.unstake(50e18);
        assertEq(r, 50e18);
    }

    function testRebaseEmptySupply() public {
        vm.warp(block.timestamp + 8 hours + 1);
        staking.rebase();
        (, uint256 num, , ) = staking.epoch();
        assertEq(num, 1);
    }

    function testRebaseWithStaked() public {
        shit.mint(address(this), 100e18);
        shit.approve(address(staking), 100e18);
        staking.stake(100e18);
        shit.mint(address(staking), 10e18);
        vm.warp(block.timestamp + 8 hours + 1);
        staking.rebase();
        assertGt(staking.index(), 1e18);
    }

    function testPauseRevertNotMultisig() public {
        vm.expectRevert(MultisigGuard.NotMultisig.selector);
        staking.pause();
    }
}

contract WstSHITTest is Test {
    WstSHIT public wstShit;
    ERC20Mock public stShit;

    function setUp() public {
        stShit = new ERC20Mock("stSHIT", "stSHIT", 18);
        wstShit = new WstSHIT(address(stShit));
    }

    function testConstructor() public {
        assertEq(address(wstShit.stSHIT()), address(stShit));
        assertEq(wstShit.name(), "Wrapped staked SHIT");
    }

    function testWrap() public {
        stShit.mint(address(this), 100e18);
        stShit.approve(address(wstShit), 100e18);
        assertEq(wstShit.wrap(100e18), 100e18);
    }

    function testUnwrap() public {
        stShit.mint(address(this), 100e18);
        stShit.approve(address(wstShit), 100e18);
        wstShit.wrap(100e18);
        assertEq(wstShit.unwrap(50e18), 50e18);
    }
}

contract StakingWrapperTest is Test {
    ShitStaking public staking;
    ShitToken public shitToken;
    ShitPriceFeed public priceFeed;
    TreasuryValuation public treasuryPolicy;
    WstSHIT public wstShit;
    StakingAdapter public stakingAdapter;
    MockV3Pool public pool;
    address public safe = address(this);
    address public user = makeAddr("user");

    function setUp() public {
        shitToken = new ShitToken(safe);
        pool = new MockV3Pool();
        pool.setSqrtPriceX96(79228162514264337593543950336);
        pool.setObservationCardinality(2);
        int56[] memory cum = new int56[](2);
        cum[0] = 0; cum[1] = 100;
        pool.setTickCumulatives(cum);
        treasuryPolicy = new TreasuryValuation(safe);
        priceFeed = new ShitPriceFeed(address(pool), address(shitToken), address(treasuryPolicy), safe);
        Kernel kernel = new Kernel();
        kernel.executeAction(Actions.ChangeExecutor, safe);
        staking = new ShitStaking(address(shitToken), address(priceFeed), address(treasuryPolicy), safe);
        wstShit = new WstSHIT(address(staking));
        stakingAdapter = new StakingAdapter(address(shitToken), address(staking), address(wstShit));
        shitToken.mint(user, 1000e18);
        vm.startPrank(user);
        shitToken.approve(address(staking), type(uint256).max);
        shitToken.approve(address(stakingAdapter), type(uint256).max);
        staking.approve(address(wstShit), type(uint256).max);
        vm.stopPrank();
    }

    function testStakingAdapterStake() public {
        vm.prank(user);
        uint256 wst = stakingAdapter.stake(user, 100e18, false, false);
        assertEq(wst, 100e18);
    }

    function testStakingAdapterUnstake() public {
        vm.startPrank(user);
        uint256 wst = stakingAdapter.stake(user, 100e18, false, false);
        wstShit.approve(address(stakingAdapter), wst);
        uint256 r = stakingAdapter.unstake(user, wst, false, false);
        vm.stopPrank();
        assertEq(r, 100e18);
    }
}

// ==================== TREASURY TESTS ====================

contract TreasuryValuationTest is Test {
    TreasuryValuation policy;
    address multisig = makeAddr("multisig");

    function setUp() public { policy = new TreasuryValuation(multisig); }

    function testConstructor() public { assertEq(policy.multisig(), multisig); }

    function testSetValuations() public {
        vm.prank(multisig);
        policy.setValuations(100e6, 200e6, 1000e18);
        assertEq(policy.rfv(), 100e6);
        assertGt(policy.floorPrice(), 0);
    }

    function testEnforceRfvInvariantFail() public {
        vm.prank(multisig);
        policy.setValuations(1000e6, 1000e6, 10e18);
        vm.expectRevert(abi.encodeWithSelector(TreasuryValuation.RfvInvariantFailed.selector, 10000e6, 1000e6));
        policy.enforceRfvInvariant(100e18);
    }

    function testRfvBypass() public {
        vm.prank(multisig);
        policy.setValuations(1000e6, 1000e6, 10e18);
        vm.prank(multisig);
        policy.setRfvBypass(true);
        policy.enforceRfvInvariant(100e18);
    }
}

// ==================== ORACLE TESTS ====================

contract ShitPriceFeedTest is Test {
    ShitPriceFeed feed;
    MockV3Pool pool;

    function setUp() public {
        pool = new MockV3Pool();
        feed = new ShitPriceFeed(address(pool), address(0xA111), address(new MockTreasuryPolicyForFeed()), address(this));
    }

    function testSpotPrice() public {
        pool.setSqrtPriceX96(79228162514264337593543950336);
        assertApproxEqAbs(feed.spotPrice(), 1e18, 1e15);
    }

    function testFuzzSpotPrice(uint96 sqrt) public {
        vm.assume(sqrt > 0);
        pool.setSqrtPriceX96(uint160(sqrt));
        assertEq(feed.spotPrice(), (uint256(sqrt) * uint256(sqrt) * 1e18) >> 192);
    }
}

// ==================== BOND TESTS ====================

contract ShitInverseBondTest is Test {
    ShitInverseBond public inverseBond;
    ERC20Mock public shitToken;
    ERC20Mock public payoutToken;
    address public treasury = makeAddr("treasury");
    address public admin = makeAddr("admin");
    address public seller = makeAddr("seller");

    function setUp() public {
        shitToken = new ERC20Mock("SHIT", "SHIT", 18);
        payoutToken = new ERC20Mock("AZUSD", "AZUSD", 6);
        inverseBond = new ShitInverseBond(address(shitToken), address(payoutToken), treasury, admin);
    }

    function testConstructor() public {
        assertEq(address(inverseBond.shitToken()), address(shitToken));
    }

    function testSellSuccess() public {
        vm.prank(admin);
        inverseBond.updateNav(2e6, 1000000e6);
        shitToken.mint(seller, 100e18);
        payoutToken.mint(treasury, 100000e6);
        vm.prank(treasury);
        payoutToken.approve(address(inverseBond), type(uint256).max);
        vm.startPrank(seller);
        shitToken.approve(address(inverseBond), 100e18);
        uint256 payout = inverseBond.sell(100e18);
        vm.stopPrank();
        assertEq(payout, (100e18 * ((2e6 * 9850) / 10000)) / 1e18);
    }

    function testFuzzSellRespectsCapacity(uint256 shitAmount) public {
        ShitInverseBond bond = new ShitInverseBond(address(shitToken), address(payoutToken), treasury, admin);
        vm.prank(admin);
        bond.updateNav(2e18, 1e24);
        vm.assume(shitAmount > 0 && shitAmount < 1e20);
        uint256 payoutAmount = (shitAmount * bond.bondPrice()) / 1e18;
        vm.assume(payoutAmount <= bond.epochCapacity());
        shitToken.mint(address(this), shitAmount);
        shitToken.approve(address(bond), shitAmount);
        payoutToken.mint(treasury, payoutAmount * 2);
        vm.prank(treasury);
        payoutToken.approve(address(bond), payoutAmount * 2);
        uint256 before = payoutToken.balanceOf(address(this));
        bond.sell(shitAmount);
        assertEq(payoutToken.balanceOf(address(this)) - before, payoutAmount);
    }
}

// ==================== SECURITY TESTS ====================

contract MultisigGuardTest is Test {
    function testProposeTransfer() public {
        address ms = makeAddr("ms");
        TestMultisigGuard guard = new TestMultisigGuard(ms);
        vm.prank(ms);
        guard.proposeMultisigTransfer(makeAddr("new"));
        assertEq(guard.pendingMultisig(), makeAddr("new"));
    }

    function testCompleteTransfer() public {
        address ms = makeAddr("ms");
        TestMultisigGuard guard = new TestMultisigGuard(ms);
        vm.prank(ms);
        guard.proposeMultisigTransfer(makeAddr("new"));
        vm.warp(block.timestamp + 3 days + 1);
        guard.completeMultisigTransfer();
        assertEq(guard.multisig(), makeAddr("new"));
    }

    function testOnlyMultisigRevert() public {
        TestMultisigGuard guard = new TestMultisigGuard(makeAddr("ms"));
        vm.expectRevert(MultisigGuard.NotMultisig.selector);
        guard.protectedFunction();
    }
}

contract ShitCircuitBreakerTest is Test {
    ShitCircuitBreaker breaker;
    ShitDefenseBudget budget;
    ShitBondPricer pricer;
    CBMockPriceFeed priceFeed;
    CBMockTreasuryPolicy treasuryPolicy;
    CBMockOperator operator;
    ERC20Mock shit;
    ERC20Mock bucky;
    address multisig = address(this);
    address treasury = address(0xBEEF);

    function setUp() public {
        priceFeed = new CBMockPriceFeed();
        priceFeed.setPrice(1e18);
        treasuryPolicy = new CBMockTreasuryPolicy();
        treasuryPolicy.setRfv(1_000_000e18);
        operator = new CBMockOperator();
        shit = new ERC20Mock("SHIT", "SHIT", 18);
        bucky = new ERC20Mock("Bucky", "BUCKY", 18);
        breaker = new ShitCircuitBreaker(multisig);
        breaker.setBuckyToken(address(bucky));
        breaker.setPriceFeed(address(priceFeed));
        Kernel kernel = new Kernel();
        SHIT ProtocolRoles roles = new SHIT ProtocolRoles(kernel);
        kernel.executeAction(Actions.InstallModule, address(roles));
        budget = new ShitDefenseBudget(kernel, address(operator), treasury, address(shit), multisig);
        budget.updateLiquidTreasuryValue(1_000_000e18);
        kernel.executeAction(Actions.ActivatePolicy, address(budget));
        pricer = new ShitBondPricer(address(treasuryPolicy), multisig);
    }

    function testCBTripsOnDepeg() public {
        priceFeed.setPrice(0.97e18);
        vm.warp(block.timestamp + 8 hours + 1);
        breaker.check();
        assertTrue(breaker.tripped());
    }

    function testCBManualTrip() public {
        breaker.trip();
        assertTrue(breaker.tripped());
    }

    function testBudgetCurrentBudget() public { assertEq(budget.currentBudget(), 20_000e18); }

    function testBudgetExhausted() public {
        budget.recordSpending(20_000e18);
        assertFalse(budget.budgetAvailable());
    }

    function testPricerWellBacked() public {
        treasuryPolicy.setRfv(1_500_000e18);
        treasuryPolicy.setFloorPrice(1e18);
        assertEq(pricer.computeDiscount(1_000_000e18), 1000);
    }
}

// ==================== STABLECOIN TESTS ====================

contract ShitCollateralManagerTest is Test {
    Vat vat;
    Spotter spotter;
    Dog dog;
    ERC20Mock bucky;
    DaiJoin daiJoin;
    ShitCollateralManager manager;
    ERC20Mock usdc;
    MockOracle usdcOracle;
    LinearDecrease abacus;

    function setUp() public {
        vat = new Vat();
        spotter = new Spotter(address(vat));
        dog = new Dog(address(vat));
        bucky = new ERC20Mock("Bucky", "BUCKY", 18);
        daiJoin = new DaiJoin(address(vat), address(bucky));
        abacus = new LinearDecrease();
        abacus.file("tau", 3600);
        vat.rely(address(daiJoin));
        vat.rely(address(spotter));
        vat.rely(address(dog));
        manager = new ShitCollateralManager(
            address(vat), address(spotter), address(dog), address(daiJoin),
            address(bucky), address(this), address(abacus), address(this)
        );
        vat.rely(address(manager));
        spotter.rely(address(manager));
        usdc = new ERC20Mock("USDC", "USDC", 6);
        usdcOracle = new MockOracle(1e18);
    }

    function testAddStablecoinCollateral() public {
        manager.addCollateral(address(usdc), address(usdcOracle), 1e27, 10_000_000 * 1e45, true);
        ShitCollateralManager.CollateralInfo memory info = manager.getCollateralInfo(address(usdc));
        assertTrue(info.active);
        assertTrue(info.isStablecoin);
    }

    function testOraclePipAdapter() public {
        OraclePipAdapter adapter = new OraclePipAdapter(address(usdcOracle), address(usdc));
        (bytes32 val, bool has) = adapter.peek();
        assertTrue(has);
        assertEq(uint256(val), 1e18);
    }
}

contract ShitLiquidationKeeperTest is Test {
    ERC20Mock bucky;
    MockFlashSource flashSource;
    MockVat vat;
    MockDog dog;
    MockSwapRouter swapRouter;
    ShitLiquidationKeeper keeper;

    function setUp() public {
        bucky = new ERC20Mock("Bucky", "BCK", 18);
        flashSource = new MockFlashSource();
        vat = new MockVat();
        dog = new MockDog();
        swapRouter = new MockSwapRouter();
        keeper = new ShitLiquidationKeeper(
            address(bucky), address(flashSource), address(vat),
            address(dog), address(swapRouter), makeAddr("vow"), address(this)
        );
        flashSource.setKeeper(address(keeper));
        dog.setKeeper(address(keeper));
        swapRouter.setKeeper(address(keeper));
    }

    function testConstructor() public {
        assertEq(address(keeper.buckyToken()), address(bucky));
        assertTrue(keeper.hasRole(keeper.KEEPER_ROLE(), address(this)));
    }

    function testLiquidateWithCollateral() public {
        ERC20Mock col = new ERC20Mock("COL", "COL", 18);
        col.mint(address(keeper), 100e18);
        swapRouter.setReturnAmount(200e18);
        keeper.liquidate(bytes32("ETH"), makeAddr("urn"), 100e18, address(col), 0);
        assertEq(bucky.balanceOf(makeAddr("vow")), 100e18);
    }
}

contract CloneableAbacusTest is Test {
    function testAbacusInitialize() public {
        CloneableAbacus abacus = new CloneableAbacus();
        LinearDecrease linear = new LinearDecrease();
        linear.file("tau", 3600);
        abacus.initialize(bytes32("ETH-A"), address(linear), 1300);
        assertTrue(abacus.initialized());
        assertEq(abacus.chop(), 1300);
    }

    function testOSMReadAfterTwoPokes() public {
        CloneableOSM osm = new CloneableOSM();
        TestPriceSource src = new TestPriceSource(bytes32(uint256(2000e18)));
        osm.initialize(address(src), bytes32("ETH-A"));
        osm.poke(); osm.poke();
        assertEq(osm.read(), 2000e18);
    }
}

contract CloneableClipperTest is Test {
    CloneableClipper clipper;
    LinearDecrease abacus;

    function _setup() internal {
        clipper = new CloneableClipper();
        abacus = new LinearDecrease();
        abacus.file("tau", 3600);
        clipper.initialize(makeAddr("vat"), makeAddr("dog"), bytes32("ETH-A"), address(abacus), makeAddr("vow"));
    }

    function testInitialize() public {
        _setup();
        assertTrue(clipper.initialized());
    }

    function testKick() public {
        _setup();
        assertEq(clipper.kick(100e18, 50e18, makeAddr("usr"), makeAddr("kpr")), 1);
    }
}

contract CloneableGemJoinTest is Test {
    function testInitialize() public {
        CloneableGemJoin gj = new CloneableGemJoin();
        gj.initialize(makeAddr("vat"), bytes32("ilk"), makeAddr("gem"));
        assertTrue(gj.initialized());
    }

    function testJoinRevertNotInitialized() public {
        CloneableGemJoin gj = new CloneableGemJoin();
        vm.expectRevert(CloneableGemJoin.NotInitialized.selector);
        gj.join(makeAddr("usr"), 100e18);
    }
}

contract StablecoinIntegrationTest is Test {
    function testFixedRateProvider() public {
        assertEq((new FixedRateProvider()).getConversionRate(), 1e27);
    }

    function testTreasuryIntegrationConstructor() public {
        ShitTreasuryIntegration ti = new ShitTreasuryIntegration(address(this));
        assertTrue(ti.hasRole(ti.EXECUTOR_ROLE(), address(this)));
    }

    function testImpactOracleAddToken() public {
        ImpactOracleAdapter oracle = new ImpactOracleAdapter(address(this));
        oracle.addToken(makeAddr("token"), makeAddr("pool"), false);
        (address p, , uint32 twap, bool active) = oracle.tokenConfigs(makeAddr("token"));
        assertEq(p, makeAddr("pool"));
        assertEq(twap, 1800);
        assertTrue(active);
    }
}

// ==================== REFERRAL TESTS ====================

contract ReferralRegistryTest is Test {
    ReferralRegistry public registry;
    ReferralRegistry public impl;
    ERC20Mock public token;
    MockHedgeyClaimCampaigns public hedgey;
    address public multisig = makeAddr("multisig");
    address public referrer = makeAddr("referrer");
    address public user = makeAddr("user");
    address public feeSource = makeAddr("feeSource");
    bytes16 constant CAMPAIGN_ID = bytes16(uint128(1));

    function setUp() public {
        impl = new ReferralRegistry();
        bytes memory initData = abi.encodeWithSelector(ReferralRegistry.initialize.selector, multisig);
        bytes memory code = abi.encodePacked(type(ERC1967Proxy).creationCode, abi.encode(address(impl), initData));
        address proxy;
        assembly { proxy := create(0, add(code, 0x20), mload(code)) }
        registry = ReferralRegistry(proxy);
        token = new ERC20Mock("Test Token", "TST", 18);
        hedgey = new MockHedgeyClaimCampaigns();
        vm.prank(multisig);
        registry.setFeeSource(feeSource, true);
        token.mint(feeSource, 1_000_000e18);
        token.mint(multisig, 1_000_000e18);
        vm.prank(multisig);
        registry.createProject(1000, 3000, 5000);
        vm.prank(referrer);
        registry.createReferralAccount(0, 0);
        vm.prank(user);
        registry.bindToReferrer(referrer);
    }

    function testBindToReferrer() public {
        assertEq(registry.getReferrerOf(user), referrer);
    }

    function testRecordFee() public {
        vm.startPrank(feeSource);
        token.transfer(address(registry), 100e18);
        registry.recordFee(user, address(token), 100e18);
        vm.stopPrank();
        assertEq(registry.getPendingFees(referrer, address(token)), 7e18);
    }

    function testClaimFees() public {
        vm.startPrank(feeSource);
        token.transfer(address(registry), 100e18);
        registry.recordFee(user, address(token), 100e18);
        vm.stopPrank();
        uint256 before = token.balanceOf(referrer);
        vm.prank(referrer);
        registry.claimFees(address(token));
        assertEq(token.balanceOf(referrer) - before, 7e18);
    }

    function testUpgrade() public {
        ReferralRegistry newImpl = new ReferralRegistry();
        vm.prank(multisig);
        registry.upgradeTo(address(newImpl));
        assertEq(registry.getReferrerOf(user), referrer);
    }
}

// ==================== DEPLOYMENT FLOW TESTS ====================

contract DeploymentFlowTest is Test {
    ShitToken public shitToken;
    Kernel public kernel;
    TreasuryValuation public treasuryPolicy;
    address public safe = makeAddr("safe");
    address public deployer = vm.addr(0xA11CE);

    function setUp() public {
        vm.startPrank(deployer);
        shitToken = new ShitToken(safe);
        kernel = new Kernel();
        kernel.executeAction(Actions.ChangeExecutor, safe);
        treasuryPolicy = new TreasuryValuation(safe);
        vm.stopPrank();
    }

    function testAllContractsDeployed() public view {
        assertTrue(address(shitToken) != address(0));
        assertTrue(address(kernel) != address(0));
        assertTrue(address(treasuryPolicy) != address(0));
    }

    function testSafeCanMintShit() public {
        vm.prank(safe);
        shitToken.mint(deployer, 1000e18);
        assertEq(shitToken.balanceOf(deployer), 1000e18);
    }

    function testDeployerCannotMint() public {
        vm.prank(deployer);
        vm.expectRevert();
        shitToken.mint(deployer, 1000e18);
    }

    function testMaxSupplyEnforced() public {
        vm.prank(safe);
        shitToken.mint(deployer, 100_000_000e18);
        vm.prank(safe);
        vm.expectRevert(ShitToken.MaxSupplyExceeded.selector);
        shitToken.mint(deployer, 1);
    }
}
