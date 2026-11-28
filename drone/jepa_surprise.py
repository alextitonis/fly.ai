"""PLAN.md section 9, step 5: surprise on patrol. Does the JEPA's prediction error flag things it has never seen?

    python drone/jepa_surprise.py collect --seed 10021            # one 240 s random flight; even seeds get novel objects, odd seeds none
    python drone/jepa_surprise.py batch --first-seed 10021 --flights 8
    python drone/jepa_surprise.py score --first-seed 10021 --flights 8

Novel objects (stand-ins, ours, never in the JEPA's training data): standing people in bright shirts, deer (a brown body on four
legs), and blue tarps. Fire is NOT a test of novelty here: the training flights had fires in them.

Surprise = how badly the predictor guessed the current latent from the last 0.6 s of latents and the commands flown. The comparison
is the classic way to flag the unusual without labels: PCA on pixels fitted on the training frames, scored by reconstruction error.
Labels: a segmentation render counts each novel object's pixels in the three cameras; a frame counts as "something new in view" at
NOVEL_PX pixels or more. Positives are those frames on novel flights, negatives every frame of the flights without objects.
Data goes to ~/fly-data/jepa/surprise. Flights here use the test block (10001-10099) and never train anything.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE), str(HERE.parent)]
from jepa import CAMS, DATA, logging_sim  # noqa: E402

OUT = DATA / "surprise"
NOVEL_PX = 20          # pixels of a novel object across the three 64 x 48 cameras: "in view" for the reported frame-level numbers
ONSET_PX, ONSET_N = 60, 3   # the gated measure: the first 3 samples (0.6 s) of each stretch with 60+ pixels, fixed on dev 11-26
N_OBJECTS = 6
HISTORY = 3


def novel_class():
    import mujoco

    import forest

    class NovelForest(forest.ForestSim):
        def __init__(self, seed: int, decoys: bool = False, fire: bool = False, novel: bool = True):
            self.novel = novel
            self.novel_rng = np.random.default_rng(seed + 95000)
            super().__init__(seed, decoys, fire)
            self.novel_ids = np.array([g for g in range(self.model.ngeom) if (self.model.geom(g).name or "").startswith("novel")], int)
            self.seg = None

        def _build(self, n_fruit, leader, decoy, people):
            spec = forest.build(self.plan)
            if not self.novel:
                return spec
            w, r = spec.worldbody, self.novel_rng
            trees = np.array(self.plan["trees"])
            none = {"contype": 0, "conaffinity": 0}
            placed = []
            for k in range(N_OBJECTS):
                for _ in range(500):
                    p = r.uniform(-forest.HALF + 1, forest.HALF - 1, 2)
                    if np.min(np.hypot(*(trees - p).T)) > 1.2 and np.hypot(*(p - forest.START)) > 3 and all(np.hypot(*(p - q)) > 3 for q in placed):
                        break
                placed.append(p)
                x, y = p
                h = r.uniform(-np.pi, np.pi)
                kind = ("person", "deer", "tarp")[k % 3]
                if kind == "person":
                    shirt = [*r.choice([[0.9, 0.2, 0.2], [0.2, 0.5, 0.95], [0.95, 0.85, 0.1], [0.6, 0.2, 0.8]]), 1]
                    for j, (t, size, z, rgba) in enumerate((("capsule", [0.07, 0.4], 0.45, [0.15, 0.15, 0.2, 1]), ("capsule", [0.16, 0.26], 1.2, shirt),
                                                             ("sphere", [0.11, 0], 1.62, [0.85, 0.65, 0.5, 1]))):
                        w.add_geom(name=f"novel{k}_{j}", type=getattr(mujoco.mjtGeom, f"mjGEOM_{t.upper()}"), size=[*size, 0], pos=[x, y, z], rgba=rgba, **none)
                elif kind == "deer":
                    c, s = np.cos(h), np.sin(h)
                    brown = [0.5, 0.33, 0.18, 1]
                    w.add_geom(name=f"novel{k}_0", type=mujoco.mjtGeom.mjGEOM_ELLIPSOID, size=[0.55, 0.2, 0.22], pos=[x, y, 0.95], euler=[0, 0, h], rgba=brown, **none)
                    w.add_geom(name=f"novel{k}_1", type=mujoco.mjtGeom.mjGEOM_ELLIPSOID, size=[0.18, 0.1, 0.12], pos=[x + 0.6 * c, y + 0.6 * s, 1.35], euler=[0, 0, h], rgba=brown, **none)
                    for j, (dx, dy) in enumerate(((0.4, 0.12), (0.4, -0.12), (-0.4, 0.12), (-0.4, -0.12))):
                        w.add_geom(name=f"novel{k}_{j + 2}", type=mujoco.mjtGeom.mjGEOM_CYLINDER, size=[0.04, 0.38, 0],
                                   pos=[x + dx * c - dy * s, y + dx * s + dy * c, 0.38], rgba=[0.35, 0.22, 0.12, 1], **none)
                else:
                    w.add_geom(name=f"novel{k}_0", type=mujoco.mjtGeom.mjGEOM_BOX, size=[0.8, 0.6, 0.45], pos=[x, y, 0.45], euler=[0, 0, h], rgba=[0.15, 0.35, 0.85, 1], **none)
            return spec

        def novel_pixels(self, width: int, height: int) -> int:
            if not self.novel or len(self.novel_ids) == 0:
                return 0
            if self.seg is None:
                self.seg = mujoco.Renderer(self.model, height, width)
                self.seg.enable_segmentation_rendering()
            total = 0
            for c in CAMS:
                self.seg.update_scene(self.data, f"eye_{c}", scene_option=self.eye_view)
                ids = self.seg.render()[..., 0]
                total += int(np.isin(ids, self.novel_ids).sum())
            return total

    return NovelForest


def collect(a) -> Path:
    novel = a.seed % 2 == 0
    base = novel_class()
    LogSim = logging_sim(base, "random", 0.0, 64, 48, a.seed)

    class Labelled(LogSim):
        def _sample(self) -> None:
            L = self.log
            if L is not None:
                px = L.setdefault("novel_px", [])
                if len(L["frames"]) > len(L["cmd"]) and px:
                    px.pop()
            super()._sample()
            if self.log is not None:
                self.log["novel_px"].append(self.novel_pixels(64, 48))

    t0 = time.time()
    rng = np.random.default_rng(a.seed + 96000)
    sim = Labelled(a.seed, bool(rng.random() < 0.5), False, novel)
    crashes = 0
    while sim.t < a.seconds:
        sim.step()
        if sim.crashed:
            crashes += 1
            t = sim.data.time
            sim.reset()
            sim.data.time = t
    arr = sim.arrays()
    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f"surprise_{a.seed}.npz"
    np.savez_compressed(out, novel=novel, **arr)
    meta = {"seed": a.seed, "novel": novel, "samples": int(len(arr["cmd"])), "in_view": int((arr["novel_px"] >= NOVEL_PX).sum()),
            "crashes": crashes, "wall_s": round(time.time() - t0, 1)}
    out.with_suffix(".json").write_text(json.dumps(meta))
    print(json.dumps(meta))
    return out


def batch(a) -> None:
    env = {**os.environ, "NUMBA_NUM_THREADS": "2", "OMP_NUM_THREADS": "2"}
    for s in range(a.first_seed, a.first_seed + a.flights):
        if (OUT / f"surprise_{s}.npz").exists():
            continue
        r = subprocess.run([sys.executable, str(Path(__file__)), "collect", "--seed", str(s), "--seconds", str(a.seconds)], env=env, capture_output=True, text=True)
        print(s, r.returncode, (r.stdout.strip().splitlines() or [""])[-1], "" if r.returncode == 0 else r.stderr.strip()[-400:], flush=True)


# ---------------------------------------------------------------- scores

def scores(a) -> dict:
    """Per flight: JEPA surprise and PCA reconstruction error for every frame that has HISTORY frames before it in the same run."""
    import torch
    from sklearn.decomposition import PCA

    from jepa_fit import CMD_SCALE, MODELS, PACK, build_model
    ck = torch.load(MODELS / f"{a.model}.pt", map_location="cuda")
    cfg = ck["cfg"]
    Encoder, Predictor, _ = build_model(dim=cfg["dim"], T=cfg["T"], pool=cfg.get("pool", "mean"))
    enc, pred = Encoder().cuda().eval(), Predictor().cuda().eval()
    enc.load_state_dict(ck["enc"])
    pred.load_state_dict(ck["pred"])
    # PCA fitted on training frames only (the pack; seeds 20001 and up), halved in size as in the probes
    frames = np.load(PACK / "frames.npy", mmap_mode="r")
    idx = np.sort(np.random.default_rng(2).choice(len(frames), 8000, replace=False))
    small = lambda f: np.asarray(f[:, :, ::2, ::2]).reshape(len(f), -1).astype(np.float32) / 255   # noqa: E731
    pca = PCA(128, random_state=0).fit(np.concatenate([small(frames[i:i + 1]) for i in idx]))
    out = {}
    for s in range(a.first_seed, a.first_seed + a.flights):
        f = OUT / f"surprise_{s}.npz"
        if not f.exists():
            continue
        d = np.load(f)
        x = d["frames"]
        with torch.no_grad(), torch.autocast("cuda", dtype=torch.bfloat16):
            z = torch.cat([enc(torch.from_numpy(x[i:i + 1024]).cuda()).float() for i in range(0, len(x), 1024)])
        cmd = torch.from_numpy(d["cmd"] / CMD_SCALE).float().cuda()
        start = d["start"].astype(bool)
        ok = np.zeros(len(x), bool)
        for t in range(HISTORY, len(x)):
            ok[t] = not start[t - HISTORY + 1: t + 1].any()
        ts = np.flatnonzero(ok)
        surprise = np.full(len(x), np.nan, np.float32)
        with torch.no_grad():
            for b in range(0, len(ts), 512):
                tt = torch.as_tensor(ts[b:b + 512], device="cuda")
                hist = tt[:, None] - torch.arange(HISTORY, 0, -1, device="cuda")      # t-3, t-2, t-1
                p = pred(z[hist], cmd[hist])[:, -1]
                surprise[ts[b:b + 512]] = (p - z[tt]).square().mean(1).float().cpu().numpy()
        xs = small(x)
        recon = ((pca.inverse_transform(pca.transform(xs)) - xs) ** 2).mean(1)
        out[s] = {"novel": bool(d["novel"]), "ok": ok, "px": d["novel_px"], "jepa": surprise, "pca": recon.astype(np.float32)}
    return out


def auc(pos: np.ndarray, neg: np.ndarray) -> float:
    from sklearn.metrics import roc_auc_score
    return float(roc_auc_score(np.r_[np.ones(len(pos)), np.zeros(len(neg))], np.r_[pos, neg]))


def score(a) -> dict:
    S = scores(a)
    novel = [s for s, v in S.items() if v["novel"]]
    plain = [s for s, v in S.items() if not v["novel"]]

    def gather(seeds, key, positive):
        vals = []
        for s in seeds:
            v = S[s]
            m = v["ok"] & ((v["px"] >= NOVEL_PX) if positive else True)
            vals.append(v[key][m])
        return np.concatenate(vals) if vals else np.zeros(0)

    res = {"novel_flights": len(novel), "plain_flights": len(plain)}
    for key in ("jepa", "pca"):
        res[key] = {"auc": round(auc(gather(novel, key, True), gather(plain, key, False)), 3)}
        # encounters: runs of in-view frames; caught if any frame in it is over the 99th percentile of plain flights (about 3 false calls a minute at 5 a second)
        thr = np.quantile(gather(plain, key, False), 0.99)
        caught = total = 0
        for s in novel:
            v = S[s]
            vis = (v["px"] >= NOVEL_PX) & v["ok"]
            runs = np.flatnonzero(np.diff(np.r_[0, vis.astype(int), 0]))
            for b, e in zip(runs[::2], runs[1::2]):
                if e - b >= 2:
                    total += 1
                    caught += bool((v[key][b:e] > thr).any())
        res[key].update(encounters=total, caught_at_1pct=caught)
    # the gated measure: onsets. Prediction error should spike when something appears, not while a still object stays in view
    def onsets(seeds, key):
        vals = []
        for s in seeds:
            v = S[s]
            r = np.flatnonzero(np.diff(np.r_[0, (v["px"] >= ONSET_PX).astype(int), 0]))
            for b, e in zip(r[::2], r[1::2]):
                seg = np.arange(b, min(e, b + ONSET_N))
                vals.append(v[key][seg[v["ok"][seg]]])
        return np.concatenate(vals) if vals else np.zeros(0)
    for key in ("jepa", "pca"):
        res[key]["frame_auc_reported"] = res[key].pop("auc")
        res[key]["onset_auc"] = round(auc(onsets(novel, key), gather(plain, key, False)), 3)
    res["onset_positives"] = int(len(onsets(novel, "jepa")))
    res["positives"] = int(len(gather(novel, "jepa", True)))
    res["negatives"] = int(len(gather(plain, "jepa", False)))
    rng = np.random.default_rng(0)
    diffs = []
    for _ in range(a.boot):
        nv, pl = list(rng.choice(novel, len(novel))), list(rng.choice(plain, len(plain)))
        diffs.append(auc(onsets(nv, "jepa"), gather(pl, "jepa", False)) - auc(onsets(nv, "pca"), gather(pl, "pca", False)))
    res["auc_diff_interval"] = [round(float(np.quantile(diffs, 0.025)), 3), round(float(np.quantile(diffs, 0.975)), 3)]
    res["NOTICES"] = res["jepa"]["onset_auc"] >= 0.7
    res["BEATS_PCA"] = res["auc_diff_interval"][0] > 0
    res["PASS"] = res["NOTICES"] and res["BEATS_PCA"]
    print(json.dumps(res, indent=1))
    (OUT / f"score_{a.first_seed}.json").write_text(json.dumps(res, indent=1))
    return res


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("what", choices=("collect", "batch", "score"))
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--first-seed", type=int, default=10021)
    ap.add_argument("--flights", type=int, default=8)
    ap.add_argument("--seconds", type=float, default=240.0)
    ap.add_argument("--model", default="cols")
    ap.add_argument("--boot", type=int, default=300)
    a = ap.parse_args()
    if a.what == "collect":
        if not 10001 <= a.seed <= 10099:
            raise SystemExit("surprise flights use the test block 10001-10099")
        collect(a)
    elif a.what == "batch":
        batch(a)
    else:
        score(a)


if __name__ == "__main__":
    main()
