"""JEPA steps 1 and 2 (PLAN.md section 9): pack the collected flights, train the world model, probe what it learned.

    python drone/jepa.py pack                                   # all forest_*.npz -> one memory-mapped frames file + labels
    python drone/jepa.py fit --name full                        # encoder + action-conditioned predictor, SIGReg, on the GPU
    python drone/jepa.py fit --name f25 --fraction 0.25         # the same on a quarter of the training flights (nested subsets)
    python drone/jepa.py probe --models full f50 f25            # frozen latents -> linear probes, against PCA, random init, dead reckoning

The model follows LeWorldModel as written up in github.com/keon/jepa (leworldmodel.py, MIT): a small ViT encoder, a causal
transformer predictor conditioned on the command through AdaLN-zero, next-embedding MSE trained end to end with no stop-gradient
and no EMA, and SIGReg (sketched Epps-Pulley test against an isotropic Gaussian) to keep the latents from collapsing. Changes
here: three cameras of 48 x 64 RGB in one token sequence with a learned camera embedding, a 3-number command (forward, climb,
yaw_rate), and an --ema option as the comparison the plan asks for. Everything here is ours, not the connectome's.

Held-out flights: every seed ending in 0 (seed % 10 == 0). They are never trained on, and the probes are scored on them.
Frames live in a memory-mapped file and go to the GPU in chunks: this machine often has about 1 GB of RAM free.
"""
from __future__ import annotations

import json
import math
import time
from pathlib import Path

import numpy as np

from jepa import CAMS, DATA, SAMPLE_S

PACK = DATA / "pack"
MODELS = DATA / "models"
LABELS = ("cmd", "start", "pose", "vel", "tree_d", "tree_b", "ahead_d", "ahead_b", "fire_d", "fire_b", "crash", "source")
CLOSE = 0.8                                            # m: "a trunk close ahead" for the crash guard
COLS = 4                                               # strips per camera for pool "cols"
CMD_SCALE = np.array([0.6, 1.0, 2.0], np.float32)     # forward m/s, climb m/s, yaw rad/s: about unit range


# ---------------------------------------------------------------- data

def pack(a) -> None:
    files = sorted(p for p in DATA.glob("forest_*.npz") if ".tmp" not in p.name)
    metas = [json.loads(p.with_suffix(".json").read_text()) for p in files]
    total = sum(m["samples"] for m in metas)
    w, h = metas[0]["size"]
    PACK.mkdir(parents=True, exist_ok=True)
    frames = np.lib.format.open_memmap(PACK / "frames.npy", mode="w+", dtype=np.uint8, shape=(total, len(CAMS), h, w, 3))
    lab = {k: [] for k in LABELS}
    file_id, seeds, policy = [], [], []
    at = 0
    for i, (p, m) in enumerate(zip(files, metas)):
        d = np.load(p)
        n = len(d["cmd"])
        assert n == m["samples"] and tuple(d["cams"]) == CAMS, p
        frames[at:at + n] = d["frames"]
        for k in LABELS:
            lab[k].append(d[k])
        lab["start"][-1] = lab["start"][-1].copy()
        lab["start"][-1][0] = True                      # a file always starts a run
        file_id.append(np.full(n, i, np.int32))
        seeds.append(np.full(n, m["seed"], np.int32))
        policy.append(np.full(n, m["policy"] == "brain", bool))
        at += n
    frames.flush()
    del frames
    out = {k: np.concatenate(v) for k, v in lab.items()}
    np.savez(PACK / "labels.npz", file_id=np.concatenate(file_id), seed=np.concatenate(seeds), brain=np.concatenate(policy), **out)
    (PACK / "files.json").write_text(json.dumps([p.name for p in files]))
    print(json.dumps({"samples": total, "flights": len(files), "GB": round(total * len(CAMS) * h * w * 3 / 1e9, 2)}))


