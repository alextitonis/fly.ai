#!/usr/bin/env python3
"""
Trading Daemon - Runs all trading and screener components continuously.

Components:
1. AI Trading Brain - token analysis & trade decisions (every 10 min)
2. Trade Monitor - position monitoring (every 1 min)
3. Copytrade Monitor - smart money tracking (every 60 min)
4. Token Enricher - enriches discovered tokens (every 5 min)
5. Token Discovery - discovers new tokens (every 30 min)

Usage: python3 trading_daemon.py [--dry-run]
"""
import subprocess
import os
import sys
import time
import signal
import logging
from datetime import datetime
from pathlib import Path

# Configure logging
LOG_DIR = Path.home() / ".hermes" / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    handlers=[
        logging.FileHandler(LOG_DIR / "trading_daemon.log"),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("TradingDaemon")

# Scripts
SCRIPTS_DIR = Path.home() / ".hermes" / "scripts"
AI_BRAIN = SCRIPTS_DIR / "ai_trading_brain.py"
TRADE_MONITOR = SCRIPTS_DIR / "trade_monitor.py"
COPYTRADE_MONITOR = SCRIPTS_DIR / "copytrade_monitor.py"
TOKEN_ENRICHER = SCRIPTS_DIR / "token_enricher.py"
TOKEN_DISCOVERY = SCRIPTS_DIR / "token_discovery.py"

# Intervals (seconds)
AI_BRAIN_INTERVAL = 100  # 100 seconds
TRADE_MONITOR_INTERVAL = 60  # 1 minute
COPYTRADE_INTERVAL = 3600  # 60 minutes
ENRICHER_INTERVAL = 100  # 100 seconds
DISCOVERY_INTERVAL = 1800  # 30 minutes

# Timeouts (seconds)
TOKEN_ENRICHER_TIMEOUT = int(os.getenv("TOKEN_ENRICHER_TIMEOUT", "2400"))  # 40 minutes default

# State
running = True
dry_run = "--dry-run" in sys.argv

def _cap_log_file(path: str, max_bytes: int = 1_073_741_824, keep_bytes: int = 104_857_600):
    """If log exceeds max_bytes, truncate to keep_bytes from the end."""
    try:
        p = Path(path)
        if p.exists() and p.stat().st_size > max_bytes:
            with open(p, "rb") as f:
                f.seek(-keep_bytes, 2)
                tail = f.read()
            with open(p, "wb") as f:
                f.write(tail)
            logger.info(f"[LogCap] Truncated {path} to last {keep_bytes} bytes")
    except Exception:
        pass

def signal_handler(signum, frame):
    global running
    logger.info(f"Received signal {signum}, shutting down...")
    running = False

signal.signal(signal.SIGTERM, signal_handler)
signal.signal(signal.SIGINT, signal_handler)

def run_script(
    script_path: Path,
    name: str,
    execute: bool = True,
    use_flock: bool = False,
    timeout: int = 1800,
    log_file: str = None,
    extra_args: list = None,
) -> bool:
    """Run a script and return success status."""
    try:
        cmd = []

        # Add flock if requested (like cron does)
        if use_flock:
            cmd.append("flock")
            cmd.append("-n")
            cmd.append(f"{script_path}.lock")

        cmd.append(str(script_path))
        if extra_args:
            cmd.extend(extra_args)

        logger.info(f"[{name}] Running...")

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )

        if result.returncode != 0:
            logger.warning(f"[{name}] Exit code {result.returncode}")
            if result.stderr:
                logger.error(f"[{name}] Error: {result.stderr.strip()}")
            return False

        if result.stdout:
            logger.info(f"[{name}] Output: {result.stdout.strip()}")
        logger.info(f"[{name}] Completed successfully")
        return True

    except subprocess.TimeoutExpired:
        logger.warning(f"[{name}] Timeout after {timeout} seconds")
        return False
    except Exception as e:
        logger.error(f"[{name}] Exception: {str(e)}")
        return False

def main():
    logger.info("=" * 60)
    logger.info("Trading Daemon starting")
    logger.info(f"Dry run: {dry_run}")
    logger.info(f"AI Brain interval: {AI_BRAIN_INTERVAL}s")
    logger.info(f"Trade Monitor interval: {TRADE_MONITOR_INTERVAL}s")
    logger.info(f"Copytrade interval: {COPYTRADE_INTERVAL}s")
    logger.info(f"Token Enricher interval: {ENRICHER_INTERVAL}s")
    logger.info(f"Token Discovery interval: {DISCOVERY_INTERVAL}s")
    logger.info("=" * 60)

    # Main loop
    while running:
        start_time = time.time()

        try:
            # Run AI Brain
            if time.time() - start_time > AI_BRAIN_INTERVAL:
                run_script(AI_BRAIN, "AI Brain")

            # Run Trade Monitor
            run_script(TRADE_MONITOR, "Trade Monitor", timeout=120)

            # Run Copytrade Monitor
            if time.time() - start_time > COPYTRADE_INTERVAL:
                run_script(COPYTRADE_MONITOR, "Copytrade", timeout=300)

            # Run Token Enricher
            run_script(TOKEN_ENRICHER, "Token Enricher", timeout=TOKEN_ENRICHER_TIMEOUT)

            # Run Token Discovery
            if time.time() - start_time > DISCOVERY_INTERVAL:
                run_script(TOKEN_DISCOVERY, "Token Discovery")

        except Exception as e:
            logger.error(f"Unexpected error in main loop: {str(e)}")

        # Sleep to maintain intervals
        time.sleep(1)

    logger.info("Trading Daemon shutting down...")

if __name__ == "__main__":
    main()