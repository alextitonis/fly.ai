"""Put the "guard" ghost's winning parts INTO the main flies, on top of their brains (the user 2026-09-27: "implement
and reset", "cant we combine also with existing"). At that point guard was +21.35% and main +0.65% over the same bars.

guard ran the same reversal spec the main sleeves have (memes, knife 30, vol pause 3), so the gap was how it ran:
    - main split rules.reversal's $500 over 12 flies (~$42 a sleeve, ~$5 slots at 8 positions): 310 of the last 400
      refusals were its steps refused as dust. guard traded one $2,500 book  -> allocation_usd 2500 (~$208 a sleeve)
    - lockout on (no new buys of a token the group keeps losing on)       -> lockout.on
    - the flies' own sells, take-profits and panic sells were refused ("the master executor takes the profits"),
      the master still banks +20%                                          -> master.flies_sell
The brains stay as they are. Two ghosts measure it: "premerge" (main as it was) and guard itself (kept).

Run with the desk STOPPED, then reset_desk.py --yes, then start it (the engine would save the old books back):
    python combine_guard.py            # show the change
    python combine_guard.py --yes      # write it
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402  (reads flybook/.env)
import requests  # noqa: E402

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
old = {k: json.loads(json.dumps(doc.get(k, {}))) for k in ("rules", "lockout", "master")}

rev = doc["rules"]["reversal"]
rev["allocation_usd"] = 2500.0
doc["lockout"] = {**doc.get("lockout", {}), "on": True}
doc["master"] = {**doc["master"], "flies_sell": True}

premerge = {"name": "premerge", "settings": {"rules": old["rules"],
                                             "lockout": {**old["lockout"], "on": bool(old["lockout"].get("on"))},
                                             "master": old["master"]}}
doc["ghosts"] = [g for g in doc.get("ghosts", []) if g.get("name") != "premerge"] + [premerge]

print("rules.reversal:", {k: rev.get(k) for k in ("allocation_usd", "categories", "knife_pct",
                                              "vol_pause", "lookback_bars", "hold_bars", "max_positions")})
print("lockout:", doc["lockout"])
print("master:", doc["master"])
print("ghosts:", [g["name"] for g in doc["ghosts"]])
if "--yes" not in sys.argv:
    sys.exit("(dry run: add --yes to write)")
key = status.env("SUPABASE_SERVICE_ROLE_KEY")
r = requests.patch(status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/desk_config?id=eq.1",
                   headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                   json={"settings": doc, "updated_at": datetime.now(timezone.utc).isoformat()}, timeout=30)
r.raise_for_status()
print("written")
