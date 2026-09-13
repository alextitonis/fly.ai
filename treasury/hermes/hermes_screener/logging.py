"""
Structured JSON logging with optional Prometheus integration.

Provides a `get_logger(name)` function that returns a structlog logger
configured for either:
  - JSON output (for production/cron — parseable by jq, Loki, etc.)
  - Rich console output (for interactive development)

Every log entry includes: timestamp, level, logger name, and optional
context fields (token_address, layer, chain, duration_ms, etc.).

Usage:
    from hermes_screener.logging import get_logger
    log = get_logger("token_enricher")
    log.info("enrichment_complete", token="So111...", score=87.5, layers_ok=9)
"""

from __future__ import annotations

import logging
import sys
import time
from collections.abc import Iterator
from contextlib import contextmanager
from functools import lru_cache
from typing import Any

import structlog
from structlog.types import EventDict, Processor

from hermes_screener.config import settings


def _add_service_context(_, __, event_dict: EventDict) -> EventDict:
    """Inject static fields into every log entry."""
    event_dict.setdefault("service", "hermes-token-screener")
    event_dict.setdefault("version", "9.0.0")
    return event_dict


def _drop_color_message(_, __, event_dict: EventDict) -> EventDict:
    """Remove duplicate 'color_message' field from uvicorn/hypercorn noise."""
    event_dict.pop("color_message", None)
    return event_dict


def _setup_stdlib_logging() -> None:
    """Configure the root stdlib logger to route through structlog."""
    root = logging.getLogger()
    root.setLevel(getattr(logging, settings.log_level))

    # Clear existing handlers
    root.handlers.clear()

    # Console handler
    console = logging.StreamHandler(sys.stdout)
    console.setLevel(getattr(logging, settings.log_level))
    root.addHandler(console)

    # File handler (if enabled)
    if settings.log_file_enabled:
        log_file = settings.log_dir / "token_screener.json.log"
        log_file.parent.mkdir(parents=True, exist_ok=True)
        fh = logging.FileHandler(str(log_file))
        fh.setLevel(getattr(logging, settings.log_level))
        root.addHandler(fh)

    # Silence noisy libraries
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("requests").setLevel(logging.WARNING)
    logging.getLogger("telethon").setLevel(logging.WARNING)


def _configure_structlog() -> None:
    """Configure structlog with JSON or Rich renderer."""
    shared_processors: list[Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
        _add_service_context,
        _drop_color_message,
    ]

    if settings.log_json:
        # Production: JSON lines (parseable by jq, Loki, ELK)
        renderer: Processor = structlog.processors.JSONRenderer(ensure_ascii=False)
    else:
        # Development: Rich console with colors
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    # Formatter for stdlib handlers
    formatter = structlog.stdlib.ProcessorFormatter(
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )

    root = logging.getLogger()
    for handler in root.handlers:
        handler.setFormatter(formatter)


@lru_cache(maxsize=64)
def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """Get a named structlog logger. Cached per name."""
    return structlog.get_logger(name)  # type: ignore[no-any-return]


@contextmanager
def log_duration(log: structlog.stdlib.BoundLogger, event: str, **extra: Any) -> Iterator[None]:
    """Context manager that logs duration_ms when the block exits.

    Usage:
        with log_duration(log, "dexscreener_fetch", token_count=50):
            fetch_data()
    """
    start = time.monotonic()
    try:
        yield
    except Exception as exc:
        duration_ms = (time.monotonic() - start) * 1000
        log.error(event, duration_ms=round(duration_ms, 1), error=str(exc), **extra)
        raise
    else:
        duration_ms = (time.monotonic() - start) * 1000
        log.info(event, duration_ms=round(duration_ms, 1), **extra)


# ── Module init ───────────────────────────────────────────────────────────────
_setup_stdlib_logging()
_configure_structlog()