class Data:
    def __init__(self, T: int, held_from: int = 0):
        self.lab = dict(np.load(PACK / "labels.npz"))
        self.frames = np.load(PACK / "frames.npy", mmap_mode="r")
        n = len(self.lab["cmd"])
        start = self.lab["start"].astype(np.int64)
        # window i..i+T-1 is one run if no start flag inside it after the first sample
        cs = np.concatenate([[0], np.cumsum(start)])
        ok = np.zeros(n, bool)
        last = np.arange(n) + T - 1
        inside = last < n
        idx = np.flatnonzero(inside)
        ok[idx] = (cs[idx + T] - cs[idx + 1]) == 0
        # held-out flights: seeds ending in 0 (first test, 11-26), or with held_from every seed from there up (fresh test)
        self.held = self.lab["seed"] >= held_from if held_from else self.lab["seed"] % 10 == 0
        self.T, self.n = T, n
        self.windows = np.flatnonzero(ok)

    def train_windows(self, fraction: float) -> np.ndarray:
        seeds = np.unique(self.lab["seed"][~self.held])
        keep = np.random.default_rng(0).permutation(seeds)[: max(1, round(len(seeds) * fraction))]   # nested: 25% is inside 50%
        w = self.windows
        return w[np.isin(self.lab["seed"][w], keep)], keep

    def val_windows(self) -> np.ndarray:
        return self.windows[self.held[self.windows]]

    def to_gpu(self, torch, device, chunk: int = 4000):
        """All frames onto the GPU as uint8, a chunk at a time, so RAM never holds them all."""
        out = torch.empty(self.frames.shape, dtype=torch.uint8, device=device)
        for s in range(0, self.n, chunk):
            out[s:s + chunk] = torch.from_numpy(np.ascontiguousarray(self.frames[s:s + chunk])).to(device)
        return out


# ---------------------------------------------------------------- model

