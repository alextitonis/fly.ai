"""The 2026-09-30 desk settings: the launch shape (the user: "improve it so when we launch people will make at least
some cents"). Measured on the main books since the 09-27 reset (4,292 fills, 181 bars):

    brains  $1,200 -> $899. Polymarket bets -$233 ($123 of it costs; 25 settled, 9 won), other chains' memes -$78,
            Robinhood Chain +$32. Only Robinhood Chain can be traded live at all.
    sleeves $2,500 -> $2,764 on the marks, but CLOSED positions lost $190 on $24.4k bought:
            the 10% fast stop   736 lots  -$1,272   (every take-profit together: +$895)
            pools under $50k   1415 lots    -$384   (pools $50k-200k: 305 lots, +$203)
            Of 49 stops on 09-29/30, 76% were back above the stop line at the very next 15-minute bar, 85% two hours
            later: the stop sold into prints that did not last. Under 2% went on to fall 30% within the half hour.

Into the main books:
    fast.stop_confirm_minutes 30, stop_hard_pct 30   the stop sells after 30 min under -10%, or at once at -30%
    entry on: home_only, no bonding curves, pool >= $50k   the brains see and buy Robinhood Chain pools only
    rules.reversal.min_pool_usd 50000                 the sleeves' floor, was 30000
New ghosts:
    pre0930   the brains as they were before this script (the control)
    stop10    today's brains with the old first-print stop (the stop change alone)
    rev50     revbook with a $50k pool floor (the floor alone, on a rule book; revbook stays at $30k)
    poly      keeps betting (its own entry.home_only false)
Retired (each lost to the basket and to `random` over the whole window, or is now part of main): talk, rpe, risk,
deep, majors, pre0928, revwide24, colony, colony_trade, exits. Ghost groups run no reversal sleeves, so the sleeves'
stop change has no twin: read it before/after on the main sleeves' closed lots.

One day of stops is a lead, not proof. Settings only; the code half ships with flytrade/desk/deploy.sh FIRST
(old code ignores the new keys: the stop would stay as it is, and home_only would do nothing).
    python enable_0930.py          # show the change
    python enable_0930.py --yes    # write it
"""
import copy
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402  (reads flybook/.env)
import requests  # noqa: E402

RETIRE = ["talk", "rpe", "risk", "deep", "majors", "pre0928", "revwide24", "colony", "colony_trade", "exits"]
OFF = {"on": False, "home_only": False, "bonding": True, "min_pool_usd": 0.0}     # the buy gate as it was: none

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
ghosts = {g["name"]: g for g in doc.get("ghosts", [])}
if "pre0930" in ghosts:
    sys.exit("already applied (a pre0930 ghost exists)")
old = copy.deepcopy({k: doc.get(k) for k in ("fast", "entry", "rules")})

doc["fast"] = {**doc["fast"], "stop_confirm_minutes": 30.0, "stop_hard_pct": 30.0}
doc["entry"] = {**(doc.get("entry") or {}), "on": True, "home_only": True, "bonding": False, "min_pool_usd": 50000.0}
doc["rules"]["reversal"]["min_pool_usd"] = 50000.0

rev50 = copy.deepcopy(ghosts["revbook"]["settings"])
rev50["solo"]["min_pool_usd"] = 50000
new = [
    {"name": "pre0930", "settings": {"fast": {**old["fast"], "stop_confirm_minutes": 0.0, "stop_hard_pct": 0.0},
                                     "entry": {**(old["entry"] or {}), **OFF}}},
    {"name": "stop10", "settings": {"fast": {"stop_confirm_minutes": 0.0, "stop_hard_pct": 0.0}}},
    {"name": "rev50", "settings": rev50},
]
kept = [g for g in doc.get("ghosts", []) if g["name"] not in RETIRE]
for g in kept:
    if g["name"] == "poly":                          # a ghost inherits main's gate: Polymarket must stay open to it
        g["settings"] = {**g["settings"], "entry": {"home_only": False, "bonding": True, "min_pool_usd": 0.0}}
doc["ghosts"] = kept + new

print("fast:   ", json.dumps(old["fast"]), "\n     -> ", json.dumps(doc["fast"]))
print("entry:  ", json.dumps(old["entry"]), "->", json.dumps(doc["entry"]))
print("sleeves: min_pool_usd", old["rules"]["reversal"].get("min_pool_usd"), "->", doc["rules"]["reversal"]["min_pool_usd"])
print("retire: ", ", ".join(n for n in RETIRE if n in ghosts))
print(f"ghosts:  {len(ghosts)} -> {len(doc['ghosts'])}:", ", ".join(g["name"] for g in doc["ghosts"]))
if "--yes" not in sys.argv:
    sys.exit("(dry run: add --yes to write)")
key = status.env("SUPABASE_SERVICE_ROLE_KEY")
r = requests.patch(status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/desk_config?id=eq.1",
                   headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                   json={"settings": doc, "updated_at": datetime.now(timezone.utc).isoformat()}, timeout=30)
r.raise_for_status()
print("written")
