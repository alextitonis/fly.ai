"""Promote everything that was ghost-only to the main flies (the user 2026-09-22: "add these all in main too, it's ok"
and "jev gating buy too make it on"), and keep one control ghost with the settings they had before, so the bundle can
still be measured.

Main gets: flags rpe + risk + tsfm (TimesFM's forecast as a sense), the master executor (the only seller, banks at
+20%), a 25% stop on the loser side, focus (<= 8 positions, >= $5 a trade), conviction (z_floor 1.5: only strong moves
are noticed), and Jev gating buys (refuse a token Jev gives under a 60% chance of still trading in an hour, and keep
those out of the heuristic picks too).

Left out on purpose: tp50 and half - they are rival take-profit rules, and the master executor now owns that side.

    python promote_to_main.py [--yes]
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402
import requests  # noqa: E402

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
# the settings as they stand NOW, spelled out in full: a ghost inherits anything it does not name, so an empty
# dict here would silently give the control the new settings it is meant to be the control for
import config as desk_config  # noqa: E402
was = desk_config.merged(doc)
before = {"flags": list(was["flags"]), "z_floor": was["z_floor"],
          "fast": dict(was["fast"]), "sizing": dict(was["sizing"]), "limits": dict(was["limits"]),
          "jev": dict(was["jev"]), "master": dict(was["master"])}

doc["flags"] = ["rpe", "risk", "tsfm"]
doc["master"] = {"on": True, "take_profit_pct": 20.0, "part": 1.0, "group_take_pct": 0.0, "flies_sell": False}
doc["fast"] = {**(doc.get("fast") or {}), "on": True, "take_profit_pct": 25.0, "take_profit_part": 1.0,
               "stop_pct": 25.0, "loxley_seconds": 120}
doc["sizing"] = {**(doc.get("sizing") or {}), "max_positions": 8}
doc["limits"] = {**(doc.get("limits") or {}), "min_trade_usd": 5.0}
doc["z_floor"] = 1.5
doc["jev"] = {**(doc.get("jev") or {}), "on": True, "min_survive": 0.6, "veto_rules_below": 0.6,
              "pair_forecast": True}

# the control: the flies exactly as they were before this change, so the bundle is measured against it
old = {"name": "old", "settings": {k: v for k, v in before.items()}}
keep = [g for g in doc.get("ghosts", []) if g.get("name") not in {"old", "stop", "tp50", "half", "focus",
                                                                  "conviction", "master", "tsfm"}]
doc["ghosts"] = keep + [old]

print("main flies now:")
for k in ("flags", "master", "fast", "sizing", "limits", "z_floor", "jev"):
    print(f"  {k:8s} {doc[k]}")
print("\ncontrol ghost 'old':", old["settings"])
print("ghosts:", [g["name"] for g in doc["ghosts"]])
if "--yes" not in sys.argv:
    sys.exit("(dry run: add --yes to write)")
key = status.env("SUPABASE_SERVICE_ROLE_KEY")
r = requests.patch(status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/desk_config?id=eq.1",
                   headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                   json={"settings": doc, "updated_at": datetime.now(timezone.utc).isoformat()}, timeout=30)
r.raise_for_status()
print("written")
