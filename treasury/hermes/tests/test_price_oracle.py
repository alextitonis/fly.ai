from hermes_screener.trading.portfolio_registry import TokenSpec
from hermes_screener.trading.price_oracle import PriceOracle


def test_oracle_stablecoin_fallback(tmp_path):
    oracle = PriceOracle(tmp_path / "price_cache.json")
    tokens = [
        TokenSpec("USDC", "base", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", 6),
        TokenSpec("USDT", "solana", "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", 6),
    ]
    prices = oracle.get_prices(tokens)
    assert 0.95 <= prices["USDC"] <= 1.05
    assert 0.95 <= prices["USDT"] <= 1.05
