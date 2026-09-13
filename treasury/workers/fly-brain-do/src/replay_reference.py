"""Replay recorded matches through fresh brains, e.g. with different encoders.

fly_fighter.py --record saves every game state (<mid>.states.jsonl.gz).
Replaying re-runs the brain open-loop on those states: the fly's actions stay
what they were, but the brain can be told the game differently. Each fly in a
batch gets its own encoder (fly_eyes.ENCODER parameters), so 8 encoders cost
about one replay's GPU time.

Readouts are scored leave-one-match-out, exactly as in reservoir.py:
  * punch: will this press connect?  (held-out AUC)
  * dodge: with an enemy shot approaching, does jumping now avoid getting hit?
    (held-out hit rate of the moments where the random choice matched the
    readout's choice, against always / never jumping)

    python replay.py encoders recordings3     # score 8 encoder variants
    python replay.py dodge recordings3        # dodge readout, default encoder, 8 voting flies
"""
from __future__ import annotations

import gzip
import json
import sys
from pathlib import Path

import numpy as np
from scipy.special import expit

from fly_fighter import JUMP_NEAR, detector_inputs, what_the_fly_sees
from reservoir import (COMPONENTS, HORIZON, LAMBDAS, bases_for, cv_attack, fit_logistic, fmt, folds, pick,
                       project)

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from fly_brain import FlyBrain
from fly_eyes import ENCODER, Eyes, FeatureDetectors

DODGE_WINDOW = 30              # frames (1 s) after a decision in which a projectile hit counts
NO_JUMP_EVERY = 5              # keep every 5th shot-near frame without a jump (they're highly correlated)
# Round 1 (channel on/off and gains, 20 matches in recordings3) showed looming matters most for
# punches and that the fly barely sees distance, which the best game-state baseline uses. Round 2
# gives it distance through the fly's own channels: looming neurons that also respond to size,
# a steeper chase signal, and a higher cap. Unset parameters keep the hand-set value.
VARIANTS = {
    "hand-set":        {},
    "loom x2":         {"loom_gain": 20.0},
    "loom+size":       {"loom_size": 0.3},
    "loom+size x2":    {"loom_size": 0.6},
    "chase steep":     {"chase_base": 0.3, "chase_gain": 0.6},
    "chase steep+cap": {"chase_base": 0.3, "chase_gain": 0.6, "cap": 1.2},
    "size+chase":      {"loom_size": 0.3, "chase_base": 0.3, "chase_gain": 0.6},
    "cap 1.2":         {"cap": 1.2},
}


def encoder_arrays(settings: list[dict]) -> dict[str, np.ndarray]:
    """One encoder per fly -> {parameter: array with one value per fly}."""
    return {k: np.asarray([s.get(k, v) for s in settings], np.float32) for k, v in ENCODER.items()}


def load(path: Path) -> list[dict]:
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


# ---- which moments to learn from ----------------------------------------------------------

def fighting(st: dict) -> bool:
    return st.get("phase") == "fight" and bool(st.get("you")) and bool(st.get("opp"))


def press_moments(frames: list[dict], action: str = "punch"):
    """Presses the game acted on -> [(t, distance, connected)] (same rule as reservoir.press_samples)."""
    out = []
    pressed = [bool(fr["cmd"].get("punch") or fr["cmd"].get("kick")) for fr in frames]
    for t, fr in enumerate(frames):
        st, you = fr["state"], fr["state"].get("you") or {}
        if not (fr["cmd"].get(action) and you.get("actionable") and fighting(st)):
            continue
        end = min(len(frames), t + 1 + HORIZON)
        nxt = [k for k in range(t + 1, end) if pressed[k]]
        window = frames[t + 1:(nxt[0] if nxt else end)]
        if not any((w["state"].get("you") or {}).get("attack", "none") != "none" for w in window):
            continue                                   # the game ignored this press
        hit = any((w["state"].get("you") or {}).get("attackConnected") for w in window)
        out.append((t, abs(st["opp"]["x"] - you["x"]), float(hit)))
    return out


def nearest_shot(st: dict):
    """(distance, speed) of the closest hostile projectile flying toward the fly, or None."""
    you, best = st["you"], None
    for p in st.get("projectiles") or []:
        if p.get("ownedBy") != "opponent" or p.get("dangerous") is False or p.get("canHit") is False:
            continue
        dx = you["x"] - p.get("x", 0)
        if dx * p.get("vx", 0) <= 0:                  # not approaching
            continue
        if best is None or abs(dx) < best[0]:
            best = (abs(dx), abs(p.get("vx", 0)))
    return best


