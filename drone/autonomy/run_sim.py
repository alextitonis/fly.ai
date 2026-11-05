"""Run the whole autonomous patrol in the simulator: dock -> patrol -> finds -> home -> charge -> out again.

    python -m autonomy.run_sim --seed 9901 --minutes 10                 # from drone/: plain steering, GPS on
    python -m autonomy.run_sim --seed 9901 --minutes 10 --steer brain   # the connectome turns
    python -m autonomy.run_sim --seed 9901 --minutes 10 --no-gps        # own motion sensing only
    python -m autonomy.run_sim --seed 9901 --minutes 10 --gps-lost-at 120

Scores only from the simulator's truth, which the drone never sees: finds vs the real targets, position error of the
estimate, how much of the forest the down camera covered, charges, missed landings, crashes. JSON on the last line,
events in runs/autonomy/<name>.jsonl. Detection here is a stand-in (sim_backend.SimTruthDetector).

Rules, fixed 2026-11-05 before any test seed ran. Tuned on dev seed 9900 only. NUMBA_NUM_THREADS=2, --flight-time 240 --charge-time 120.
Test 1, seeds 9911-9918, 10 min, plain steering, into runs/autonomy/test1/: GPS (g), --no-gps (n), --gps-lost-at 120 (l).
    SAFE       no failure (crash, empty battery, emergency landing) in any of the 24 runs
    CYCLE      every g run docks and charges at least twice; at least 7 of 8 n runs too
    FINDS      g finds at least 90% of all targets, pooled; at most 8 false finds over the 8 g runs
    ACCURATE   g position error, median of the runs' medians, at most 1.5 m
    GPS_HELPS  n error at least 1.5x g error on at least 7 of 8 seeds
Test 2, seeds 9921-9928, 6 min, GPS, into runs/autonomy/test2/: brain (b), brain --rewire (r); plain (p) reported only.
    SAFE       no failure in the 8 b runs
    STEERS     b route progress at least 0.4 laps more than r on average, and more on at least 6 of 8 seeds
    FINDS      b finds at least 90% of all targets, pooled
Result test 1 (11-05): 2 of 5. GPS runs all clean (8/8 two charges, 96% found, 0 false, 1.27 m); no-GPS and GPS-lost left the world on 14 of 16
(own-motion error ~4-5 m carried them past the patrol edge). Fixed on dev seed 9900: geofence with waypoints pulled in by 3 sigma + 1 m,
go home at sigma 4 m, faster-growing own-motion uncertainty, pad search climbs to 12 m first, 8 m fence buffer.
Test 3, seeds 9931-9938, 10 min, plain, into runs/autonomy/test3/, tags g, n, l as test 1. The same five rules, plus
    FENCE      no run leaves the fence (part of SAFE: leaving it is a failure)
Result test 3 (11-05), NOT COMPLETE: g9938 missing (stopped by the user), so `score --test 3` fails until it runs. The three batches were
mistakenly run at the same time (plain sim has no brain and no timing dependence, so per-seed results shouldn't change; g9933 was rerun).
Already decided by the 23 runs there: SAFE MISSED (no-GPS 4 of 8 failed: 2 emergency landings, 1 crash in an emergency landing, 1 empty
battery; GPS-lost 1 of 8 empty battery). GPS runs, 7 of 8 done: 0 failures, two charges each, 1.06-1.41 m median error, 0 false finds.
Cause of the failures: a no-GPS drone whose home estimate is off by more than the camera's view from 12 m searches for the pad until the
battery is flat (n9932 searched 146 s from 65% to 3%). Nothing caps the search by battery. Test 2 (brain vs scrambled) not run.
    python -m autonomy.run_sim score --test 1      (or --test 2, --test 3)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

os.environ.setdefault("NUMBA_NUM_THREADS", "2")
os.environ.setdefault("OMP_NUM_THREADS", "2")

import numpy as np  # noqa: E402

from .energy import EnergyPolicy  # noqa: E402
from .localize import FusedLocalizer  # noqa: E402
from .mission import Mission, MissionConfig  # noqa: E402
from .patrol import Lawnmower  # noqa: E402
from .report import Reporter  # noqa: E402
from .sim_backend import HERE, SimPadFinder, SimTruthDetector, _footprint, sim_hardware  # noqa: E402
from .steer import BrainSteer, PlainSteer  # noqa: E402

OUT = HERE / "runs" / "autonomy"


class ScoredReporter(Reporter):
    """Scores each find against the truth at the moment it's confirmed (animals move). The drone never sees this."""

    def __init__(self, path, world):
        super().__init__(path)
        self.world, self.scored = world, []

    def _emit(self, f: dict) -> None:
        super()._emit(f)
        best = None
        for i, t in enumerate(self.world.targets):
            if t["kind"] == f["kind"]:
                d = float(np.hypot(*(t["pos"] - self.world.home - (f["x"], f["y"]))))
                if d < MATCH[t["kind"]] and (best is None or d < best[1]):
                    best = (i, d)
        self.scored.append({"id": f["id"], "kind": f["kind"], "target": None if best is None else best[0], "error_m": None if best is None else round(best[1], 2)})
