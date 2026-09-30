"""Put stockgap into the main flies, beside reversal (the user 2026-09-30: "keep the reversal too").

rules.stockgap becomes a SLEEVE in every fly ("<fly>/stockgap"), like reversal: a stock token under its real share
price is bought, sold when the gap closes or after max_hold_bars. $2,500 of NEW paper money split over the 12 flies
(capital, never profit; reversal's $2,500 is untouched), max 4 positions each, pools of $100k+ (the replay: +271% vs +197% at $50k), and fly_spread "v1" spreads the flies
over entry 1.25-2.0% and hold 16 or 32 bars so twelve sleeves are not one bet. Steps on the 5-minute rule clock with
fresh Yahoo prices (<= 5 min old); with the US market shut it buys nothing and holds until max_hold_bars.
Why: flytrade/research/rule_replay.py, 4 weeks: +260% / +197% / +122% at 0.15 / 0.3 / 0.5% a side, last third kept
apart +58 / +52 / +42%, 8 of 10 days up; the ghosts stockgap / stockgap1 keep running as the live check.

Code first: bash flytrade/desk/deploy.sh (old code ignores an unknown rule), THEN this.
    python enable_stockgap_main.py          # show the change
    python enable_stockgap_main.py --yes    # write it
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402  (reads flybook/.env)
import requests  # noqa: E402

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
rules = doc.setdefault("rules", {})
if (rules.get("stockgap") or {}).get("on"):
    sys.exit("already applied (rules.stockgap is on)")
rules["stockgap"] = {"on": True, "allocation_usd": 2500.0}
print("rules.stockgap:", rules["stockgap"], "| reversal stays:", {k: rules.get("reversal", {}).get(k) for k in ("on", "allocation_usd")})
if "--yes" not in sys.argv:
    sys.exit("(dry run: add --yes to write)")
key = status.env("SUPABASE_SERVICE_ROLE_KEY")
r = requests.patch(status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/desk_config?id=eq.1",
                   headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                   json={"settings": doc, "updated_at": datetime.now(timezone.utc).isoformat()}, timeout=30)
r.raise_for_status()
print("written")