def build_model(dim: int = 128, depth: int = 4, heads: int = 4, pred_depth: int = 4, T: int = 8, h: int = 48, w: int = 64, patch: int = 8, pool: str = "mean"):
    import torch
    import torch.nn as nn
    import torch.nn.functional as F

    def sincos_1d(n, d):
        pos = torch.arange(n, dtype=torch.float32)[:, None]
        div = torch.exp(torch.arange(0, d, 2, dtype=torch.float32) * (-math.log(10000.0) / d))
        pe = torch.zeros(n, d)
        pe[:, 0::2], pe[:, 1::2] = torch.sin(pos * div), torch.cos(pos * div)
        return pe

    def sincos_2d(gh, gw, d):
        a, b = sincos_1d(gh, d // 2), sincos_1d(gw, d // 2)
        return torch.cat([a[:, None, :].expand(gh, gw, -1), b[None, :, :].expand(gh, gw, -1)], -1).reshape(gh * gw, d)

    class Projector(nn.Module):
        def __init__(self):
            super().__init__()
            self.lin, self.bn = nn.Linear(dim, dim), nn.BatchNorm1d(dim)

        def forward(self, x):
            shape = x.shape
            return self.bn(self.lin(x).reshape(-1, dim)).reshape(shape)

    class Block(nn.Module):
        def __init__(self):
            super().__init__()
            self.n1, self.n2 = nn.LayerNorm(dim), nn.LayerNorm(dim)
            self.attn = nn.MultiheadAttention(dim, heads, batch_first=True)
            self.mlp = nn.Sequential(nn.Linear(dim, 4 * dim), nn.GELU(), nn.Linear(4 * dim, dim))

        def forward(self, x):
            y = self.n1(x)
            x = x + self.attn(y, y, y, need_weights=False)[0]
            return x + self.mlp(self.n2(x))

    class Encoder(nn.Module):
        """Three cameras -> one latent. uint8 (B, cams, H, W, 3) in."""

        def __init__(self):
            super().__init__()
            self.patch = nn.Conv2d(3, dim, patch, patch)
            self.register_buffer("pos", sincos_2d(h // patch, w // patch, dim))
            self.cam = nn.Parameter(torch.zeros(len(CAMS), 1, dim))
            nn.init.normal_(self.cam, std=0.02)
            self.blocks = nn.ModuleList(Block() for _ in range(depth))
            self.norm = nn.LayerNorm(dim)
            self.proj = Projector()
            # "cols": average each camera's tokens down its columns into COLS strips, so the latent keeps left-to-right layout
            # (the mean over all tokens lost it: trunk bearing 0.44 vs PCA 0.55 on 11-26)
            self.cols = nn.Linear(len(CAMS) * COLS * dim, dim) if pool == "cols" else None

        def forward(self, x):
            B, C = x.shape[:2]
            x = x.permute(0, 1, 4, 2, 3).reshape(B * C, 3, h, w).float().div_(255).sub_(0.5)
            t = self.patch(x).flatten(2).transpose(1, 2)               # (B*C, tokens, dim)
            t = (t + self.pos).reshape(B, C, -1, dim) + self.cam
            t = t.reshape(B, -1, dim)
            for b in self.blocks:
                t = b(t)
            t = self.norm(t)
            if self.cols is None:
                return self.proj(t.mean(1))
            gw = w // patch
            t = t.reshape(B, C, h // patch, COLS, gw // COLS, dim).mean((2, 4))   # (B, cams, COLS, dim)
            return self.proj(self.cols(t.reshape(B, -1)))

    class CondBlock(nn.Module):
        """Causal self-attention over time, modulated by the command (AdaLN-zero)."""

        def __init__(self):
            super().__init__()
            self.n1 = nn.LayerNorm(dim, elementwise_affine=False)
            self.n2 = nn.LayerNorm(dim, elementwise_affine=False)
            self.qkv, self.out = nn.Linear(dim, 3 * dim), nn.Linear(dim, dim)
            self.mlp = nn.Sequential(nn.Linear(dim, 4 * dim), nn.GELU(), nn.Linear(4 * dim, dim))
            self.ada = nn.Sequential(nn.SiLU(), nn.Linear(dim, 6 * dim))
            nn.init.zeros_(self.ada[1].weight)
            nn.init.zeros_(self.ada[1].bias)

        def forward(self, x, c):
            s1, sc1, g1, s2, sc2, g2 = self.ada(c).chunk(6, -1)
            y = self.n1(x) * (1 + sc1) + s1
            B, L, _ = y.shape
            q, k, v = self.qkv(y).reshape(B, L, 3, heads, dim // heads).permute(2, 0, 3, 1, 4)
            y = F.scaled_dot_product_attention(q, k, v, is_causal=True).transpose(1, 2).reshape(B, L, dim)
            x = x + g1 * self.out(y)
            return x + g2 * self.mlp(self.n2(x) * (1 + sc2) + s2)

    class Predictor(nn.Module):
        def __init__(self):
            super().__init__()
            self.act = nn.Sequential(nn.Linear(3, dim), nn.SiLU(), nn.Linear(dim, dim))
            self.register_buffer("time", sincos_1d(T, dim))
            self.blocks = nn.ModuleList(CondBlock() for _ in range(pred_depth))
            self.norm = nn.LayerNorm(dim)
            self.proj = Projector()

        def forward(self, z, a):                                       # z (B, L, dim), a (B, L, 3) -> next latents (B, L, dim)
            x, c = z + self.time[: z.shape[1]], self.act(a)
            for b in self.blocks:
                x = b(x, c)
            return self.proj(self.norm(x))

        @torch.no_grad()
        def rollout(self, z0, actions):                                # z0 (B, L0, dim) true context, actions (B, L0 + K - 1, 3)
            z = z0
            for k in range(actions.shape[1] - z0.shape[1] + 1):
                nxt = self(z, actions[:, : z.shape[1]])[:, -1:]
                z = torch.cat([z, nxt], 1)
            return z[:, z0.shape[1]:]

    class SIGReg(nn.Module):
        """As in keon/jepa leworldmodel.py: Epps-Pulley statistic on random 1-D projections, against N(0, 1)."""

        def __init__(self, knots: int = 17, num_proj: int = 1024):
            super().__init__()
            self.num_proj = num_proj
            t = torch.linspace(0, 3, knots)
            dt = 3 / (knots - 1)
            wt = torch.full((knots,), 2 * dt)
            wt[[0, -1]] = dt
            phi = torch.exp(-t.square() / 2)
            self.register_buffer("t", t)
            self.register_buffer("phi", phi)
            self.register_buffer("weights", wt * phi)

        def forward(self, proj):                                       # (T, B, D)
            A = torch.randn(proj.size(-1), self.num_proj, device=proj.device)
            A = A / A.norm(p=2, dim=0)
            x_t = (proj @ A).unsqueeze(-1) * self.t
            err = (x_t.cos().mean(-3) - self.phi).square() + x_t.sin().mean(-3).square()
            return ((err @ self.weights) * proj.size(-2)).mean()

    return Encoder, Predictor, SIGReg


def eff_rank(z: np.ndarray) -> float:
    s = np.linalg.svd(z - z.mean(0), compute_uv=False)
    p = s / s.sum()
    return float(np.exp(-(p * np.log(p + 1e-12)).sum()))


# ---------------------------------------------------------------- training

def fit(a) -> None:
    import copy

    import torch
    torch.manual_seed(a.seed)
    dev = "cuda"
    data = Data(a.T, a.held_from)
    tw, flights = data.train_windows(a.fraction)
    vw = data.val_windows()
    rng = np.random.default_rng(a.seed)
    vsel = rng.choice(vw, min(len(vw), 1024), replace=False)
    t0 = time.time()
    frames = data.to_gpu(torch, dev)
    cmd = torch.from_numpy(data.lab["cmd"] / CMD_SCALE).float().to(dev)
    print(json.dumps({"name": a.name, "train_windows": int(len(tw)), "train_flights": int(len(flights)), "val_windows": int(len(vw)), "to_gpu_s": round(time.time() - t0, 1)}), flush=True)
    Encoder, Predictor, SIGReg = build_model(dim=a.dim, T=a.T, pool=a.pool)
    enc, pred, sig = Encoder().to(dev), Predictor().to(dev), SIGReg().to(dev)
    ema = copy.deepcopy(enc).requires_grad_(False) if a.ema else None
    params = list(enc.parameters()) + list(pred.parameters())
    decay = [p for p in params if p.ndim >= 2]
    rest = [p for p in params if p.ndim < 2]
    opt = torch.optim.AdamW([{"params": decay, "weight_decay": 0.05}, {"params": rest, "weight_decay": 0.0}], lr=a.lr)
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1.0, (s + 1) / 500) * 0.5 * (1 + math.cos(math.pi * min(s, a.steps) / a.steps)))
    offs = torch.arange(a.T, device=dev)

    def batch(starts):
        idx = torch.as_tensor(starts, device=dev)[:, None] + offs     # (B, T)
        return frames[idx], cmd[idx]

    def encode(model, x):
        B, T = x.shape[:2]
        return model(x.reshape(B * T, *x.shape[2:])).reshape(B, T, -1)

    def evaluate():
        enc.eval(), pred.eval()
        out = {"pred": 0.0, "copy": 0.0, "zero_act_gap": 0.0, "roll": np.zeros(a.T // 2), "roll_copy": np.zeros(a.T // 2)}
        zs = []
        with torch.no_grad(), torch.autocast("cuda", dtype=torch.bfloat16):
            for s in range(0, len(vsel), 128):
                x, c = batch(vsel[s:s + 128])
                z = encode(enc, x).float()
                zs.append(z[:, 0].cpu().numpy())
                p = pred(z[:, :-1], c[:, :-1]).float()
                p0 = pred(z[:, :-1], torch.zeros_like(c[:, :-1])).float()
                n = len(x) / len(vsel)
                out["pred"] += n * float((p - z[:, 1:]).square().mean())
                out["copy"] += n * float((z[:, :-1] - z[:, 1:]).square().mean())
                out["zero_act_gap"] += n * float((p0 - z[:, 1:]).square().mean() - (p - z[:, 1:]).square().mean())
                L0 = a.T // 2
                r = pred.rollout(z[:, :L0], c[:, : a.T - 1]).float()
                out["roll"] += n * (r - z[:, L0:]).square().mean((0, 2)).cpu().numpy()
                out["roll_copy"] += n * (z[:, L0 - 1: L0] - z[:, L0:]).square().mean((0, 2)).cpu().numpy()
        zs = np.concatenate(zs)
        enc.train(), pred.train()
        return {"val_pred": round(out["pred"], 4), "val_copy": round(out["copy"], 4), "zero_act_gap": round(out["zero_act_gap"], 4),
                "roll_k1_4": [round(float(v), 3) for v in out["roll"]], "roll_copy_k1_4": [round(float(v), 3) for v in out["roll_copy"]],
                "z_std": round(float(zs.std(0).mean()), 3), "eff_rank": round(eff_rank(zs), 1)}

    log = []
    MODELS.mkdir(parents=True, exist_ok=True)
    t0, run = time.time(), {"pred": 0.0, "sig": 0.0, "n": 0}
    for step in range(a.steps + 1):
        if step % a.every == 0:
            row = {"step": step, "train_pred": round(run["pred"] / max(run["n"], 1), 4), "train_sig": round(run["sig"] / max(run["n"], 1), 4),
                   "lr": round(sched.get_last_lr()[0], 6), "min": round((time.time() - t0) / 60, 1), **evaluate()}
            log.append(row)
            print(json.dumps(row), flush=True)
            run = {"pred": 0.0, "sig": 0.0, "n": 0}
            if step == a.steps:
                break
        x, c = batch(rng.choice(tw, a.batch))
        with torch.autocast("cuda", dtype=torch.bfloat16):
            z = encode(enc, x)
            p = pred(z[:, :-1], c[:, :-1])
            if ema is not None:
                with torch.no_grad():
                    tgt = encode(ema, x)[:, 1:]
            else:
                tgt = z[:, 1:]                                         # end to end, no stop-gradient, as in LeWorldModel
            lp = (p.float() - tgt.float()).square().mean()
        ls = sig(z.float().transpose(0, 1))                            # outside autocast: cos/sin of bf16 projections are too coarse
        loss = lp + a.sigreg * ls
        opt.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(params, 1.0)
        opt.step()
        sched.step()
        if ema is not None:
            with torch.no_grad():
                for pe, pp in zip(ema.parameters(), enc.parameters()):
                    pe.lerp_(pp, 1 - a.ema)
        run["pred"] += lp.item()
        run["sig"] += ls.item()
        run["n"] += 1
    cfg = {k: v for k, v in vars(a).items() if k != "what"}
    torch.save({"enc": enc.state_dict(), "pred": pred.state_dict(), "cfg": cfg, "flights": flights.tolist()}, MODELS / f"{a.name}.pt")
    (MODELS / f"{a.name}.json").write_text(json.dumps({"cfg": cfg, "log": log}))
    print(json.dumps({"saved": str(MODELS / f"{a.name}.pt"), "minutes": round((time.time() - t0) / 60, 1)}))


# ---------------------------------------------------------------- probes (step 2)

def _wrap(x):
    return (x + np.pi) % (2 * np.pi) - np.pi


def probe(a) -> None:
    import torch
    from sklearn.decomposition import PCA
    from sklearn.linear_model import RidgeCV
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler

    data = Data(2, a.held_from)
    L, n = data.lab, data.n
    held, seed = data.held, L["seed"]
    rng = np.random.default_rng(1)

    # targets
    pose = L["pose"]
    pair = np.zeros(n, bool)
    pair[:-1] = (~L["start"][1:].astype(bool)) & (L["file_id"][1:] == L["file_id"][:-1])
    nxt = np.minimum(np.arange(n) + 1, n - 1)
    d = pose[nxt, :2] - pose[:, :2]
    fwd = d[:, 0] * np.cos(pose[:, 3]) + d[:, 1] * np.sin(pose[:, 3])
    dyaw = _wrap(pose[nxt, 3] - pose[:, 3])
    dr_fwd, dr_yaw = L["cmd"][:, 0] * SAMPLE_S, L["cmd"][:, 2] * SAMPLE_S
    ahead_d = np.nan_to_num(np.clip(L["ahead_d"], 0, 5), nan=5.0)
    close = np.nan_to_num(L["ahead_d"], nan=9) < 3.0

    def split(mask, cap):
        tr = np.flatnonzero(mask & ~held)
        te = np.flatnonzero(mask & held)
        return (rng.choice(tr, cap, replace=False) if len(tr) > cap else tr), te

    tasks = {"fwd": (pair, fwd, True), "yaw": (pair, dyaw, True), "ahead_d": (np.ones(n, bool), ahead_d, False), "ahead_b": (close, L["ahead_b"], False)}

    def score(Z: np.ndarray) -> dict:
        out = {}
        for name, (mask, y, two) in tasks.items():
            tr, te = split(mask, a.cap)
            X = (lambda i: np.concatenate([Z[i], Z[nxt[i]]], 1)) if two else (lambda i: Z[i])
            m = make_pipeline(StandardScaler(), RidgeCV(alphas=(0.1, 1, 10, 100, 1000, 1e4)))
            m.fit(X(tr), y[tr])
            p = m.predict(X(te))
            out[name] = {"r2": round(float(1 - ((p - y[te]) ** 2).sum() / ((y[te] - y[te].mean()) ** 2).sum()), 3), "mae": round(float(np.abs(p - y[te]).mean()), 4), "n_test": int(len(te))}
        return out

    def embed(enc) -> np.ndarray:
        frames = data.frames
        enc.eval()
        zs = []
        with torch.no_grad(), torch.autocast("cuda", dtype=torch.bfloat16):
            for s in range(0, n, 2048):
                zs.append(enc(torch.from_numpy(np.ascontiguousarray(frames[s:s + 2048])).cuda()).float().cpu().numpy())
        return np.concatenate(zs)

    results = {}
    te_pair = np.flatnonzero(pair & held)
    results["dead_reckoning"] = {"fwd": {"mae": round(float(np.abs(dr_fwd[te_pair] - fwd[te_pair]).mean()), 4)},
                                 "yaw": {"mae": round(float(np.abs(dr_yaw[te_pair] - dyaw[te_pair]).mean()), 4)}}
    for name in a.models:
        ck = torch.load(MODELS / f"{name}.pt", map_location="cuda")
        Encoder, _, _ = build_model(dim=ck["cfg"]["dim"], T=ck["cfg"]["T"], pool=ck["cfg"].get("pool", "mean"))
        enc = Encoder().cuda()
        enc.load_state_dict(ck["enc"])
        results[name] = score(embed(enc))
        print(name, json.dumps(results[name]), flush=True)
        if name == a.models[0]:
            torch.manual_seed(0)
            rnd = Encoder().cuda()
            results["random_init"] = score(embed(rnd))
            print("random_init", json.dumps(results["random_init"]), flush=True)
    # PCA on pixels, halved in size: what planner.py did with its state, here on pictures
    small = lambda s, e: np.asarray(data.frames[s:e, :, ::2, ::2]).reshape(e - s, -1).astype(np.float32) / 255   # noqa: E731
    fit_idx = np.sort(rng.choice(np.flatnonzero(~held), min(a.pca_fit, int((~held).sum())), replace=False))
    pca = PCA(a.dim_pca, random_state=0).fit(np.concatenate([small(i, i + 1) for i in fit_idx]))
    results["pca_pixels"] = score(np.concatenate([pca.transform(small(s, min(s + 4096, n))) for s in range(0, n, 4096)]))
    print("pca_pixels", json.dumps(results["pca_pixels"]), flush=True)
    # the gate, written in PLAN.md before the real run (11-26). Motion vs dead reckoning is reported only: the forest has no wind, so
    # commands are the motion (per-step yaw error 0.0066 rad on the smoke run) and that test moves to step 3 with gusts on.
    main = results[a.models[0]]
    beats = all(main[t]["r2"] > results[b][t]["r2"] for t in tasks for b in ("pca_pixels", "random_init"))
    motion = all(main[t]["mae"] <= 0.5 * results["dead_reckoning"][t]["mae"] for t in ("fwd", "yaw"))
    results["gate"] = {"model": a.models[0], "BEATS_BASELINES": beats, "MOTION_HALF_OF_DR (reported, not gated)": motion, "PASS": beats}
    print(json.dumps(results["gate"]))
    (MODELS / f"probe{a.tag}.json").write_text(json.dumps(results, indent=1))


# ---------------------------------------------------------------- step 4: the distance-ahead head for the crash guard

def head(a) -> None:
    """Ridge from the frozen latent to the distance of the nearest trunk within 45 degrees ahead (capped at 5 m), on every
    flight below the test block's data seeds (all 131 training/held-out flights are fine: the guard is tested on new forests)."""
    import torch
    from sklearn.linear_model import RidgeCV
    data = Data(2)
    L, n = data.lab, data.n
    ck = torch.load(MODELS / f"{a.model}.pt", map_location="cuda")
    Encoder, _, _ = build_model(dim=ck["cfg"]["dim"], T=ck["cfg"]["T"], pool=ck["cfg"].get("pool", "mean"))
    enc = Encoder().cuda()
    enc.load_state_dict(ck["enc"])
    enc.eval()
    zs = []
    with torch.no_grad(), torch.autocast("cuda", dtype=torch.bfloat16):
        for s in range(0, n, 2048):
            zs.append(enc(torch.from_numpy(np.ascontiguousarray(data.frames[s:s + 2048])).cuda()).float().cpu().numpy())
    Z = np.concatenate(zs)
    y = np.nan_to_num(np.clip(L["ahead_d"], 0, 5), nan=5.0)
    held = L["seed"] >= 20200
    mu, sd = Z[~held].mean(0), Z[~held].std(0) + 1e-6
    r = RidgeCV(alphas=(0.1, 1, 10, 100, 1000, 1e4)).fit((Z[~held] - mu) / sd, y[~held])
    p = r.predict((Z[held] - mu) / sd)
    near = y[held] < 1.0
    out = {"alpha": float(r.alpha_), "r2_held": round(float(r.score((Z[held] - mu) / sd, y[held])), 3), "mae_held": round(float(np.abs(p - y[held]).mean()), 3),
           "mae_held_under_1m": round(float(np.abs(p[near] - y[held][near]).mean()), 3), "n_under_1m": int(near.sum())}
    # the guard's real question is yes/no: a trunk within CLOSE m ahead. Logistic on the same latents, scored by AUC on held-out flights
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import roc_auc_score
    yc = y < CLOSE
    clf = LogisticRegression(C=a.C, max_iter=2000).fit((Z[~held] - mu) / sd, yc[~held])
    pc = clf.predict_proba((Z[held] - mu) / sd)[:, 1]
    out.update(close_m=CLOSE, close_share=round(float(yc[held].mean()), 3), auc_held=round(float(roc_auc_score(yc[held], pc)), 3),
               hit_at_10pct_false=round(float((pc[yc[held]] > np.quantile(pc[~yc[held]], 0.9)).mean()), 3))
    np.savez(MODELS / f"{a.model}_head.npz", mu=mu, sd=sd, coef=r.coef_.astype(np.float32), intercept=np.float32(r.intercept_),
             ccoef=clf.coef_[0].astype(np.float32), cint=np.float32(clf.intercept_[0]), close=np.float32(CLOSE))
    print(json.dumps(out))
