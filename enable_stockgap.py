"""Two ghost books for the stock-gap rule (rules.stockgap, realprice.py; the user 2026-09-30: "check now flydesk, do
research what we can do").

The lead: a Robinhood Chain stock token is tied to a real share price. Against Yahoo's one-minute bars over the
desk's last day (82 tokens, 17 hours with the US market printing), a token more than 1% under its share was up 0.73%
two hours later at the median (79% of the time) while the average token did not move. The rule itself, run over the
same day with costs charged: +2.2% to +2.5% at the stock pools' measured cost (0.15% a side), +1.2% to +1.4% at
double that, about flat at 0.5% a side. One day: a lead, not proof - hence ghosts, on the desk's real paper fills.

    stockgap    buy at 1.5% under, sell once within 0.25%, or after 4 hours; $2,500, 8 slots, pools >= $50k
    stockgap1   the same, buying at 1.0% under (more trades, thinner margin over costs)

Settings only; the code ships with flytrade/desk/deploy.sh FIRST (old code has no "stockgap" strategy and would raise).
    python enable_stockgap.py          # show the change
    python enable_stockgap.py --yes    # write it
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402  (reads flybook/.env)
import requests  # noqa: E402

BASE = {"strategy": "stockgap", "categories": ["stock"], "allocation_usd": 2500.0, "max_positions": 8,
        "exit_pct": 0.25, "max_hold_bars": 16, "min_pool_usd": 50000, "avg_bars": 96, "min_seen": 8, "max_age_s": 300,
        "wrong_pct": 10.0, "min_trade_usd": 3.0, "band": 0.0, "partial": 1.0}
NEW = [{"name": "stockgap", "settings": {"solo": {**BASE, "entry_pct": 1.5}}},
       {"name": "stockgap1", "settings": {"solo": {**BASE, "entry_pct": 1.0}}}]

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
names = [g["name"] for g in doc.get("ghosts", [])]
if "stockgap" in names:
    sys.exit("already applied (a stockgap ghost exists)")
doc["ghosts"] = doc.get("ghosts", []) + NEW
print(f"ghosts: {len(names)} -> {len(doc['ghosts'])}:", ", ".join(g["name"] for g in doc["ghosts"]))
if "--yes" not in sys.argv:
    sys.exit("(dry run: add --yes to write)")
key = status.env("SUPABASE_SERVICE_ROLE_KEY")
r = requests.patch(status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/desk_config?id=eq.1",
                   headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                   json={"settings": doc, "updated_at": datetime.now(timezone.utc).isoformat()}, timeout=30)
r.raise_for_status()
print("written")
