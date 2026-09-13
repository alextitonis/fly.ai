from hermes_screener.trading.portfolio_registry import PortfolioRegistry, TokenSpec


def test_registry_upsert_and_load(tmp_path):
    path = tmp_path / "portfolio_tokens.json"
    r = PortfolioRegistry(path)

    r.upsert(TokenSpec("USDC", "base", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", 6))
    r.upsert(TokenSpec("SOL", "solana", "So11111111111111111111111111111111111111112", 9))

    items = r.load()
    assert len(items) == 2
    assert any(x.symbol == "USDC" and x.chain == "base" for x in items)


def test_registry_remove(tmp_path):
    path = tmp_path / "portfolio_tokens.json"
    r = PortfolioRegistry(path)
    r.save(
        [
            TokenSpec("USDC", "base", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", 6),
            TokenSpec("SOL", "solana", "So11111111111111111111111111111111111111112", 9),
        ]
    )

    r.remove("base", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913")
    items = r.load()
    assert len(items) == 1
    assert items[0].symbol == "SOL"
