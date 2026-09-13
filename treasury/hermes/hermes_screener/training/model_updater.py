"""
Model Updater
=============
Hot-swaps updated LoRA adapters into the running inference process
without a full model reload.

Strategy:
  1. Save new adapter from fine_tuner to ~/.hermes/models/trading-lora/<timestamp>/
  2. Write a pointer file (adapter_latest.txt) that the inference server reads
  3. Signal the Bonsai-8B / local inference server to reload via:
       - HTTP POST to /reload_adapter  (if server supports it)
       - Kill+restart the server process  (fallback)
       - Write a sentinel file that the server polls  (lightest weight)

The inference server (ai_trading_brain.py calls localhost:8082) is expected
to check the sentinel file on each request or restart automatically.
"""

import json
import logging
import time
import urllib.error
import urllib.request
from pathlib import Path
from hermes_screener import tor_config  # noqa: F401

logger = logging.getLogger(__name__)

ADAPTER_BASE = Path.home() / ".hermes" / "models" / "trading-lora"
POINTER_FILE = ADAPTER_BASE / "adapter_latest.txt"
SENTINEL_FILE = ADAPTER_BASE / "reload_requested"
INFERENCE_PORT = 8082
RELOAD_ENDPOINT = f"http://localhost:{INFERENCE_PORT}/reload_adapter"


class ModelUpdater:

    def __init__(
        self,
        adapter_base: Path = ADAPTER_BASE,
        inference_port: int = INFERENCE_PORT,
    ):
        self.adapter_base = Path(adapter_base)
        self.inference_port = inference_port
        self.adapter_base.mkdir(parents=True, exist_ok=True)

    def publish_adapter(self, adapter_path: str, version_tag: str = "") -> dict:
        """
        Make a new adapter the active one.
        Writes pointer file and signals the inference server.
        """
        adapter_path = Path(adapter_path)
        if not adapter_path.exists():
            return {"status": "error", "msg": f"adapter not found: {adapter_path}"}

        # Write pointer
        POINTER_FILE.write_text(str(adapter_path))
        logger.info(f"Adapter pointer updated: {adapter_path}")

        # Version manifest
        manifest = {
            "adapter_path": str(adapter_path),
            "published_at": time.time(),
            "version_tag": version_tag or str(int(time.time())),
        }
        manifest_path = self.adapter_base / "manifest.json"
        with open(manifest_path, "w") as f:
            json.dump(manifest, f, indent=2)

        # Try hot reload
        reload_result = self._signal_reload(str(adapter_path))

        return {
            "status": "ok",
            "adapter_path": str(adapter_path),
            "reload_method": reload_result,
            "manifest": manifest_path,
        }

    def _signal_reload(self, adapter_path: str) -> str:
        """Try several methods to reload the model, return method used."""
        # Method 1: HTTP POST to inference server
        try:
            body = json.dumps({"adapter_path": adapter_path}).encode()
            req = urllib.request.Request(
                RELOAD_ENDPOINT,
                data=body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                resp.read()
            logger.info("Adapter reloaded via HTTP POST")
            return "http_post"
        except (urllib.error.URLError, OSError):
            pass

        # Method 2: Sentinel file (server polls on each request)
        SENTINEL_FILE.write_text(adapter_path)
        logger.info("Reload requested via sentinel file")
        return "sentinel_file"

    def get_current_adapter(self) -> str | None:
        """Return the currently active adapter path."""
        if POINTER_FILE.exists():
            return POINTER_FILE.read_text().strip()
        return None

    def list_adapters(self) -> list:
        """List all saved adapter versions."""
        adapters = []
        for d in sorted(self.adapter_base.iterdir()):
            if d.is_dir() and (d / "adapter_config.json").exists():
                adapters.append(
                    {
                        "path": str(d),
                        "name": d.name,
                        "mtime": d.stat().st_mtime,
                        "current": str(d) == self.get_current_adapter(),
                    }
                )
        return sorted(adapters, key=lambda x: x["mtime"], reverse=True)

    def cleanup_old_adapters(self, keep: int = 5):
        """Keep only the N most recent adapters."""
        adapters = self.list_adapters()
        current = self.get_current_adapter()
        removed = []
        for adapter in adapters[keep:]:
            if adapter["path"] != current:
                import shutil

                shutil.rmtree(adapter["path"], ignore_errors=True)
                removed.append(adapter["path"])
        logger.info(f"Cleaned up {len(removed)} old adapters")
        return removed
