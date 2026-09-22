"""Three more ghosts, from the 2026-09-22 diagnosis (closed trades +$168, but 128 of 161 open positions losing -$183):

    focus     sizing.max_positions 8 + min_trade_usd 5: fewer, bigger positions. The flies had spread into 161 lots,
              many of them dust, each paying its own gas (~$0.07 a trade on ~$5k traded).
    conviction z_floor 1.5 (the brain's own floor is 0.5): a fly only notices a move three times bigger than usual,
              so it trades far less and only on strong signals. The random-picks ghost has been matching the flies,
              so this asks whether their picks are worth anything when they are sure.
    jevgate   jev.min_survive 0.6 + veto_rules_below 0.6: refuse buys Jev gives less than a 60% chance of still
              being tradeable in an hour. ENABLE ONLY after a day of scored answers (python flytrade/desk/score.py
              --what jev): if Jev is no better than its base rate, this ghost is just a random filter.

    python enable_focus.py                    # show the change
    python enable_focus.py --yes              # focus + conviction
    python enable_focus.py --yes --jevgate    # all three (after Jev's record is scored)
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402  (reads flybook/.env)
import requests  # noqa: E402

NEW = [
    {"name": "focus", "settings": {"sizing": {"max_positions": 8}, "limits": {"min_trade_usd": 5.0}}},
    {"name": "conviction", "settings": {"z_floor": 1.5}},
]
if "--jevgate" in sys.argv:
    NEW.append({"name": "jevgate", "settings": {"jev": {"min_survive": 0.6, "veto_rules_below": 0.6}}})

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
names = {g["name"] for g in NEW}
doc["ghosts"] = [g for g in doc.get("ghosts", []) if g.get("name") not in names] + NEW
print("adding:", sorted(names))
print("ghosts:", [g["name"] for g in doc["ghosts"]])
if "--yes" not in sys.argv:
    sys.exit("(dry run: add --yes to write)")
key = status.env("SUPABASE_SERVICE_ROLE_KEY")
r = requests.patch(status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/desk_config?id=eq.1",
                   headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                   json={"settings": doc, "updated_at": datetime.now(timezone.utc).isoformat()}, timeout=30)
r.raise_for_status()
print("written")
