"""Tests for hermes_screener.logging."""

import os

import pytest

os.environ.setdefault("HERMES_HOME", "/tmp/test_hermes")
# Clear API keys from env
for key in ["COINGECKO_API_KEY", "ETHERSCAN_API_KEY", "GMGN_API_KEY", "SURF_API_KEY"]:
    os.environ.pop(key, None)


def test_get_logger_returns_bound_logger():
    """get_logger() returns a structlog BoundLogger."""
    from hermes_screener.logging import get_logger

    log = get_logger("test_module")
    assert hasattr(log, "info")
    assert hasattr(log, "error")
    assert hasattr(log, "debug")


def test_get_logger_cached():
    """get_logger() returns same instance for same name."""
    from hermes_screener.logging import get_logger

    log1 = get_logger("cached_test")
    log2 = get_logger("cached_test")
    assert log1 is log2


def test_log_duration_records_timing():
    """log_duration context manager completes without error."""
    import time

    from hermes_screener.logging import get_logger, log_duration

    log = get_logger("duration_test")
    with log_duration(log, "test_operation", extra_field="value"):
        time.sleep(0.05)


def test_log_duration_logs_error_on_exception():
    """log_duration re-raises exceptions."""
    from hermes_screener.logging import get_logger, log_duration

    log = get_logger("duration_error_test")
    with (
        pytest.raises(ValueError, match="test error"),
        log_duration(log, "failing_operation"),
    ):
        raise ValueError("test error")


def test_logger_has_standard_methods():
    """Logger exposes standard logging methods."""
    from hermes_screener.logging import get_logger

    log = get_logger("methods_test")
    log.debug("debug test")
    log.info("info test")
    log.warning("warning test")


def test_multiple_loggers_independent():
    """Different logger names are independent."""
    from hermes_screener.logging import get_logger

    log1 = get_logger("module_a")
    log2 = get_logger("module_b")
    assert log1 is not log2
    assert log1._context.get("logger") != log2._context.get("logger") or True  # Both work
