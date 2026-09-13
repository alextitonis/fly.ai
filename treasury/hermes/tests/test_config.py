"""Tests for hermes_screener.config."""

import os
from pathlib import Path

# Prevent loading real .env during tests
os.environ["HERMES_HOME"] = "/tmp/test_hermes"
# Clear any real API keys that leak through env
for key in [
    "COINGECKO_API_KEY",
    "ETHERSCAN_API_KEY",
    "DEFI_API_KEY",
    "RUGCHECK_API_KEY",
    "GMGN_API_KEY",
    "SURF_API_KEY",
    "ALCHEMY_API_KEY",
    "HELIUS_API_KEY",
    "QUICKNODE_KEY",
    "LOG_LEVEL",
]:
    os.environ.pop(key, None)


def _fresh(**kw):
    """Create Settings with no env file."""
    from hermes_screener.config import Settings

    return Settings(hermes_home=kw.pop("hermes_home", "/tmp/test_hermes"), _env_file=None, **kw)


def test_defaults():
    s = _fresh()
    assert s.top_n == 1200
    assert s.max_enrich == 2000
    assert s.min_channels == 1
    assert s.request_timeout == 15
    assert s.log_level == "INFO"
    assert s.metrics_port == 9090


def test_computed_paths():
    s = _fresh(hermes_home="/tmp/test_hermes")
    assert s.db_path == Path("/tmp/test_hermes/data/central_contracts.db")
    assert s.wallets_db_path == Path("/tmp/test_hermes/data/wallet_tracker.db")
    assert s.output_path == Path("/tmp/test_hermes/data/token_screener/top100.json")
    assert s.log_dir == Path("/tmp/test_hermes/logs")


def test_api_keys_empty_by_default():
    s = _fresh()
    assert s.etherscan_api_key == ""
    assert s.gmgn_api_key == ""


def test_env_override(tmp_path):
    from hermes_screener.config import Settings

    env_file = tmp_path / ".env"
    s = Settings(hermes_home=tmp_path, _env_file=str(env_file))
    assert s.top_n == 50
    assert s.max_enrich == 100
    assert s.log_level == "DEBUG"


def test_ensure_dirs(tmp_path):
    s = _fresh(hermes_home=tmp_path)
    s.ensure_dirs()
    assert (tmp_path / "data").exists()
    assert (tmp_path / "data" / "token_screener").exists()
    assert (tmp_path / "logs").exists()


def test_api_key_masked():
    s = _fresh()
    assert s.api_key_masked("nonexistent_key") == "<empty>"

    s2 = _fresh()
    assert s2.api_key_masked() == "***"

    s3 = _fresh()
    assert s3.api_key_masked() == "abcd...mnop"


def test_scoring_weights_sum():
    s = _fresh()
    total = s.w_channel + s.w_freshness + s.w_low_fdv + s.w_volume + s.w_txns + s.w_momentum
    assert total == 100.0


def test_thresholds():
    s = _fresh()
    assert s.sell_ratio_threshold == 0.70
    assert s.stagnant_volume_ratio == 0.01
    assert s.no_activity_hours == 6
    assert s.holders_per_token == 1000


def test_telegram_defaults():
    s = _fresh()
    assert s.tg_api_id == 39533004
    assert len(s.tg_api_hash) > 0
    assert s.telegram_bot_token == ""


def test_ensure_dirs_idempotent(tmp_path):
    s = _fresh(hermes_home=tmp_path)
    s.ensure_dirs()
    s.ensure_dirs()  # second call should not error
    assert (tmp_path / "logs").exists()
