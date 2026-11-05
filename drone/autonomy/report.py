"""Finds -> a log: one entry per thing, not one per frame. Sightings within `merge` m of the same kind update the entry."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from .core import Detection


class Reporter:
    MERGE = {"fire": 8.0, "smoke": 8.0, "person": 2.5, "animal": 4.0}   # m: same thing if this close; a fire is big, two people can stand near each other

    def __init__(self, path: str | Path | None = None, merge: float | dict | None = None, confirm: int = 3):
        self.path = Path(path) if path else None
        self.merge = dict(self.MERGE) if merge is None else (merge if isinstance(merge, dict) else {k: merge for k in self.MERGE})
        self.confirm = confirm          # sightings before a find is reported: one frame can be a false alarm
        self.finds: list[dict] = []
        self.new: list[dict] = []       # confirmed since the last take_new(), for a radio or the dock to pass on
        if self.path:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text("")

    def add(self, d: Detection) -> None:
        near = [f for f in self.finds if f["kind"] == d.kind and np.hypot(f["lx"] - d.x, f["ly"] - d.y) < self.merge.get(d.kind, 4.0)]
        if near:
            f = min(near, key=lambda f: np.hypot(f["lx"] - d.x, f["ly"] - d.y))
            n = f["sightings"]
            f["x"], f["y"] = (f["x"] * n + d.x) / (n + 1), (f["y"] * n + d.y) / (n + 1)   # running mean of where it is
            f["sightings"], f["last_t"], f["lx"], f["ly"] = n + 1, d.t, d.x, d.y   # lx, ly: last seen, which a moving animal is compared against
            f["confidence"] = max(f["confidence"], d.confidence)
            if f["sightings"] == self.confirm:
                self._emit(f)
            return
        f = {"id": len(self.finds) + 1, "kind": d.kind, "x": d.x, "y": d.y, "lx": d.x, "ly": d.y, "confidence": d.confidence, "first_t": d.t, "last_t": d.t,
             "sightings": 1, "source": d.source}
        self.finds.append(f)
        if self.confirm <= 1:
            self._emit(f)

    def _emit(self, f: dict) -> None:
        rec = {k: (round(v, 2) if isinstance(v, float) else v) for k, v in f.items() if k not in ("lx", "ly")}
        self.new.append(rec)
        if self.path:
            with self.path.open("a") as fh:
                fh.write(json.dumps({"event": "found", **rec}) + "\n")

    def log(self, event: str, **kw) -> None:
        if self.path:
            with self.path.open("a") as fh:
                fh.write(json.dumps({"event": event, **{k: (round(v, 2) if isinstance(v, float) else v) for k, v in kw.items()}}) + "\n")

    def take_new(self) -> list[dict]:
        out, self.new = self.new, []
        return out

    def confirmed(self) -> list[dict]:
        return [f for f in self.finds if f["sightings"] >= self.confirm]
