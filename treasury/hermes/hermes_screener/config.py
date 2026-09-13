"""
Centralized configuration using Pydantic Settings.

All environment variables, paths, thresholds, and API keys are defined here.
Each script imports `settings` from this module instead of scattering os.getenv().

Usage:
    from hermes_screener.config import settings

    db_path = settings.db_path
"""

from __future__ import annotations

from pathlib import Path
from os import environ

from pydantic import Field, computed_field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Centralized settings loaded from .env + environment + defaults (in that priority)."""

    model_config = SettingsConfigDict(
        env_file=Path.home() / ".hermes" / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Paths ────────────────────────────────────────────────────────────────
    hermes_home: Path = Field(
        default_factory=lambda: Path(environ.get("HERMES_HOME", str(Path.home() / ".hermes"))),
    )

    @computed_field  # type: ignore[misc]
    @property
    def db_path(self) -> Path:
        return self.hermes_home / "data" / "central_contracts.db"

    @computed_field  # type: ignore[misc]
    @property
    def wallets_db_path(self) -> Path:
        return self.hermes_home / "data" / "wallet_tracker.db"

    @computed_field  # type: ignore[misc]
    @property
    def output_path(self) -> Path:
        return self.hermes_home / "data" / "token_screener" / "top100.json"

    @computed_field  # type: ignore[misc]
    @property
    def log_dir(self) -> Path:
        return self.hermes_home / "logs"

    @computed_field  # type: ignore[misc]
    @property
    def session_path(self) -> Path:
        return self.hermes_home / ".telegram_session" / "hermes_user"

    @computed_field  # type: ignore[misc]
    @property
    def state_file(self) -> Path:
        return self.hermes_home / "data" / "tg_scraper_state.json"

    gmgn_cli: Path = Field(
        default_factory=lambda: Path(environ.get("HERMES_HOME", str(Path.home() / ".hermes"))) / "gmgn-cli" / "dist" / "index.js",
    )

    # ── Telegram ─────────────────────────────────────────────────────────────
    tg_api_id: int = Field(default=39533004)
    tg_api_hash: str = Field(default="958e52889177eec2fa15e9e4e4c2cc4c")

    # ── API Keys (all optional — graceful degradation) ───────────────────────
    # pydantic-settings auto-maps UPPER_SNAKE_CASE env vars to snake_case fields
    etherscan_api_key: str = Field(default="")
    defi_api_key: str = Field(default="")
    rugcheck_api_key: str = Field(default="")
    rugcheck_shield_key: str = Field(default="")
    gmgn_api_key: str = Field(default="")
    surf_api_key: str = Field(default="")
    alchemy_api_key: str = Field(default="")
    helius_api_key: str = Field(default="")
    solscan_api_key: str = Field(default="")
    birdeye_api_key: str = Field(default="")
    coinstats_api_key: str = Field(default="")
    quicknode_key: str = Field(default="")
    zerion_api_key: str = Field(default="zk_8acbcf31cbe241cc8523f8e3362c8e97")
    goldrush_api_key: str = Field(default="")
    bitquery_api_key: str = Field(default="")
    goldsky_api_key: str = Field(default="")
    telegram_bot_token: str = Field(default="")
    telegram_chat_id: str = Field(default="")

    # ── Screener Tuning ──────────────────────────────────────────────────────
    top_n: int = Field(default=100)
    max_enrich: int = Field(default=2000)
    min_channels: int = Field(default=1)

    # ── Scoring Weights ──────────────────────────────────────────────────────
    w_channel: float = Field(default=25.0)
    w_freshness: float = Field(default=15.0)
    w_low_fdv: float = Field(default=15.0)
    w_volume: float = Field(default=20.0)
    w_txns: float = Field(default=15.0)
    w_momentum: float = Field(default=10.0)

    # ── Thresholds ───────────────────────────────────────────────────────────
    sell_ratio_threshold: float = Field(default=0.70)
    stagnant_volume_ratio: float = Field(default=0.01)
    no_activity_hours: int = Field(default=6)

    # ── Wallet Tracker ───────────────────────────────────────────────────────
    holders_per_token: int = Field(default=1000)
    wallet_min_score: float = Field(default=30.0)

    # ── Network ──────────────────────────────────────────────────────────────
    request_timeout: int = Field(default=15)
    request_retries: int = Field(default=3)
    rate_limit_delay: float = Field(default=1.0)

    # ── Prometheus / Metrics ─────────────────────────────────────────────────
    metrics_port: int = Field(default=9091)
    metrics_enabled: bool = Field(default=True)

    # ── Logging ──────────────────────────────────────────────────────────────
    log_level: str = Field(default="INFO")
    log_json: bool = Field(default=True)
    log_file_enabled: bool = Field(default=True)

    @field_validator("hermes_home", "gmgn_cli", mode="before")
    @classmethod
    def expand_path(cls, v: str | Path) -> Path:
        return Path(v).expanduser().resolve()

    @field_validator("log_level")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        allowed = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        v_upper = v.upper()
        if v_upper not in allowed:
            raise ValueError(f"log_level must be one of {allowed}, got {v}")
        return v_upper

    def ensure_dirs(self) -> None:
        """Create required directories (idempotent)."""
        required_dirs = [
            self.log_dir,
            self.output_path.parent,
            self.db_path.parent,
            self.session_path.parent,
            self.state_file.parent,
        ]
        for d in required_dirs:
            d.mkdir(parents=True, exist_ok=True)

    def api_key_masked(self, field_name: str) -> str:
        """Return masked version of an API key for safe logging."""
        val = getattr(self, field_name, None)
        if val is None:
            val = self.model_dump().get(field_name, "")
        val = str(val) if val else ""
        if not val or len(val) < 8:
            return "***" if val else "<empty>"
        return f"{val[:4]}...{val[-4:]}"


# Singleton — import this everywhere
settings = Settings()
settings.ensure_dirs()
