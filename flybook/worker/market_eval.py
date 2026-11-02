"""Does learning make flies better fly-market traders? An offline check with criteria fixed before running.

Cohorts: the same flies (settings from a JSON list of real flies, traits drawn once from a fixed seed), the same
simulated price paths, and the same brain seed each round; only their learning differs:
  frozen    nothing learned (the phase 1 fly)
  dopamine  dopamine-gated gains and action biases only
  memory    kNN memory only
  tubes     slime-mold tubes only
  all       all three (what the live market runs)
PATHS price paths x ROUNDS rounds each, FLIES flies per cohort. The measure is each fly's final log portfolio value
(start 1 fake ETH), compared as pairs: the same fly on the same price path, learning vs frozen.

Pass criterion (fixed before running): for `all` vs `frozen`, the mean paired difference in final log value is
positive and its bootstrap 95% confidence interval (10,000 resamples of the pairs) excludes zero.
Each single learner is reported the same way; those are descriptive, not pass rules.

    python flybook/worker/market_eval.py FLIES.json [--paths 3 --rounds 40 --flies 12 --path-seed 777]
    python flybook/worker/market_eval.py FLIES.json ... --resume        # continue a paused run

Pause and resume: the run saves a checkpoint (OUT.checkpoint.json) every --save-every rounds and after each cohort;
Ctrl+C saves and stops. --resume continues from it with the same price paths, brain seeds and random state, so a
resumed run gives the same numbers as an uninterrupted one. A checkpoint made with other arguments is refused.

History: the first check (v1 learning, --path-seed 777) did NOT pass: all 0.76 vs frozen 1.19 fake ETH, paired log
diff -0.33 [-0.49, -0.17]. The v2 fixes (minds.py) were chosen from that failure's analysis, then checked once with
the same rule on new price paths and brain seeds (--path-seed 1777) so the check isn't a second look at the old paths.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
import time
from pathlib import Path

import numpy as np

import market
import minds
from actions import ActionReader
from episode import Episodes
from settings import clean

COHORTS = {
    "frozen": {"dopamine": False, "memory": False, "tubes": False},
    "dopamine": {"dopamine": True, "memory": False, "tubes": False},
    "memory": {"dopamine": False, "memory": True, "tubes": False},
    "tubes": {"dopamine": False, "memory": False, "tubes": True},
    "all": {"dopamine": True, "memory": True, "tubes": True},
}


def ci(diffs: np.ndarray, rng: np.random.Generator, n: int = 10_000) -> tuple[float, float, float]:
    boots = rng.choice(diffs, size=(n, len(diffs)), replace=True).mean(1)
    return float(diffs.mean()), float(np.percentile(boots, 2.5)), float(np.percentile(boots, 97.5))


def save(path: Path, data: dict) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data))
    tmp.replace(path)                                    # atomic: a kill mid-write never corrupts the checkpoint


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("flies_json", help="JSON list of flies (their senses, temperament and dials are used)")
    p.add_argument("--paths", type=int, default=3)
    p.add_argument("--rounds", type=int, default=40)
    p.add_argument("--flies", type=int, default=12)
    p.add_argument("--out", default="market_eval.json")
    p.add_argument("--path-seed", type=int, default=777, help="seed base for price paths and brain seeds")
    p.add_argument("--save-every", type=int, default=5, help="rounds between checkpoints")
    p.add_argument("--resume", action="store_true", help="continue from OUT.checkpoint.json")
    p.add_argument("--stop-after", type=int, default=0, help="pause as if Ctrl+C after this many rounds (tests resume)")
    p.add_argument("--prices-json", help="optional chronological JSON export of recorded bars ({prices: {symbol: USD price}}); runs one real-price replay path")
    p.add_argument("--max-bars", type=int, default=200, help="keep only the newest N bars in a recorded-price replay (default 200)")
    p.add_argument("--cohorts", default="frozen,dopamine,memory,tubes,all",
                   help="comma-separated cohorts to run; use frozen,all for the direct learning comparison")
    args = p.parse_args()
    rounds_this_run = 0

    replay_rows = None
    replay_start = None
    replay_moves = None
    replay_hash = None
    if args.prices_json:
        raw = Path(args.prices_json).read_bytes()
        replay_hash = hashlib.sha256(raw).hexdigest()
        payload = json.loads(raw)
        replay_rows = payload.get("bars", payload) if isinstance(payload, dict) else payload
        if not isinstance(replay_rows, list):
            raise SystemExit("--prices-json must be a list of recorded bars or an object with a bars list")
        replay_rows = sorted(replay_rows, key=lambda r: (str(r.get("at") or ""), int(r.get("bar_no") or 0)))
        if len(replay_rows) < 4 or any(not isinstance(r.get("prices"), dict) for r in replay_rows):
            raise SystemExit("--prices-json needs at least four bars, each with a prices object")
        if args.max_bars > 0:
            replay_rows = replay_rows[-args.max_bars:]
        replay_start, _ = market.real_prices([], replay_rows[0]["prices"])
        replay_moves = []
        coins = replay_start
        for row in replay_rows[1:]:
            coins, events = market.real_prices(coins, row["prices"])
            replay_moves.append((coins, events))
        if not replay_moves or not replay_start:
            raise SystemExit("--prices-json contains no usable prices")

    cohorts = [c.strip() for c in args.cohorts.split(",") if c.strip()]
    if not cohorts or len(set(cohorts)) != len(cohorts) or set(cohorts) - set(COHORTS):
        raise SystemExit(f"--cohorts must be a comma list from: {', '.join(COHORTS)}")
    selected = {c: COHORTS[c] for c in cohorts}
    n_paths = 1 if replay_rows is not None else args.paths
    n_rounds = len(replay_moves) if replay_moves is not None else args.rounds
    run_args = {k: getattr(args, k) for k in ("flies_json", "paths", "rounds", "flies", "path_seed", "prices_json",
                                               "max_bars", "cohorts")}
    if replay_hash:
        run_args["prices_sha256"] = replay_hash
    ckpt_path = Path(args.out).with_suffix(".checkpoint.json")
    ckpt = {"args": run_args, "done": {}, "running": None}
    if args.resume and ckpt_path.exists():
        loaded = json.loads(ckpt_path.read_text())
        if loaded.get("args") != run_args:
            raise SystemExit(f"{ckpt_path} was made with {loaded.get('args')}; run with the same arguments or delete it")
        ckpt = loaded
        print(f"resuming: {len(ckpt['done'])} cohort runs done"
              + (f", {ckpt['running']['key']} at round {ckpt['running']['round']}" if ckpt["running"] else ""), flush=True)
    elif ckpt_path.exists() and not args.resume:
        print(f"note: {ckpt_path} exists; starting over (use --resume to continue it)", flush=True)

    source = json.load(open(args.flies_json))
    flies = [{"id": f"eval-{i}", **{k: clean({k: f.get(k) or {} for k in ("senses", "temperament", "dials")})[k]
                                     for k in ("senses", "temperament", "dials")}} for i, f in enumerate(source[: args.flies])]
    eps = Episodes(batch=len(flies))
    reader = ActionReader(eps)
    reader.fit()
    settings_of = lambda f: {k: f.get(k) or {} for k in ("senses", "temperament", "dials")}
    t0 = time.perf_counter()
    reader.fit_profiles(reader.missing([settings_of(f) for f in flies]), seed=4242)
    print(f"{len(reader.own)} resting profiles in {time.perf_counter() - t0:.0f} s", flush=True)

    try:
        for path in range(n_paths):
            if replay_moves is not None:
                coins, moves = replay_start, replay_moves
            else:
                price_rng = np.random.default_rng([args.path_seed, path])
                coins, moves = market.seed_coins(), []
                for _ in range(n_rounds):
                    coins, events = market.move_prices(coins, price_rng)
                    moves.append(([dict(c) for c in coins], events))
            born = {f["id"]: minds.born(f["id"], random.Random(f"{args.path_seed}-{path}-{f['id']}")) for f in flies}
            for cohort, learning in selected.items():
                key = f"{path}-{cohort}"
                if key in ckpt["done"]:
                    continue
                t1 = time.perf_counter()
                running = ckpt["running"] if ckpt["running"] and ckpt["running"]["key"] == key else None
                if running:
                    state = running["state"]
                    rng = np.random.default_rng()
                    rng.bit_generator.state = running["rng"]
                    start, counts = running["round"], running["counts"]
                else:
                    state = {"coins": [dict(c) for c in (replay_start if replay_moves is not None else market.seed_coins())],
                             "history": [], "portfolios": {},
                             "minds": {k: json.loads(json.dumps(v)) for k, v in born.items()}}
                    rng = np.random.default_rng([args.path_seed, path, 1])
                    start, counts = 0, {"trades": 0, "skipped": 0}
                for r in range(start, n_rounds):
                    out = market.simulate_round(state, eps, reader, rng, flies, learning, moved=moves[r],
                                                seed=args.path_seed * 1_000_000 + path * 100_000 + r * 97)
                    counts["trades"] += out["round"]["trades"]
                    counts["skipped"] += sum(t["side"] == "skipped" for t in out["trades"])
                    ckpt["running"] = {"key": key, "round": r + 1, "state": state, "rng": rng.bit_generator.state, "counts": counts}
                    if (r + 1) % args.save_every == 0:
                        save(ckpt_path, ckpt)
                    rounds_this_run += 1
                    if args.stop_after and rounds_this_run >= args.stop_after:
                        raise KeyboardInterrupt
                final = [math.log(max(1e-9, state["portfolios"][f["id"]]["value_eth"])) for f in flies]
                ckpt["done"][key] = {"final": final, **counts}
                ckpt["running"] = None
                save(ckpt_path, ckpt)
                print(f"path {path} {cohort}: mean final value {np.mean(np.exp(final)):.3f} ETH, "
                      f"{time.perf_counter() - t1:.0f} s", flush=True)
    except KeyboardInterrupt:
        save(ckpt_path, ckpt)
        where = f"{ckpt['running']['key']} round {ckpt['running']['round']}" if ckpt["running"] else "between cohorts"
        raise SystemExit(f"paused at {where}; checkpoint {ckpt_path}. Continue with the same command plus --resume")

    final = {c: [v for path in range(n_paths) for v in ckpt["done"][f"{path}-{c}"]["final"]] for c in selected}
    rng = np.random.default_rng(1)
    frozen = np.array(final["frozen"])
    report = {"criteria": __doc__.split("Pass criterion")[1].split("    python")[0].strip(),
              "paths": n_paths, "rounds": n_rounds, "flies": len(flies), "path_seed": args.path_seed,
              "price_replay": bool(replay_rows),
              "execution_note": "Reference-price replay with simulated decisions and fixed fees; not actual fills, gas, slippage, or refusal replay." if replay_rows else "Synthetic price paths.",
              "cohorts": {}}
    for cohort in selected:
        values = np.array(final[cohort])
        entry = {"mean_final_eth": round(float(np.exp(values).mean()), 4), "median_final_eth": round(float(np.exp(np.median(values))), 4),
                 "trades": sum(ckpt["done"][f"{p_}-{cohort}"]["trades"] for p_ in range(n_paths)),
                 "skipped": sum(ckpt["done"][f"{p_}-{cohort}"]["skipped"] for p_ in range(n_paths))}
        if cohort != "frozen" and "frozen" in final:
            mean, lo, hi = ci(values - frozen, rng)
            entry.update({"paired_log_diff": round(mean, 4), "ci95": [round(lo, 4), round(hi, 4)], "better_pairs": int((values > frozen).sum())})
        report["cohorts"][cohort] = entry
    if "all" in report["cohorts"] and "frozen" in report["cohorts"]:
        a = report["cohorts"]["all"]
        report["passed"] = bool(a["paired_log_diff"] > 0 and a["ci95"][0] > 0)
    else:
        report["passed"] = None
    Path(args.out).write_text(json.dumps(report, indent=1))
    print(json.dumps(report, indent=1))
    print("PASSED" if report["passed"] else "NOT PASSED", flush=True)


if __name__ == "__main__":
    main()
