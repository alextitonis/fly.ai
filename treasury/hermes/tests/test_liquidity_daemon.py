from types import SimpleNamespace

from hermes_screener.trading.liquidity_daemon import LiquidityDaemon
from hermes_screener.trading.portfolio_registry import TokenSpec


class _FakeContractExecutor:
    def __init__(self):
        self.calls = []

    def smart_swap(self, **kwargs):
        self.calls.append(kwargs)
        return "0xabc"


class _FakeSolanaAdapter:
    def __init__(self):
        self.balance_map = {}
        self.swap_calls = []

    def get_token_balance(self, mint):
        return self.balance_map.get(mint, 0)

    def swap(self, input_mint, output_mint, amount, slippage_bps=100):
        self.swap_calls.append((input_mint, output_mint, amount, slippage_bps))
        return "sig123"


class _FakeTrader:
    def __init__(self):
        self.evm_account = SimpleNamespace(address="0x1111111111111111111111111111111111111111")
        self.solana_keypair = SimpleNamespace(pubkey=lambda: "So1FakePubkey")
        self.contract_executor = _FakeContractExecutor()
        self.solana_adapter = _FakeSolanaAdapter()

    def get_evm_balance(self):
        return 1.0

    def get_solana_balance(self):
        return 2.0

    def get_pool_info(self, *_args, **_kwargs):
        return {"apr": 12.0, "liquidity": 1_000_000}

    def get_token_balance(self, token_address, chain="base"):
        if chain == "base" and token_address.lower().endswith("2913"):
            return 1000.0
        return 0.0

    def get_token_address(self, symbol, chain):
        mapping = {
            ("WETH", "base"): "0x4200000000000000000000000000000000000006",
            ("USDC", "base"): "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            ("SOL", "solana"): "So11111111111111111111111111111111111111112",
            ("USDC", "solana"): "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            ("BONK", "solana"): "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
        }
        return mapping.get((symbol.upper(), chain))

    def compare_quotes(self, *_args, **_kwargs):
        return {"kyberswap": {"output": "10"}}


def test_cycle_reports_no_opportunities(monkeypatch):
    daemon = LiquidityDaemon(loop_seconds=1)
    daemon.trader = _FakeTrader()

    def _empty_opps():
        return []

    daemon.protocol_executor = __import__(
        "hermes_screener.trading.protocol_liquidity_executor", fromlist=["ProtocolLiquidityExecutor"]
    ).ProtocolLiquidityExecutor(daemon.trader, live_deploy=False)

    monkeypatch.setattr(daemon, "collect_opportunities", _empty_opps)
    out = daemon.run_cycle()
    assert out["status"] == "no-opportunities"


def test_cycle_executes_plan(monkeypatch):
    daemon = LiquidityDaemon(loop_seconds=1)
    daemon.trader = _FakeTrader()
    daemon.protocol_executor = __import__(
        "hermes_screener.trading.protocol_liquidity_executor", fromlist=["ProtocolLiquidityExecutor"]
    ).ProtocolLiquidityExecutor(daemon.trader, live_deploy=False)

    monkeypatch.setattr(daemon, "collect_balances", lambda: {"USDC": 1000.0, "SOL": 0.0, "WETH": 0.0})
    monkeypatch.setattr(daemon, "collect_prices", lambda: {"USDC": 1.0, "SOL": 150.0, "WETH": 3000.0})
    monkeypatch.setattr(
        daemon,
        "collect_opportunities",
        lambda: [
            # No dual routes so all USDC must use single-asset route.
            __import__("hermes_screener.trading.liquidity_manager", fromlist=["PoolOpportunity"]).PoolOpportunity(
                id="kamino-usdc-single",
                protocol="kamino",
                chain="solana",
                token_a="USDC",
                token_b=None,
                apr=0.08,
                supports_single_sided=True,
                max_allocation_usd=2000,
            )
        ],
    )

    # target config exists => protocol executor can dry-run success
    daemon.protocol_executor.targets_path.parent.mkdir(parents=True, exist_ok=True)
    daemon.protocol_executor.targets_path.write_text(
        '[{"id":"kamino-usdc-single","protocol":"kamino","chain":"solana","strategy":"dummy"}]'
    )

    out = daemon.run_cycle()
    assert out["status"] == "ok"
    assert out["actions"] >= 1
    assert out["utilization_pct"] >= 99.0
    assert any(item["ok"] for item in out["executed"])


def test_collect_balances_reads_tracked_tokens(tmp_path):
    daemon = LiquidityDaemon(loop_seconds=1)
    daemon.trader = _FakeTrader()
    daemon.protocol_executor = __import__(
        "hermes_screener.trading.protocol_liquidity_executor", fromlist=["ProtocolLiquidityExecutor"]
    ).ProtocolLiquidityExecutor(daemon.trader, live_deploy=False)
    daemon.registry.path = tmp_path / "portfolio_tokens.json"
    daemon.registry.save(
        [
            TokenSpec("WETH", "base", "0x4200000000000000000000000000000000000006", 18),
            TokenSpec("USDC", "base", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", 6),
            TokenSpec("SOL", "solana", "So11111111111111111111111111111111111111112", 9),
            TokenSpec("BONK", "solana", "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", 5),
        ]
    )
    daemon.trader.solana_adapter.balance_map["DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"] = 123_000

    balances = daemon.collect_balances()
    assert balances["WETH"] == 1.0
    assert balances["SOL"] == 2.0
    assert balances["USDC"] == 1000.0
    assert balances["BONK"] == 1.23


def test_execute_base_swap_uses_contract_executor(tmp_path):
    daemon = LiquidityDaemon(loop_seconds=1)
    daemon.trader = _FakeTrader()
    daemon.protocol_executor = __import__(
        "hermes_screener.trading.protocol_liquidity_executor", fromlist=["ProtocolLiquidityExecutor"]
    ).ProtocolLiquidityExecutor(daemon.trader, live_deploy=False)
    daemon.registry.path = tmp_path / "portfolio_tokens.json"
    daemon.registry.save(
        [
            TokenSpec("WETH", "base", "0x4200000000000000000000000000000000000006", 18),
            TokenSpec("USDC", "base", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", 6),
        ]
    )

    ok = daemon._execute_base_swap("WETH", "USDC", 0.1)
    assert ok is True
    assert len(daemon.trader.contract_executor.calls) == 1


def test_execute_solana_swap_uses_adapter(tmp_path):
    daemon = LiquidityDaemon(loop_seconds=1)
    daemon.trader = _FakeTrader()
    daemon.protocol_executor = __import__(
        "hermes_screener.trading.protocol_liquidity_executor", fromlist=["ProtocolLiquidityExecutor"]
    ).ProtocolLiquidityExecutor(daemon.trader, live_deploy=False)
    daemon.registry.path = tmp_path / "portfolio_tokens.json"
    daemon.registry.save(
        [
            TokenSpec("SOL", "solana", "So11111111111111111111111111111111111111112", 9),
            TokenSpec("USDC", "solana", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", 6),
        ]
    )

    ok = daemon._execute_solana_swap("SOL", "USDC", 0.5)
    assert ok is True
    assert len(daemon.trader.solana_adapter.swap_calls) == 1