MATCH = {"fire": 6.0, "person": 6.0, "animal": 12.0}    # m: a find this close to a real one of its kind counts


def run(a) -> dict:
    hw, world, v = sim_hardware(a.seed, a.flight_time, a.charge_time, gps=not a.no_gps, gps_lost_at=a.gps_lost_at, wind=a.wind)
    cfg = MissionConfig(height=a.height, fence=(-a.fence, -a.fence, a.size + a.fence, a.size + a.fence))
    swath = 2 * _footprint(np.array([0, 0, a.height]), hw.down_camera) * 0.8
    route = Lawnmower(0.0, 0.0, a.size, a.size, swath)
    steer = BrainSteer(a.seed, speed=a.speed, rewire=a.rewire) if a.steer == "brain" else PlainSteer(speed=a.speed)
    energy = EnergyPolicy(flight_time=a.flight_time, cruise=a.speed)
    name = a.name or f"{a.steer}{'_nogps' if a.no_gps else ''}{a.seed}"
    rep = ScoredReporter(OUT / f"{name}.jsonl", world)
    det = SimTruthDetector(world, v, hw.down_camera, a.seed)
    m = Mission(hw, FusedLocalizer(), route, steer, energy, [det], SimPadFinder(world, hw.down_camera, a.seed), rep, cfg)

    cells = np.zeros((int(a.size) + 1, int(a.size) + 1), bool)
    err, err_t, wall0, next_print = [], 0.0, time.time(), 60.0
    min_battery, failed = 1.0, None
    while v.t < a.minutes * 60:
        m.tick()
        min_battery = min(min_battery, hw.battery.charge)
        true = world.pos[:2] - world.home
        outside = cfg.fence is not None and not (cfg.fence[0] <= true[0] <= cfg.fence[2] and cfg.fence[1] <= true[1] <= cfg.fence[3])
        if v.crashed() or outside or hw.battery.charge <= 0 or m.state == "DOWN":
            why = "left fence" if outside else "crash" if v.crashed() else "battery empty" if hw.battery.charge <= 0 else "emergency landing"
            rep.log("end", t=v.t, state=m.state, why=why)
            failed = why
            break
        if m.state in ("PATROL", "RETURN") and v.t - err_t >= 0.5:
            err_t = v.t
            true = world.pos[:2] - world.home
            err.append(float(np.hypot(*(m.pose.xy - true))))
            if world.pos[2] > 3:
                r = _footprint(world.pos, hw.down_camera)
                gx, gy = np.meshgrid(np.arange(cells.shape[0]), np.arange(cells.shape[1]), indexing="ij")
                cells |= np.hypot(gx + 0.5 - true[0], gy + 0.5 - true[1]) < r
        if v.t >= next_print:
            next_print += 60
            print(f"  t {v.t:5.0f} s  {m.state:7s} battery {hw.battery.level():.2f}  route {route.progress:.2f}  finds {len(rep.confirmed())}  "
                  f"err {err[-1] if err else 0:.1f} m  wall {time.time() - wall0:.0f} s", flush=True)

    finds = rep.confirmed()
    hit = {s["target"] for s in rep.scored if s["target"] is not None}
    found = {k: [0, 0] for k in MATCH}
    for i, t in enumerate(world.targets):
        found[t["kind"]][1] += 1
        found[t["kind"]][0] += i in hit
    false = sum(s["target"] is None for s in rep.scored)
    errs = [s["error_m"] for s in rep.scored if s["error_m"] is not None]
    wall = time.time() - wall0
    return {"seed": a.seed, "steer": a.steer, "rewired": a.rewire, "gps": not a.no_gps, "gps_lost_at": a.gps_lost_at, "sim_s": round(v.t, 1),
            "wall_s": round(wall, 1), "x_realtime": round(v.t / max(wall, 1e-6), 2), "crashed": v.crashed(), "failed": failed, "charges": m.log.charges,
            "landings_missed": m.log.landings_missed, "pad_error_m": None if v.pad_error is None else round(v.pad_error, 2),
            "returns": m.log.returns, "route_progress": round(route.progress, 2), "coverage": round(float(cells.mean()), 3),
            "pos_err_median": round(float(np.median(err)), 2) if err else None, "pos_err_max": round(float(np.max(err)), 2) if err else None,
            "found": {k: f"{x[0]}/{x[1]}" for k, x in found.items()}, "false_finds": int(false), "finds": len(finds), "find_err_median": round(float(np.median(errs)), 2) if errs else None,
            "battery_min": round(min_battery, 3),
            "state_s": {k: round(x, 1) for k, x in m.log.state_time.items()}, "events": m.log.events}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--seed", type=int, default=9900)
    ap.add_argument("--minutes", type=float, default=10.0)
    ap.add_argument("--steer", choices=("plain", "brain"), default="plain")
    ap.add_argument("--rewire", action="store_true")
    ap.add_argument("--no-gps", action="store_true")
    ap.add_argument("--gps-lost-at", type=float, default=None)
    ap.add_argument("--wind", action="store_true")
    ap.add_argument("--height", type=float, default=6.5)
    ap.add_argument("--speed", type=float, default=1.2)
    ap.add_argument("--size", type=float, default=28.0, help="m: side of the square patrolled, from home")
    ap.add_argument("--flight-time", type=float, default=240.0, help="s on a full battery (Crazyflie ~420); short so a 10 min run charges")
    ap.add_argument("--charge-time", type=float, default=120.0, help="s from empty to full (real: 40 min; short so runs stay short)")
    ap.add_argument("--fence", type=float, default=8.0, help="m of geofence buffer round the patrol area (sim world allows ~13)")
    ap.add_argument("--name", default=None)
    ap.add_argument("--folder", default=None, help="save the JSON into runs/autonomy/<folder>/<name>.json")
    if len(sys.argv) > 1 and sys.argv[1] == "score":
        sp = argparse.ArgumentParser()
        sp.add_argument("score")
        sp.add_argument("--test", type=int, required=True)
        score(sp.parse_args().test)
        return
    a = ap.parse_args()
    res = run(a)
    if a.folder:
        d = OUT / a.folder
        d.mkdir(parents=True, exist_ok=True)
        (d / f"{a.name or res['steer'] + str(a.seed)}.json").write_text(json.dumps(res, indent=1))
    print(json.dumps(res))