def dodge_moments(frames: list[dict]):
    """Decisions with a shot approaching within JUMP_NEAR -> [(t, jumped, got_hit, game features)].
    Jumps here were random (recording mode), so both choices are fair samples."""
    out, skip = [], 0
    for t, fr in enumerate(frames):
        st = fr["state"]
        if not fighting(st):
            continue
        you = st["you"]
        if not you.get("actionable") or you.get("y"):
            continue
        shot = nearest_shot(st)
        if shot is None or shot[0] > JUMP_NEAR:
            continue
        jumped = bool(fr.get("jump_random"))
        if not jumped:
            skip += 1
            if skip % NO_JUMP_EVERY:
                continue
        end = t + DODGE_WINDOW
        if end >= len(frames):
            continue
        seg = [frames[k]["state"] for k in range(t, end + 1)]
        if any(not fighting(s) or s.get("round") != st.get("round") for s in seg):
            continue
        hit = False
        for a, b in zip(seg, seg[1:]):
            if b["you"]["hp"] < a["you"]["hp"] and not a["opp"].get("hitboxActive"):
                hit = True                             # damage without a live melee hitbox: a projectile
                break
        d, v = shot
        out.append((t, float(jumped), float(hit), [d, d ** 2 / 100, 10 / (d + 5), v]))
    return out


# ---- replay -------------------------------------------------------------------------------

def replay(frames: list[dict], brain: FlyBrain, encoder: dict, want: set[int], seed: int = 0) -> dict:
    """Run one match through `brain`; encoder: fly_eyes.ENCODER parameters, each an array with one
    value per fly. -> {frame: (flies, descending neurons) spike traces} for the frames in `want`."""
    dn = np.flatnonzero(brain.superclass == "descending_neuron")
    slot = np.full(brain.n, -1, np.int64)
    slot[dn] = np.arange(len(dn))
    trace = np.zeros((brain.batch, len(dn)), np.float32)
    decay = np.float32(np.exp(-brain.dt / 0.1))
    eyes, detectors = Eyes(brain.azimuth), FeatureDetectors(brain, **encoder)
    brain.reset(seed)
    for _ in range(250):
        brain.step(eyes.drive([]))
    game_time = brain.steps * brain.dt
    out = {}
    for t, fr in enumerate(frames):
        st = fr["state"]
        game_time += 1 / 30
        inject = detectors.inject(*detector_inputs(st))
        blobs = what_the_fly_sees(st)
        steps = 0
        while brain.steps * brain.dt < game_time and steps < 3:
            fired = brain.step(eyes.drive(blobs), inject)
            trace *= decay
            for f, idx in enumerate(fired if isinstance(fired, list) else [fired]):
                s = slot[idx]
                trace[f, s[s >= 0]] += 1.0
            steps += 1
        if brain.steps * brain.dt < game_time - 0.1:
            game_time = brain.steps * brain.dt
        if t in want:
            out[t] = trace.copy()
    return out


def replay_folder(folder: str, encoder: dict, cache_key: str, average: bool = False):
    """Replay every recorded match once -> per match: (frames, punch moments, dodge moments,
    {frame: traces}). Results are cached in <folder>/replay/<cache_key>/."""
    files = sorted(Path(folder).glob("*.states.jsonl.gz"))
    if not files:
        sys.exit(f"no *.states.jsonl.gz in {folder}; record with fly_fighter.py --record")
    cache = Path(folder) / "replay" / cache_key
    cache.mkdir(parents=True, exist_ok=True)
    flies = len(next(iter(encoder.values())))
    brain = None
    matches = []
    for i, path in enumerate(files):
        frames = load(path)
        punches, dodges = press_moments(frames), dodge_moments(frames)
        want = {m[0] for m in punches} | {m[0] for m in dodges}
        cached = cache / (path.name.split(".")[0] + ".npz")
        if cached.exists():
            d = np.load(cached)
            traces = {int(t): x for t, x in zip(d["t"], d["X"])}
        else:
            if brain is None:
                brain = FlyBrain(device="auto", batch=flies)
                print(f"replaying on {brain.device}, {brain.batch} flies at once", flush=True)
            traces = replay(frames, brain, encoder, want, seed=i)
            ts = sorted(traces)
            np.savez_compressed(cached, t=np.asarray(ts, np.int64),
                                X=np.stack([traces[t] for t in ts]).astype(np.float16) if ts else
                                np.zeros((0, flies, 1), np.float16))
        if average:
            traces = {t: x.mean(0, keepdims=True) for t, x in traces.items()}
        print(f"  {path.name.split('.')[0]}: {len(frames)} frames, {len(punches)} punches, "
              f"{len(dodges)} dodge decisions", flush=True)
        matches.append((frames, punches, dodges, traces))
    return matches


# ---- scoring ------------------------------------------------------------------------------

MIN_SAMPLES = 30   # below this a held-out score means nothing


def rows(traces: dict, ts, fly: int, width: int) -> np.ndarray:
    """One fly's traces at frames ts, as (len(ts), width); works for an empty ts."""
    return np.asarray([traces[t][fly] for t in ts], np.float32).reshape(len(ts), width)


def trace_width(matches) -> int:
    return next(x.shape[-1] for *_, traces in matches for x in traces.values())


def punch_auc(matches, fly: int) -> float:
    width, per_match = trace_width(matches), []
    for _, punches, _, traces in matches:
        X = rows(traces, [t for t, _, _ in punches], fly, width)
        per_match.append((X, np.asarray([d for _, d, _ in punches], np.float32),
                          np.asarray([y for _, _, y in punches])))
    if sum(m[2].sum() for m in per_match) < 5:
        return float("nan")
    res = cv_attack(per_match, lambda m: m[0], [(k, lam) for k in COMPONENTS for lam in LAMBDAS])
    return res[pick(res)][0]


