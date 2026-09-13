"""Shared utility helpers for Hermes scripts.

Consolidates common patterns used across multiple scripts to avoid duplication:
- gmgn_cmd: Run gmgn-cli and return parsed JSON (was copy-pasted in 4 scripts)
- find_node: Locate the node binary (was only in wallet_tracker)
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

from hermes_screener.config import settings

# Cached node binary path
_NODE_BIN: str | None = None


JsonValue = dict[str, "JsonValue"] | list["JsonValue"] | str | int | float | bool | None


def find_node() -> str:
    """Locate the node binary, caching the result."""
    global _NODE_BIN
    if _NODE_BIN:
        return _NODE_BIN
    node = shutil.which("node")
    if node:
        _NODE_BIN = node
        return node
    for candidate in [
        str(Path.home() / ".local" / "bin" / "node"),
        "/usr/local/bin/node",
        "/usr/bin/node",
    ]:
        if Path(candidate).is_file():
            _NODE_BIN = candidate
            return candidate
    _NODE_BIN = "node"
    return "node"


def gmgn_cmd(
    args: list[str],
    *,
    gmgn_cli: str | None = None,
    timeout: int = 30,
) -> JsonValue:
    """Run gmgn-cli with the given args and return parsed JSON output.

    Uses settings.gmgn_cli and settings.gmgn_api_key from the centralized
    config.  Pass gmgn_cli to override the binary path for scripts that still
    define their own GMGN_CLI constant.

    Returns the parsed JSON on success, or None on any error.
    """
    import os

    cli = gmgn_cli or str(settings.gmgn_cli)
    api_key = settings.gmgn_api_key
    env = {**os.environ}
    if api_key:
        env["GMGN_API_KEY"] = api_key

    try:
        result = subprocess.run(
            [find_node(), cli] + args,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=env,
        )
        if result.returncode == 0 and result.stdout.strip():
            return json.loads(result.stdout.strip())
    except Exception as exc:  # noqa: BLE001
        print(f"  gmgn-cli error: {exc}")
    return None
