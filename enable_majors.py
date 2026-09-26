"""Two ghosts for the majors (2026-09-26, user: "they should be able to trade eth and sol etc as main tokens or bnb").
ETH, SOL and BNB were always tradeable, but each fly sees 6 random tokens of ~300 a bar, so it met a major ~2% of
bars and the main flies never bought one.

  majors     the main flies with every major (each chain's native coin + Robinhood ETH) always in view on top of
             the 6 (settings always_view). Only what they see changes; the brain still decides. Promote to the main
             flies if it does no harm against them.
  revmajors  a solo reversal book like revbook, on majors + Robinhood stock tokens instead of memes. One ETH (the
             Robinhood listing): the other chains' ETH are the same asset. Research found this universe flat
             (research/README, the stock allowlist) and liquid coins lean momentum, so expect little.

Needs the engine with always_view + rules.reversal's major/exclude deployed first.

    python enable_majors.py [--yes]
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402
import requests  # noqa: E402

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
new = [{"name": "majors", "settings": {"always_view": ["major"]}},
       {"name": "revmajors", "settings": {"solo": {
           "strategy": "reversal", "allocation_usd": 2500.0, "lookback_bars": 12, "hold_bars": 4, "frac": 0.2,
           "max_positions": 8, "band": 0.5, "partial": 0.5, "categories": ["major", "stock"], "min_pool_usd": 30000,
           "min_trade_usd": 3.0, "exclude": ["base:ETH", "arbitrum:ETH", "abstract:ETH"]}}}]
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
