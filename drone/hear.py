"""Can sound carry commands between drones? The bench test: what the fly's ear (Johnston's organ) can drive, no flying.

    python drone/hear.py --seed 5051            # about 12 min, real wiring then scrambled, drone/runs/hear/<seed>.npz
    python drone/hear.py --seed 5051 --score    # score a finished run again

A microphone would be a model, as the camera is: it decides which ear neurons a chirp reaches and how hard. Everything after
those neurons is the connectome. Four ear channels (JO-A, JO-B, JO-C, JO-E), left or right antenna, three loudnesses, 1.5 s.

Rules fixed before running, all at the same loudness in one channel, against silence and scrambled wiring:
  tell apart   a fixed decoder on the descending neurons (ridge, 4-fold) names channel and side (9 classes with silence) at
               0.8 V at least 60% of the time, 20 points over scrambled
  come here    the sound's side turns the pilot's yaw at least 0.3 rad/s the right way in 75% of flies, 20 points over scrambled;
               silence turns at most 25%
  alarm        the pilot's jump (DNp01) in at least 75% of flies, 20 points over scrambled; silence at most 10%
  stop         the pilot's brake to a stop (MDN, 4 spikes in 0.5 s) in at least 75% of flies, 20 points over scrambled; silence at most 10%
  dopamine     a PAM or PPL1 type rises at least 2 Hz over silence, z at least 3.5 (many types are tried), at least 1 Hz more
               than the same type on scrambled wiring
This run is a screen across many channels, so a pass only counts once it repeats on another fresh seed.

Added after the first run, before seeing any result from it: at 20 ms steps PAM and most PPL1 types rest at the model's 50 Hz
ceiling, so that dopamine rule can't pass. `--dopamine` runs the same rule at 2 ms steps with a 4 ms refractory period (as in
flytalk.py), channels at 0.8 V scaled like the tonic drive. A type resting above 90% of its ceiling counts as "can't tell", not "no".

Follow-up, rule fixed after that run missed: JO-C raised PAM04, PAM09, PAM10 and PAM11 by 7-8 Hz with z near 2 on 8 flies a side.
`--dopamine --channels JO-C --flies 16` on a fresh seed: those four types together rise at least 2 Hz over silence, z at least 3, at
least 1 Hz more than on scrambled wiring. Reported with how many flies rose, because a few bursting flies wouldn't make a usable signal.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from scipy import sparse
from scipy.sparse.csgraph import dijkstra

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE), str(HERE.parent)]
from flybrain import FlyBrain  # noqa: E402
from flytalk import rewire  # noqa: E402
from pilot import ESCAPE_SPIKES, ESCAPE_WINDOW, GROUPS, TURN_GAIN, WIND_DN, WIND_TURN, WINDOW  # noqa: E402

OUT = HERE / "runs" / "hear"
CHANNELS = ("JO-A", "JO-B", "JO-C", "JO-E")
LOUD = (0.2, 0.4, 0.8)
FLIES = 16
WARM, SOUND = 25, 75       # brain steps, 20 ms each
TURN_MIN = 0.3             # rad/s
STOP_SPIKES = 4            # MDN spikes in the pilot's window that brake the 0.6 m/s cruise to nothing


def ear(brain, channel: str, side: str) -> np.ndarray:
    return brain.cells(sorted({str(t) for t in np.unique(brain.cell_type) if str(t).startswith(channel)}), side)


def dopamine_types(brain) -> list[str]:
    return sorted({str(t) for t in np.unique(brain.cell_type) if str(t).startswith(("PAM", "PPL1"))})


def conditions() -> list[tuple[str, str, float]]:
    return [("silence", "-", 0.0)] + [(c, s, v) for c in CHANNELS for s in "LR" for v in LOUD]


def play(brain, cells, volts, seed, idx, types_idx) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """One condition, every fly. Returns descending-neuron counts, dopamine Hz per type, and pilot groups per step."""
    brain.reset(seed)
    lut = np.zeros(brain.n, bool)
    dn, groups = idx
    whole = np.zeros((FLIES, brain.n), np.int32)
    trace = np.zeros((FLIES, SOUND, len(groups)), np.int16)
    inject = [(cells, volts)] if cells is not None else []
    for _ in range(WARM):
        brain.step(None, inject=[])
    for t in range(SOUND):
        for b, f in enumerate(brain.step(None, inject=inject)):
            whole[b, f] += 1
            lut[:] = False
            lut[f] = True
            trace[b, t] = [lut[g].sum() for g in groups]
    hz = np.stack([whole[:, i].mean(1) / (SOUND * brain.dt) for i in types_idx], 1)
    return whole[:, dn].astype(np.int16), hz.astype(np.float32), trace


def run_all(brain, seed: int) -> dict:
    sc = brain.superclass.astype(str)
    dn = np.flatnonzero(np.isin(sc, ["descending_neuron", "descending_neuron_tbc"]))
    groups = [brain.groups[g] for g in GROUPS[:6]] + [brain.cells(WIND_DN, s) for s in "LR"]
    types = dopamine_types(brain)
    types_idx = [brain.cells([t]) for t in types]
    out: dict = {"dn": [], "hz": [], "trace": []}
    for i, (c, s, v) in enumerate(conditions()):
        cells = ear(brain, c, s) if c != "silence" else None
        d, h, tr = play(brain, cells, v, seed + 1000 * i, (dn, groups), types_idx)
        out["dn"].append(d), out["hz"].append(h), out["trace"].append(tr)
        print(f"  {c} {s} {v}: DN {d.sum(1).mean():.0f} spikes", flush=True)
    return {k: np.stack(v) for k, v in out.items()}


def wiring(brain) -> dict:
    """Fewest synapses from each ear channel to what matters, on the real wiring, excitatory or not."""
    W = sparse.csc_matrix((brain.weights, brain.indices, brain.indptr), shape=(brain.n, brain.n)).tocsr().T   # pre -> post
    W = W.tocsr()
    W.eliminate_zeros()
    W.data = np.abs(W.data)
    targets = {"PAM": [t for t in dopamine_types(brain) if t.startswith("PAM")], "PPL1": [t for t in dopamine_types(brain) if t.startswith("PPL1")],
               "DNa02 (turn)": ["DNa02"], "DNp01 (jump)": ["DNp01"], "MDN (brake)": ["MDN"], "wind DNs": WIND_DN}
    res = {}
    for c in CHANNELS:
        src = ear(brain, c, "L").tolist() + ear(brain, c, "R").tolist()
        hops = dijkstra(W, unweighted=True, indices=src, min_only=True)
        res[c] = {k: float(hops[brain.cells(t)].min()) for k, t in targets.items()}
    return res


def yaw(trace: np.ndarray) -> np.ndarray:
    """Average yaw rate the pilot would command, + is left: (flies,)."""
    per_window = trace.sum(1) * WINDOW / SOUND
    return TURN_GAIN * (per_window[:, 0] - per_window[:, 1]) + WIND_TURN * (per_window[:, 6] - per_window[:, 7])


def rolling(trace: np.ndarray, cols: list[int], window: int) -> np.ndarray:
    x = trace[..., cols].sum(-1)
    c = np.cumsum(np.c_[np.zeros(len(x), x.dtype), x], 1)
    return (c[:, window:] - c[:, :-window]).max(1)


def decoder(X: np.ndarray, y: np.ndarray, folds: int = 4, lam: float = 100.0) -> float:
    rng = np.random.default_rng(0)
    fold = rng.permutation(len(y)) % folds
    Y = np.eye(y.max() + 1)[y]
    right = 0
    for k in range(folds):
        a, b = fold != k, fold == k
        mu, sd = X[a].mean(0), X[a].std(0) + 1e-3
        A, B = (X[a] - mu) / sd, (X[b] - mu) / sd
        coef = np.linalg.solve(A @ A.T + lam * np.eye(len(A)), Y[a] - Y[a].mean(0))
        pred = (B @ A.T @ coef).argmax(1)
        right += (pred == y[b]).sum()
    return right / len(y)


def behave(r: dict, conds: list) -> dict:
    """Per channel and loudness, what share of flies did each thing."""
    tr, out = r["trace"], {}
    jump = lambda t: float((rolling(t, [4, 5], ESCAPE_WINDOW) >= ESCAPE_SPIKES).mean())         # noqa: E731
    stop = lambda t: float((rolling(t, [2, 3], WINDOW) >= STOP_SPIKES).mean())                  # noqa: E731
    sil = tr[0]
    out["silence"] = {"turns": float((np.abs(yaw(sil)) >= TURN_MIN).mean()), "jump": jump(sil), "stop": stop(sil)}
    for c in CHANNELS:
        for v in LOUD:
            L, R = conds.index((c, "L", v)), conds.index((c, "R", v))
            right = np.r_[yaw(tr[L]) >= TURN_MIN, yaw(tr[R]) <= -TURN_MIN]
            steer_only = np.r_[(tr[L][..., 0] - tr[L][..., 1]).sum(1) > 0, (tr[R][..., 0] - tr[R][..., 1]).sum(1) < 0]
            both = np.concatenate([tr[L], tr[R]])
            out[f"{c} {v}"] = {"right_way": float(right.mean()), "dna02_right_side": float(steer_only.mean()), "jump": jump(both), "stop": stop(both)}
    return out


def score(real: dict, scr: dict, types: list[str], hops: dict | None) -> dict:
    conds = conditions()
    res: dict = {"hops": hops, "tell_apart": {}, "dopamine": []}
    pick = [0] + [conds.index((c, s, 0.8)) for c in CHANNELS for s in "LR"]
    y = np.repeat(np.arange(len(pick)), FLIES)
    for name, r in (("real", real), ("scrambled", scr)):
        res["tell_apart"][name] = round(float(decoder(r["dn"][pick].reshape(len(y), -1).astype(np.float32), y)), 3)
    a, b = res["tell_apart"]["real"], res["tell_apart"]["scrambled"]
    res["rule_tell_apart"] = bool(a >= 0.6 and a - b >= 0.2)
    be, bs = behave(real, conds), behave(scr, conds)
    res["behaviour"], res["behaviour_scrambled"] = be, bs
    sil = be["silence"]
    res["rule_come_here"] = sorted(k for k in be if k != "silence" and be[k]["right_way"] >= 0.75 and be[k]["right_way"] - bs[k]["right_way"] >= 0.2 and sil["turns"] <= 0.25)
    res["rule_alarm"] = sorted(k for k in be if k != "silence" and be[k]["jump"] >= 0.75 and be[k]["jump"] - bs[k]["jump"] >= 0.2 and sil["jump"] <= 0.1)
    res["rule_stop"] = sorted(k for k in be if k != "silence" and be[k]["stop"] >= 0.75 and be[k]["stop"] - bs[k]["stop"] >= 0.2 and sil["stop"] <= 0.1)
    for c in CHANNELS:
        for v in LOUD:
            idx = [conds.index((c, s, v)) for s in "LR"]
            x, base = real["hz"][idx].reshape(-1, len(types)), real["hz"][0]
            xs, bases = scr["hz"][idx].reshape(-1, len(types)), scr["hz"][0]
            rise = x.mean(0) - base.mean(0)
            se = np.sqrt(x.var(0, ddof=1) / len(x) + base.var(0, ddof=1) / len(base)) + 1e-6
            rise_s = xs.mean(0) - bases.mean(0)
            for t, ri, z, rs in zip(types, rise, rise / se, rise_s):
                if ri >= 2 and z >= 3.5 and ri - rs >= 1:
                    res["dopamine"].append({"channel": f"{c} {v}", "type": t, "rise_hz": round(float(ri), 2), "z": round(float(z), 1), "scrambled_rise_hz": round(float(rs), 2)})
    return res


def dopamine_rates(brain, types_idx, seed: int, flies: int, channels=CHANNELS) -> tuple[list, np.ndarray]:
    """Dopamine Hz per type at silence and each channel and side: (conditions, flies, types)."""
    conds = [("silence", "-")] + [(c, s) for c in channels for s in "LR"]
    steps = lambda s: round(s / brain.dt)                                     # noqa: E731
    volts = 0.8 * (1 - np.exp(-brain.dt / brain.tau)) / (1 - np.exp(-0.020 / brain.tau))
    out = []
    for i, (c, s) in enumerate(conds):
        brain.reset(seed + 1000 * i)
        for _ in range(steps(0.5)):
            brain.step()
        inject = [(ear(brain, c, s), float(volts))] if c != "silence" else []
        whole = np.zeros((flies, brain.n), np.int32)
        for _ in range(steps(1.5)):
            for b, f in enumerate(brain.step(None, inject=inject)):
                whole[b, f] += 1
        out.append(np.stack([whole[:, j].mean(1) / 1.5 for j in types_idx], 1))
        print(f"  {c} {s}: PAM {out[-1][:, :15].mean():.1f} Hz", flush=True)
    return conds, np.stack(out)


def dopamine(a) -> None:
    flies, ceiling = a.flies, 1 / 0.006           # a spike, then 4 ms held at 0: one every 6 ms at most
    brain = FlyBrain(batch=flies, seed=a.seed, sensory_input=False, dt=0.002, refractory=0.004)
    types = dopamine_types(brain)
    idx = [brain.cells([t]) for t in types]
    channels = a.channels or CHANNELS
    conds, real = dopamine_rates(brain, idx, a.seed, flies, channels)
    rewire(brain, seed=a.seed + 3)
    _, scr = dopamine_rates(brain, idx, a.seed + 500, flies, channels)
    rest = real[0].mean(0)
    if a.channels:
        named = [types.index(t) for t in ("PAM04", "PAM09", "PAM10", "PAM11")]
        k = [conds.index((c, s)) for c in channels for s in "LR"]
        x, base = real[k].reshape(-1, len(types))[:, named].mean(1), real[0][:, named].mean(1)
        rise_s = scr[k].reshape(-1, len(types))[:, named].mean() - scr[0][:, named].mean()
        rise = x.mean() - base.mean()
        z = rise / (np.sqrt(x.var(ddof=1) / len(x) + base.var(ddof=1) / len(base)) + 1e-6)
        print(json.dumps({"rest_hz": round(float(base.mean()), 1), "rise_hz": round(float(rise), 2), "z": round(float(z), 1), "scrambled_rise_hz": round(float(rise_s), 2),
                          "flies_rising_2hz": f"{int((x >= base.mean() + 2).sum())}/{len(x)}", "silent_flies_at_that_level": f"{int((base >= base.mean() + 2).sum())}/{len(base)}",
                          "pass": bool(rise >= 2 and z >= 3 and rise - rise_s >= 1), "per_fly_hz": np.round(x, 1).tolist(), "silence_per_fly_hz": np.round(base, 1).tolist()}), flush=True)
    res = {"rest_hz": {t: round(float(v), 1) for t, v in zip(types, rest)}, "ceiling_hz": round(ceiling, 1),
           "cant_tell": [t for t, v in zip(types, rest) if v > 0.9 * ceiling], "hits": [], "largest": {}}
    for c in channels:
        k = [conds.index((c, s)) for s in "LR"]
        x, xs = real[k].reshape(-1, len(types)), scr[k].reshape(-1, len(types))
        rise = x.mean(0) - rest
        z = rise / (np.sqrt(x.var(0, ddof=1) / len(x) + real[0].var(0, ddof=1) / len(real[0])) + 1e-6)
        rise_s = xs.mean(0) - scr[0].mean(0)
        res["largest"][c] = [(types[j], round(float(rise[j]), 2), round(float(z[j]), 1), round(float(rise_s[j]), 2)) for j in np.argsort(-rise)[:4]]
        res["hits"] += [{"channel": c, "type": t, "rise_hz": round(float(r), 2), "z": round(float(q), 1), "scrambled_rise_hz": round(float(s), 2)}
                        for t, r, q, s in zip(types, rise, z, rise_s) if r >= 2 and q >= 3.5 and r - s >= 1 and t not in res["cant_tell"]]
    (OUT / f"dopamine{a.seed}.json").write_text(json.dumps(res, indent=1))
    print(json.dumps(res, indent=1))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--seed", type=int, default=5051)
    ap.add_argument("--score", action="store_true")
    ap.add_argument("--dopamine", action="store_true")
    ap.add_argument("--flies", type=int, default=8, help="with --dopamine")
    ap.add_argument("--channels", nargs="+", help="with --dopamine")
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    if a.dopamine:
        return dopamine(a)
    path = OUT / f"{a.seed}.npz"
    if not a.score:
        brain = FlyBrain(batch=FLIES, seed=a.seed, sensory_input=False)
        hops = wiring(brain)
        print(json.dumps(hops), flush=True)
        print("real", flush=True)
        real = run_all(brain, a.seed)
        print("scrambled", flush=True)
        rewire(brain, seed=a.seed + 3)
        scr = run_all(brain, a.seed + 500)
        np.savez_compressed(path, types=np.array(dopamine_types(brain)), hops=json.dumps(hops), **{f"real_{k}": v for k, v in real.items()},
                            **{f"scr_{k}": v for k, v in scr.items()})
    d = np.load(path)
    get = lambda p: {k: d[f"{p}_{k}"] for k in ("dn", "hz", "trace")}          # noqa: E731
    res = score(get("real"), get("scr"), [str(t) for t in d["types"]], json.loads(str(d["hops"])))
    (OUT / f"{a.seed}.json").write_text(json.dumps(res, indent=1))
    print(json.dumps({k: res[k] for k in res if not k.startswith("behaviour")}, indent=1))
    for k, v in res["behaviour"].items():
        print(k, v, "| scrambled", res["behaviour_scrambled"][k])


if __name__ == "__main__":
    main()
