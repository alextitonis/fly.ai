"""Settings for the fresh start (the user 2026-09-24: "ok yes improve them"), from the 5-day replay (Sep 15-20, 480 bars)
and the fly 2/4 losses:

main flies  fast stop 25% -> 10%   replay: worst drawdown -4.8% vs -8.1%, MEME cut at -$7 vs -$17 (its +10.9 pts
                                   headline was mostly one BLORB trade - treat the return as luck, the drawdown as real)
            reversal min_pool_usd 50k   the $15-30k-pool memes the sleeves bought rugged -80..-97% (09-23); paper also
                                   flatters pools < $50k by ~1.1% a fill (shadow check)
ghosts      + stop25   the old 25% stop, so the live desk keeps testing the change
            - plain, flyvols, band   measured, no signal (plain = talk's twin); frees CPU for the colonies

Run after the desk code with rules.reversal min_pool_usd is deployed (it is, 2026-09-24).
    python improve_settings.py [--yes]
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402
import requests  # noqa: E402

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
doc.setdefault("fast", {})["stop_pct"] = 10.0
doc.setdefault("rules", {}).setdefault("reversal", {})["min_pool_usd"] = 50_000.0
drop = {"plain", "flyvols", "band", "stop25"}
doc["ghosts"] = [g for g in doc.get("ghosts") or [] if g.get("name") not in drop] + \
    [{"name": "stop25", "settings": {"fast": {"stop_pct": 25.0}}}]
print("fast:", doc["fast"])
print("reversal:", doc["rules"]["reversal"])
print("ghosts:", [g["name"] for g in doc["ghosts"]])
if "--yes" not in sys.argv:
    sys.exit("(dry run: add --yes to write)")
key = status.env("SUPABASE_SERVICE_ROLE_KEY")
r = requests.patch(status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/desk_config?id=eq.1",
                   headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                   json={"settings": doc, "updated_at": datetime.now(timezone.utc).isoformat()}, timeout=30)
r.raise_for_status()
print("written")
