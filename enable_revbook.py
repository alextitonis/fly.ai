"""Ghost "revbook" (2026-09-25): the reversal book that research/permutation_test.py passed (timing p = 0.001, but
deflated Sharpe 0.88 < 0.95 on 9 days), run alone on the desk's real paper fills to get the out-of-sample days it
lacks. No brains: one rule book (engine.solo_step) with the backtested cell - the 20% biggest losers over 12 bars
(3 h), rebalanced every 4 bars (1 h), half-slot no-trade band, half steps, plain ranking (no combo signals), $2,500
in at most 8 positions like the backtest. min_pool_usd 30k keeps it off the pools that rugged (rules.reversal note)
and on Robinhood Chain. Judge it against the basket line over the same window (score.py --what ghosts).

Needs the engine with solo_step deployed first.

    python enable_revbook.py [--yes]
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402
import requests  # noqa: E402

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
new = [{"name": "revbook", "settings": {"solo": {
    "strategy": "reversal", "allocation_usd": 2500.0, "lookback_bars": 12, "hold_bars": 4, "frac": 0.2,
    "max_positions": 8, "band": 0.5, "partial": 0.5, "categories": ["meme"], "min_pool_usd": 30000,
    "min_trade_usd": 3.0}}}]
doc["ghosts"] = [g for g in doc.get("ghosts") or [] if g.get("name") not in {n["name"] for n in new}] + new
print("ghosts:", [g["name"] for g in doc["ghosts"]])
for g in new:
    print(" ", g)
if "--yes" not in sys.argv:
    sys.exit("(dry run: add --yes to write)")
key = status.env("SUPABASE_SERVICE_ROLE_KEY")
r = requests.patch(status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/desk_config?id=eq.1",
                   headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                   json={"settings": doc, "updated_at": datetime.now(timezone.utc).isoformat()}, timeout=30)
r.raise_for_status()
print("written")
