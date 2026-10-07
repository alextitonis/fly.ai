"""The Flybook worker's one always-on process (2026-10-07, the user: "keep the others in the main one then just in one"):
the brains' tick (tick.py) in the main thread, and the small loops that each had a machine of their own as threads
beside it - the FLYAI price keeper (flyai_keeper.py), the merch worker (merch.py run), the FlightPass autopilot
(autopilot.py) and the breeding worker (flytrade/breed/worker.py: private code, staged by deploy.sh; was the
flyai-breed app). They are I/O-bound (HTTP and chain calls, sleeping most of the time), so they share the tick's
machine. A loop that crashes is logged and started again after RESTART_S; the tick is never held up by them.

    python flybook/worker/jobs.py <tick.py's arguments>     (fly.toml process "tick")
    FLYBOOK_JOBS=keeper,merch,autopilot,breed (default all; "" = the tick alone)
"""
from __future__ import annotations

import os
import random
import sys
import threading
import time
import traceback

RESTART_S = 60.0


def keeper_loop() -> None:
    import flyai_keeper
    if not flyai_keeper.FLY:
        print("jobs: keeper off (no TRADERFLY_ADDRESS)", flush=True)
        return
    while True:
        try:
            flyai_keeper.tick()
        except Exception as e:                            # one bad check (RPC, API) must not stop the keeper
            print(f"keeper error: {type(e).__name__}: {e}", flush=True)
        time.sleep(flyai_keeper.EVERY)


def merch_loop() -> None:
    import merch
    merch.run()


def autopilot_loop(every: float = 300.0) -> None:
    import requests
    import autopilot
    rng, http = random.Random(), requests.Session()
    while True:
        started = time.monotonic()
        try:
            autopilot.once(False, rng, http)
        except Exception as e:
            print(f"autopilot pass failed: {type(e).__name__}: {e}", flush=True)
        time.sleep(max(10.0, every - (time.monotonic() - started)))


def breed_loop() -> None:
    from pathlib import Path
    breed_dir = Path(__file__).resolve().parents[2] / "flytrade" / "breed"
    if not (breed_dir / "worker.py").exists():
        print("jobs: breed off (flytrade/breed not in this image)", flush=True)
        return
    sys.path.insert(0, str(breed_dir))
    import worker as breed_worker                        # its own loop: events every 20 s, pictures, finish()
    breed_worker.main()


LOOPS = {"keeper": keeper_loop, "merch": merch_loop, "autopilot": autopilot_loop, "breed": breed_loop}


def guarded(name: str, fn) -> None:
    """Run a loop forever: a crash is printed and the loop starts again after RESTART_S."""
    while True:
        try:
            fn()
            return                                       # a loop that ends on purpose (switched off) stays ended
        except Exception:
            traceback.print_exc()
            print(f"jobs: {name} crashed; again in {RESTART_S:.0f} s", flush=True)
            time.sleep(RESTART_S)


def start(names) -> list[threading.Thread]:
    out = []
    for name in names:
        t = threading.Thread(target=guarded, args=(name, LOOPS[name]), name=name, daemon=True)
        t.start()
        out.append(t)
    return out


def main() -> None:
    raw = os.environ.get("FLYBOOK_JOBS")
    names = [n.strip() for n in (raw if raw is not None else ",".join(LOOPS)).split(",") if n.strip() in LOOPS]
    start(names)
    print(f"jobs: {', '.join(names) or 'none'} beside the tick", flush=True)
    import tick
    sys.argv = ["tick.py", *sys.argv[1:]]               # the tick reads its own arguments
    tick.main()


if __name__ == "__main__":
    main()
