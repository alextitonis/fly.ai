"""Stop Jev gating the main flies' buys; keep asking it and scoring the answers (the user 2026-09-23: "yes do it").

Scored on 263 outcomes (130 tokens, 09-22 -> 09-23), Jev was worse than always saying the base rate on both questions
and hardly ranks: the fifth it gave the lowest odds of still trading survived 92% of the time vs 94% for the rest
(survives AUC 0.60 on only 16 deaths), and "up in 1 h" AUC 0.49-0.55. A 60% bar on a number that says ~63% when ~95%
happen only refuses tokens that were fine. Re-arm it once score.py says it beats the base rate.

    python jev_record_only.py [--yes]
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402
import requests  # noqa: E402

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
print("jev was:", doc.get("jev"))
doc["jev"] = {**(doc.get("jev") or {}), "on": True, "min_survive": 0.0, "veto_rules_below": 0.0}
print("jev now:", doc["jev"])
if "--yes" not in sys.argv:
    sys.exit("(dry run: add --yes to write)")
key = status.env("SUPABASE_SERVICE_ROLE_KEY")
r = requests.patch(status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/desk_config?id=eq.1",
                   headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                   json={"settings": doc, "updated_at": datetime.now(timezone.utc).isoformat()}, timeout=30)
r.raise_for_status()
print("written")
