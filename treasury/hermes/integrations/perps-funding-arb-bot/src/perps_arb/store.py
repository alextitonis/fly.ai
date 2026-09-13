from __future__ import annotations

import json
from pathlib import Path

from .models import Opportunity


class JsonlStateStore:
    def __init__(self, base_dir: str = "data"):
        self.base = Path(base_dir)
        self.base.mkdir(parents=True, exist_ok=True)
        self.opps_path = self.base / "opportunities.jsonl"
        self.exec_path = self.base / "executions.jsonl"
        self.close_path = self.base / "closes.jsonl"
        self.rebalance_path = self.base / "rebalances.jsonl"

    def _append_jsonl(self, path: Path, obj: dict) -> None:
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(obj) + "\n")

    def _read_jsonl(self, path: Path) -> list[dict]:
        if not path.exists():
            return []
        rows: list[dict] = []
        with path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
        return rows

    def save_opportunities(self, opportunities: list[Opportunity]) -> None:
        for o in opportunities:
            self._append_jsonl(self.opps_path, o.__dict__)

    def save_execution(self, record: dict) -> None:
        self._append_jsonl(self.exec_path, record)

    def save_close(self, record: dict) -> None:
        self._append_jsonl(self.close_path, record)

    def save_rebalance(self, record: dict) -> None:
        self._append_jsonl(self.rebalance_path, record)

    def load_open_positions(self) -> list[dict]:
        opens = self._read_jsonl(self.exec_path)
        closes = self._read_jsonl(self.close_path)

        open_map: dict[str, dict] = {}
        for r in opens:
            symbol = r.get("symbol")
            if symbol:
                open_map[symbol] = r

        for r in closes:
            symbol = r.get("symbol")
            if symbol and symbol in open_map:
                del open_map[symbol]

        return list(open_map.values())
