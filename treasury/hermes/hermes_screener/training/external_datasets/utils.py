"""
Shared utilities for external dataset adapters.
"""

import json
import os
from pathlib import Path

CACHE_DIR = Path.home() / ".hermes" / "data" / "external"
DATASET_DIR = Path.home() / ".hermes" / "data" / "training" / "datasets"


def ensure_dirs():
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    DATASET_DIR.mkdir(parents=True, exist_ok=True)


def write_jsonl(path: Path, samples: list) -> int:
    """Write samples to JSONL. Returns count written."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        for s in samples:
            f.write(json.dumps(s) + "\n")
    return len(samples)


def read_jsonl(path: Path) -> list:
    samples = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                samples.append(json.loads(line))
    return samples


def chat_sample(system: str, user: str, assistant: str, meta: dict = None) -> dict:
    """Create a standard chat training sample."""
    s = {
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
            {"role": "assistant", "content": assistant},
        ],
        "source": meta.get("source", "") if meta else "",
        "reward": meta.get("reward", 0.5) if meta else 0.5,
    }
    return s


def pct_change(a, b):
    """Safe percentage change from a to b."""
    try:
        a, b = float(a), float(b)
        if a == 0:
            return 0.0
        return round((b - a) / a * 100, 2)
    except Exception:
        return 0.0


def fmt_price(v):
    try:
        v = float(v)
        if v >= 1000:
            return f"${v:,.0f}"
        elif v >= 1:
            return f"${v:.2f}"
        else:
            return f"${v:.6f}"
    except Exception:
        return str(v)


def fmt_vol(v):
    try:
        v = float(v)
        if v >= 1e9:
            return f"${v/1e9:.2f}B"
        elif v >= 1e6:
            return f"${v/1e6:.1f}M"
        elif v >= 1e3:
            return f"${v/1e3:.1f}K"
        return fmt_price(v)
    except Exception:
        return str(v)


def trend_label(pct: float) -> str:
    if pct > 10:
        return "strong bullish"
    if pct > 3:
        return "bullish"
    if pct > 0:
        return "slightly bullish"
    if pct > -3:
        return "slightly bearish"
    if pct > -10:
        return "bearish"
    return "strong bearish"


def reward_from_pct(pct: float) -> float:
    """Map price change pct to a training reward signal."""
    import math

    return round(max(-1.0, min(1.0, math.tanh(pct / 25.0))), 4)


def install_pkg(pkg: str) -> bool:
    """pip install a package at runtime if missing."""
    import subprocess
    import sys

    try:
        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "pip",
                "install",
                "--quiet",
                "--break-system-packages",
                pkg,
            ],
            capture_output=True,
            timeout=120,
        )
        return result.returncode == 0
    except Exception:
        return False


def check_kaggle_credentials() -> tuple:
    """Returns (ok: bool, message: str)."""
    cred_file = Path.home() / ".kaggle" / "kaggle.json"
    if cred_file.exists():
        return True, str(cred_file)
    env_user = os.environ.get("KAGGLE_USERNAME")
    env_key = os.environ.get("KAGGLE_KEY")
    if env_user and env_key:
        return True, "env vars"
    return False, (
        "Kaggle credentials not found.\n"
        "Set them up:\n"
        "  1. Go to https://www.kaggle.com/settings -> API -> Create New Token\n"
        "  2. Save the downloaded kaggle.json to ~/.kaggle/kaggle.json\n"
        "  OR set KAGGLE_USERNAME and KAGGLE_KEY environment variables."
    )