def score(test: int) -> None:
    d = OUT / f"test{test}"
    load = lambda tag, seed: json.loads((d / f"{tag}{seed}.json").read_text())   # noqa: E731
    def pooled(rs):
        got = tot = 0
        for r in rs:
            for x in r["found"].values():
                a_, b_ = map(int, x.split("/"))
                got, tot = got + a_, tot + b_
        return got / max(tot, 1)
    if test in (1, 3):
        seeds = range(9911, 9919) if test == 1 else range(9931, 9939)
        g, n, l = ([load(t, s) for s in seeds] for t in "gnl")
        ge, ne = [r["pos_err_median"] for r in g], [r["pos_err_median"] for r in n]
        out = {"g_err": ge, "n_err": ne, "l_err": [r["pos_err_median"] for r in l], "g_found": round(pooled(g), 3), "n_found": round(pooled(n), 3), "l_found": round(pooled(l), 3),
               "g_false": sum(r["false_finds"] for r in g), "charges": {t: [r["charges"] for r in rs] for t, rs in zip("gnl", (g, n, l))},
               "failures": [r["failed"] for r in g + n + l if r["failed"]]}
        out["rules"] = {"SAFE": not out["failures"], "CYCLE": all(c >= 2 for c in out["charges"]["g"]) and sum(c >= 2 for c in out["charges"]["n"]) >= 7,
                        "FINDS": out["g_found"] >= 0.9 and out["g_false"] <= 8, "ACCURATE": float(np.median(ge)) <= 1.5,
                        "GPS_HELPS": sum(b >= 1.5 * a_ for a_, b in zip(ge, ne)) >= 7}
    else:
        seeds = range(9921, 9929)
        b, r, p = ([load(t, s) for s in seeds] for t in "brp")
        bp, rp = [x["route_progress"] for x in b], [x["route_progress"] for x in r]
        out = {"b_progress": bp, "r_progress": rp, "p_progress": [x["route_progress"] for x in p], "b_found": round(pooled(b), 3), "r_found": round(pooled(r), 3),
               "b_err": [x["pos_err_median"] for x in b], "failures": {t: [x["failed"] for x in rs if x["failed"]] for t, rs in zip("brp", (b, r, p))}}
        out["rules"] = {"SAFE": not out["failures"]["b"], "STEERS": float(np.mean(bp) - np.mean(rp)) >= 0.4 and sum(x > y for x, y in zip(bp, rp)) >= 6,
                        "FINDS": out["b_found"] >= 0.9}
    (d / "score.json").write_text(json.dumps(out, indent=1))
    print(json.dumps(out))


if __name__ == "__main__":
    main()
