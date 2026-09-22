"""A/B the desk's EXITS, the leak found 2026-09-22: closed trades are profitable (+$168 over 1,258 trades) because the
fast take-profit sells anything up 25%, while nothing ever cuts a loser (fast.stop_pct 0) - so 128 of 161 open
positions were losers (-$183) and the median open position was -11%. The flies bank winners and keep losers.

Three ghosts, each changing one thing about the exits (nothing else), so the record says which exit rule is better
before the main flies change:

    stop    stop_pct 25          cut a position that falls 25% (memes do bounce - that is what this measures)
    tp50    take_profit_pct 50   let winners run twice as far before the reflex sells
    half    take_profit_part 0.5 sell half at +25%, let the rest run

Needs the deploy that gives ghosts their own "fast" settings (engine.fast). Run AFTER deploy.sh.

    python enable_exits.py            # show the change
    python enable_exits.py --yes      # write it
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402  (reads flybook/.env)
import requests  # noqa: E402

NEW = [
    {"name": "stop", "settings": {"fast": {"on": True, "take_profit_pct": 25.0, "take_profit_part": 1.0,
                                           "stop_pct": 25.0, "loxley_seconds": 120}}},
    {"name": "tp50", "settings": {"fast": {"on": True, "take_profit_pct": 50.0, "take_profit_part": 1.0,
                                           "stop_pct": 0.0, "loxley_seconds": 120}}},
    {"name": "half", "settings": {"fast": {"on": True, "take_profit_pct": 25.0, "take_profit_part": 0.5,
                                           "stop_pct": 0.0, "loxley_seconds": 120}}},
]

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
names = {g["name"] for g in NEW}
doc["ghosts"] = [g for g in doc.get("ghosts", []) if g.get("name") not in names] + NEW
print("ghosts:", [g["name"] for g in doc["ghosts"]])
if "--yes" not in sys.argv:
    sys.exit("(dry run: add --yes to write)")
key = status.env("SUPABASE_SERVICE_ROLE_KEY")
r = requests.patch(status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/desk_config?id=eq.1",
                   headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                   json={"settings": doc, "updated_at": datetime.now(timezone.utc).isoformat()}, timeout=30)
r.raise_for_status()
print("written")
