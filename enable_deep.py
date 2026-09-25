"""Ghosts "deep" and "cap15" (2026-09-25, after ~$88 of the pot's $99 loss came from three thin memes that fell
78-91% through the 10% stop: a $3k four.meme curve, a $29k and a $127k pool, each ~35% of its fly's book).

  deep   brains may not buy bonding curves or tokens whose pool is under $50k (entry gate; sells never gated)
  cap15  no token above 15% of a fly's book after a buy (main: 35%)

Everything else as the main flies. Needs the engine with config.entry and config.overlay deployed first.

    python enable_deep.py [--yes]
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402
import requests  # noqa: E402

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
new = [{"name": "deep", "settings": {"entry": {"on": True, "bonding": False, "min_pool_usd": 50_000.0}}},
       {"name": "cap15", "settings": {"sizing": {"max_token_share": 0.15}}}]
doc["ghosts"] = [g for g in doc.get("ghosts") or [] if g.get("name") not in {n["name"] for n in new}] + new
print("ghosts:", [g["name"] for g in doc["ghosts"]])
if "--yes" not in sys.argv:
    sys.exit("(dry run: add --yes to write)")
key = status.env("SUPABASE_SERVICE_ROLE_KEY")
r = requests.patch(status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/desk_config?id=eq.1",
                   headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                   json={"settings": doc, "updated_at": datetime.now(timezone.utc).isoformat()}, timeout=30)
r.raise_for_status()
print("written")