def dodge_sets(matches, fly: int | None):
    """Per match: (features, jumped, hit). fly=None -> the game-state baseline features."""
    out = []
    width = trace_width(matches) if fly is not None else 4
    for _, _, dodges, traces in matches:
        if fly is None:
            X = np.asarray([g for *_, g in dodges], np.float32).reshape(len(dodges), 4)
        else:
            X = rows(traces, [t for t, *_ in dodges], fly, width)
        out.append((X, np.asarray([j for _, j, _, _ in dodges]), np.asarray([h for _, _, h, _ in dodges])))
    return out


def cv_dodge(per_match, grid):
    """Leave-one-match-out: fit P(hit) separately for jumping and not jumping; jump when it's
    predicted to be safer. Value = held-out hit rate where the random choice equals the policy's."""
    chosen = {g: [] for g in grid}
    for k in range(len(per_match)):
        test = per_match[k]
        train = [m for j, m in enumerate(per_match) if j != k and len(m[2])]
        if not len(test[2]) or not train:
            continue
        Xtr = np.concatenate([m[0] for m in train])
        jtr = np.concatenate([m[1] for m in train])
        htr = np.concatenate([m[2] for m in train])
        if any(htr[jtr == j].min() == htr[jtr == j].max() for j in (0, 1) if (jtr == j).any()) or len(set(jtr)) < 2:
            continue
        bases = bases_for(Xtr, {kk for kk, _ in grid})
        for kk, lam in grid:
            Ztr, Zte = project(bases[kk], Xtr), project(bases[kk], test[0])
            p = {}
            for j in (0, 1):
                w, b = fit_logistic(Ztr[jtr == j], htr[jtr == j], lam)
                p[j] = expit(Zte @ w + b)
            policy = (p[1] < p[0]).astype(float)
            chosen[(kk, lam)].append(test[2][test[1] == policy])
    out = {}
    for g, parts in chosen.items():
        v = np.concatenate(parts) if parts else np.array([])
        out[g] = (-float(v.mean()) if len(v) else float("nan"), v)   # higher = fewer hits
    return out


def dodge_report(matches, fly: int = 0) -> float:
    per_match = dodge_sets(matches, fly)
    j = np.concatenate([m[1] for m in per_match])
    h = np.concatenate([m[2] for m in per_match])
    print(f"\ndodge: {len(h)} decisions with a shot approaching within {JUMP_NEAR:.0f} "
          f"({int(j.sum())} random jumps); hit = projectile damage in the next second")
    if len(h) < MIN_SAMPLES or j.sum() < 5 or (j == 0).sum() < 5:
        print("  not enough data: these opponents rarely shot at the fly")
        return float("nan")
    print(f"  {'always jump':28s} {fmt(h[j == 1])}")
    print(f"  {'never jump':28s} {fmt(h[j == 0])}")
    brain = cv_dodge(per_match, [(k, lam) for k in COMPONENTS for lam in LAMBDAS])
    game = cv_dodge(dodge_sets(matches, None), [(None, lam) for lam in LAMBDAS])
    if brain:
        g = pick(brain)
        print(f"  {'brain readout (held-out)':28s} {fmt(brain[g][1])}   {g[0]} components, lambda {g[1]:g}")
    if game:
        print(f"  {'game-state rule (held-out)':28s} {fmt(game[pick(game)][1])}   distance + shot speed")
    print("  (numbers are hit rates: lower is better)")
    return -brain[pick(brain)][0] if brain else float("nan")


def main():
    if len(sys.argv) < 3 or sys.argv[1] not in ("encoders", "dodge"):
        sys.exit(__doc__)
    mode, folder = sys.argv[1], sys.argv[2]
    if mode == "encoders":
        names = list(VARIANTS)
        matches = replay_folder(folder, encoder_arrays([VARIANTS[n] for n in names]), "encoders-v2")
        n_dodge = sum(len(m[2]) for m in matches)
        print(f"\n{'encoder':12s} {'punch AUC':>10s} {'dodge hit rate':>15s}   (held-out; one fly per encoder)")
        for f, name in enumerate(names):
            a = punch_auc(matches, f)
            d = (-pick_value(cv_dodge(dodge_sets(matches, f), [(k, lam) for k in COMPONENTS for lam in LAMBDAS]))
                 if n_dodge >= MIN_SAMPLES else float("nan"))
            print(f"{name:12s} {a:10.3f} {d:15.3f}", flush=True)
        if n_dodge < MIN_SAMPLES:
            print(f"(dodge n/a: only {n_dodge} decisions with a shot approaching)")
    else:
        matches = replay_folder(folder, encoder_arrays([{}] * 8), "hand-set-x8", average=True)
        dodge_report(matches, fly=0)


def pick_value(results) -> float:
    return results[pick(results)][0] if results else float("nan")


if __name__ == "__main__":
    main()
