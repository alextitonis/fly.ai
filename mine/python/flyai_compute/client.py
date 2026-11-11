"""The HTTP side: uploads, quotes, orders, runs. Standard library only."""

import json
import os
import struct
import time
import urllib.error
import urllib.request
from typing import Any, Dict, Iterator, List, Optional, Sequence

from . import data as D

SERVER = os.environ.get("FLYAI_SERVER", "https://flyai-mine.fly.dev")
SITE = os.environ.get("FLYAI_SITE", "https://www.flyaiworld.com")


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(f"{status}: {message}")
        self.status = status
        self.message = message


def _np():
    try:
        import numpy

        return numpy
    except ImportError:
        return None


class Fleet:
    """A connection to a fly.ai compute server.

    Money only moves when you pay: ``create`` (and the evolve/train/complete helpers) make an unpaid order and give
    you ``pay_link``, which you open with your own wallet. Nothing here ever asks for a key.

    ``admin_token`` (the project's own) makes house runs instead: no payment, miners earn points. Leave it unset.
    """

    def __init__(self, server: str = SERVER, site: str = SITE, admin_token: Optional[str] = None, timeout: float = 60):
        self.server = server.rstrip("/")
        self.site = site.rstrip("/")
        self.admin_token = admin_token or os.environ.get("FLYAI_ADMIN_TOKEN") or None
        self.timeout = timeout

    # ---- plumbing -----------------------------------------------------------------------------------------------
    def _req(self, method: str, path: str, body: Any = None, raw: Optional[bytes] = None, auth: Optional[str] = None) -> Any:
        headers = {"user-agent": "flyai-compute-python/0.1"}
        data = None
        if raw is not None:
            data = raw
        elif body is not None:
            data = json.dumps(body).encode()
            headers["content-type"] = "application/json"
        if auth:
            headers["authorization"] = f"Bearer {auth}"
        req = urllib.request.Request(self.server + path, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                out = res.read()
                if res.headers.get("content-type", "").startswith("application/json"):
                    return json.loads(out)
                return out
        except urllib.error.HTTPError as e:
            text = e.read().decode(errors="replace")
            try:
                text = json.loads(text).get("error", text)
            except ValueError:
                pass
            raise ApiError(e.code, text) from None

    def get(self, path: str) -> Any:
        return self._req("GET", path)

    def post(self, path: str, body: Any, auth: Optional[str] = None) -> Any:
        return self._req("POST", path, body=body, auth=auth)

    def config(self) -> Dict[str, Any]:
        """Prices, limits, models: GET /api/orders/config."""
        return self.get("/api/orders/config")

    def upload(self, b: bytes) -> str:
        """Store bytes on the server (content-addressed); returns the sha256 jobs refer to."""
        return self._req("POST", "/api/blobs", raw=bytes(b))["hash"]

    def blob(self, hash_or_url: str) -> bytes:
        path = hash_or_url if hash_or_url.startswith("/") else f"/api/blobs/{hash_or_url}"
        return self._req("GET", path)

    def _bytes(self, v: Any) -> str:
        """A path or bytes uploaded; a 64-hex string is taken as an upload already there."""
        if isinstance(v, str) and len(v) == 64 and all(c in "0123456789abcdef" for c in v):
            return v
        if isinstance(v, str):
            with open(v, "rb") as f:
                v = f.read()
        return self.upload(v)

    # ---- orders -----------------------------------------------------------------------------------------------
    def quote(self, spec: Dict[str, Any], bid: Optional[str] = None) -> Dict[str, Any]:
        """What a spec costs: jobs, the lowest bid and the full cost at your bid."""
        return self.post("/api/orders/quote", {"spec": spec, **({"bid": str(bid)} if bid else {})})

    def create(self, spec: Dict[str, Any], wallet: Optional[str] = None, bid: Optional[str] = None, budget: Optional[str] = None,
               hours: Optional[float] = None, max_parallel: Optional[int] = None, label: Optional[str] = None) -> "Order":
        """An unpaid order (or, with admin_token, a house order that starts at once). Budget defaults to the full cost."""
        if self.admin_token:
            body = {"label": label or f"{spec['kind']}/python", "spec": spec, **({"max_parallel": max_parallel} if max_parallel else {}),
                    **({"hours": hours} if hours else {})}
            return Order(self, self.post("/api/admin/house", body, auth=self.admin_token))
        if not wallet:
            raise ValueError("wallet: the address that will pay (yours)")
        q = self.quote(spec, bid)
        body = {"wallet": wallet, "spec": spec, "bid": str(bid or q["bid"]), "budget": str(budget or q["full_cost"]),
                **({"hours": hours} if hours else {}), **({"max_parallel": max_parallel} if max_parallel else {})}
        return Order(self, self.post("/api/orders", body))

    def order(self, order_id: str) -> "Order":
        return Order(self, self.get(f"/api/orders/{order_id}"))

    def run(self, run_id: str) -> "Run":
        return Run(self, run_id)

    # ---- the three kinds of work -------------------------------------------------------------------------------
    def evolve(self, fitness: Dict[str, Any], dim: int, generations: int = 100, pairs: int = 64, sigma: float = 0.1, lr: float = 0.05,
               pairs_per_job: int = 8, episodes: int = 1, theta0: Optional[Sequence[float]] = None, weight_decay: float = 0,
               timeout_s: int = 120, redundancy: int = 2, wallet: Optional[str] = None, **order) -> "Run":
        """Evolution strategies over `dim` parameters. Returns the Run (its .order has the pay link)."""
        f = dict(fitness)
        if "wasm" in f:
            f["wasm"] = self._bytes(f["wasm"])
        if f.get("builtin") == "replay":
            f["data"] = self._bytes(f["data"])
        spec = {"kind": "evolve", "fitness": f, "dim": dim, "generations": generations, "pairs": pairs, "sigma": sigma, "lr": lr,
                "pairs_per_job": pairs_per_job, "episodes": episodes, "weight_decay": weight_decay, "timeout_s": timeout_s, "redundancy": redundancy}
        if theta0 is not None:
            spec["theta0"] = self.upload(D.f64_bytes([float(v) for v in theta0]))
        return self._start(spec, wallet, order)

    def train(self, model: Dict[str, Any], x: Any, y: Any, classes: Optional[int] = None, shards: int = 16, eval: Optional[tuple] = None,
              rounds: int = 50, shards_per_round: Optional[int] = None, local_steps: int = 50, batch: int = 32, lr: float = 1e-3,
              weight_decay: float = 0, outer_lr: float = 0.7, outer_momentum: float = 0.9, theta0: Optional[Sequence[float]] = None,
              timeout_s: int = 120, redundancy: int = 2, wallet: Optional[str] = None, **order) -> "Run":
        """Train `model` (mlp(...) or wasm_model(...)) on x, y split into `shards` uploads; eval=(x, y) is scored by the
        server after every round. Returns the Run."""
        m = dict(model)
        if "wasm" in m:
            m["wasm"] = self._bytes(m["wasm"])
        n = len(x)
        hashes = []
        for a, b in D.split(n, shards):
            hashes.append(self.upload(D.encode_shard(x[a:b], y[a:b], classes)))
        spec: Dict[str, Any] = {"kind": "train", "model": m, "shards": hashes, "rounds": rounds,
                                "shards_per_round": shards_per_round or min(16, len(hashes)), "local_steps": local_steps, "batch": batch, "lr": lr,
                                "weight_decay": weight_decay, "outer_lr": outer_lr, "outer_momentum": outer_momentum, "timeout_s": timeout_s, "redundancy": redundancy}
        if eval is not None:
            spec["eval_shard"] = self.upload(D.encode_shard(eval[0], eval[1], classes))
        if theta0 is not None:
            spec["theta0"] = self.upload(D.f32_bytes([float(v) for v in theta0]))
        return self._start(spec, wallet, order)

    def complete(self, prompts: Sequence[Any], model: str = "qwen2.5-0.5b", max_tokens: int = 256, batch: int = 16,
                 prefix: float = 0.9, share: float = 0.75, timeout_s: int = 180, redundancy: int = 2, wallet: Optional[str] = None, **order) -> "Order":
        """Greedy completions for each prompt (a string, or {"system", "prompt"}), `batch` prompts a job.
        Two miners agree when `share` of their texts match to `prefix` of their characters (different GPUs can pick
        another word late in a text). Returns the Order; .texts() when done."""
        inputs = [self.upload(json.dumps(list(prompts[i:i + batch])).encode()) for i in range(0, len(prompts), batch)]
        spec = {"kind": "complete", "model": model, "inputs": inputs, "max_tokens": max_tokens, "compare": {"prefix": prefix, "share": share},
                "timeout_s": timeout_s, "redundancy": redundancy}
        o = self.create(spec, wallet, **order)
        o.batch = batch
        return o

    def _start(self, spec: Dict[str, Any], wallet: Optional[str], order: Dict[str, Any]) -> "Run":
        o = self.create(spec, wallet, **order)
        if not o.data.get("run"):
            raise ApiError(500, "the server made the order but no run")
        r = Run(self, o.data["run"]["id"])
        r.order = o
        return r


class Order:
    def __init__(self, fleet: Fleet, data: Dict[str, Any]):
        self.fleet = fleet
        self.data = data
        self.id = data["id"]
        self.batch = None

    @property
    def pay_link(self) -> str:
        return f"{self.fleet.site}/compute/jobs?pay={self.id}"

    @property
    def order_key(self) -> Optional[str]:
        """Shown once, at creation: keep it to add jobs or stop the order from code."""
        return self.data.get("order_key")

    def refresh(self) -> Dict[str, Any]:
        self.data = {**self.data, **self.fleet.get(f"/api/orders/{self.id}")}
        return self.data

    @property
    def status(self) -> str:
        return self.refresh()["status"]

    def wait(self, every: float = 5, until=("done", "ended", "expired")) -> Dict[str, Any]:
        while self.status not in until:
            time.sleep(every)
        return self.data

    def results(self) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        after = 0
        while True:
            page = self.fleet.get(f"/api/orders/{self.id}/results?after={after}&limit=5000")
            rows += page["rows"]
            if not page.get("more"):
                return sorted(rows, key=lambda r: r["index"])
            after = page["next"]

    def texts(self) -> List[Optional[str]]:
        """A complete order's answers in prompt order (None for a job not settled)."""
        out: Dict[int, List[str]] = {}
        for row in self.results():
            o = row.get("output")
            if o and o.get("url"):
                out[row["index"]] = json.loads(self.fleet.blob(o["url"]))["texts"]
        n = max(out) + 1 if out else 0
        texts: List[Optional[str]] = []
        for i in range(n):
            texts += out.get(i, [None] * (self.batch or 1))
        return texts


class Run:
    """An evolve or train run: its curve, its parameters, where it stands."""

    def __init__(self, fleet: Fleet, run_id: str):
        self.fleet = fleet
        self.id = run_id
        self.order: Optional[Order] = None

    @property
    def pay_link(self) -> str:
        v = self.view(0)
        return f"{self.fleet.site}/compute/jobs?pay={v['order']['id']}"

    @property
    def url(self) -> str:
        return f"{self.fleet.site}/compute/runs?id={self.id}"

    def view(self, points: int = 500) -> Dict[str, Any]:
        return self.fleet.get(f"/api/runs/{self.id}?points={points}")

    @property
    def status(self) -> str:
        return self.view(0)["status"]

    def points(self) -> List[Dict[str, Any]]:
        """The whole curve, one dict per generation or round."""
        out: List[Dict[str, Any]] = []
        after = -1
        while True:
            page = self.fleet.get(f"/api/runs/{self.id}/points?after={after}")["points"]
            out += page
            if len(page) < 5000:
                return out
            after = page[-1]["step"]

    def watch(self, every: float = 5) -> Iterator[Dict[str, Any]]:
        """Yields each new point as it lands, until the run stops."""
        after = -1
        while True:
            for p in self.fleet.get(f"/api/runs/{self.id}/points?after={after}")["points"]:
                after = p["step"]
                yield p
            v = self.view(0)
            if v["status"] not in ("waiting", "running"):
                for p in self.fleet.get(f"/api/runs/{self.id}/points?after={after}")["points"]:
                    yield p
                return
            time.sleep(every)

    def theta(self, best: bool = False):
        """The current (or best) parameters: float64 for evolve, float32 for train; numpy if it's installed."""
        v = self.view(0)
        src = v["best"]["url"] if best and v.get("best") and v["best"].get("url") else v["theta"]["url"]
        b = self.fleet.blob(src)
        f = "d" if v["kind"] == "evolve" else "f"
        np = _np()
        if np is not None:
            return np.frombuffer(b, dtype="<f8" if f == "d" else "<f4").copy()
        return list(struct.unpack(f"<{len(b) // (8 if f == 'd' else 4)}{f}", b))

    def layers(self):
        """A train run's MLP weights as [(W, b), ...] (W is outputs x inputs), from the current parameters."""
        v = self.view(0)
        sizes = v["spec"]["model"]["mlp"]["layers"]
        theta = self.theta()
        out, at = [], 0
        for i in range(1, len(sizes)):
            n_in, n_out = sizes[i - 1], sizes[i]
            w = theta[at:at + n_in * n_out]
            at += n_in * n_out
            b = theta[at:at + n_out]
            at += n_out
            np = _np()
            out.append((w.reshape(n_out, n_in) if np is not None else [list(w[r * n_in:(r + 1) * n_in]) for r in range(n_out)], b))
        return out
