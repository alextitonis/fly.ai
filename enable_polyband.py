"""A ghost twin of "poly" that only bets inside a price band, with a stake cap (2026-09-30: "fix the poly bet losses").

The 28 settled bets since the 09-27 reset, by dollars received: net +$70 on $732 staked, 12 won. The 12 bought at 6
cents or less cost $442 and won none (one was $217 on a 0.1-cent share of a fly's $100); the 16 at 12 cents and up cost
$290 and returned $761. So a 1-6 cent quote is a lottery ticket that pays the spread, and one bet must not be a
fly's whole book.

    polyband   ghost "poly" + entry.poly_min_price 0.10, poly_max_price 0.90, poly_max_stake_usd 25

The old "poly" ghost stays as the control. Code first: bash flytrade/desk/deploy.sh, THEN this.
    python enable_polyband.py          # show the change
    python enable_polyband.py --yes    # write it
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402  (reads flybook/.env)
import requests  # noqa: E402

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
ghosts = doc.get("ghosts", [])
if any(g["name"] == "polyband" for g in ghosts):
    sys.exit("already applied (a polyband ghost exists)")
base = next((g for g in ghosts if g["name"] == "poly"), None)
if base is None:
    sys.exit("no poly ghost to twin")
st = {**base["settings"], "entry": {**(base["settings"].get("entry") or {}), "poly_min_price": 0.10,
                                    "poly_max_price": 0.90, "poly_max_stake_usd": 25.0}}
doc["ghosts"] = ghosts + [{"name": "polyband", "settings": st}]
print(f"ghosts: {len(ghosts)} -> {len(doc['ghosts'])}; polyband = {st}")
if "--yes" not in sys.argv:
    sys.exit("(dry run: add --yes to write)")
key = status.env("SUPABASE_SERVICE_ROLE_KEY")
r = requests.patch(status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/desk_config?id=eq.1",
                   headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                   json={"settings": doc, "updated_at": datetime.now(timezone.utc).isoformat()}, timeout=30)
r.raise_for_status()
print("written")
