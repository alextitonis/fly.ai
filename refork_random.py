"""Start the "random" ghost over (2026-09-24): a bad price print (~1e-15) gave its fly 12 a $30 buy of 1.35e16
TLKTOK, "worth" $224 billion - its +51% was that, not luck. Needs the desk code with ghost "fork" (engine.ghosts).
Bumps the ghost's fork number; on the next bar it re-forks from the main flies as they are now.

    python refork_random.py [--yes]
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402
import requests  # noqa: E402

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
g = next(g for g in doc.get("ghosts") or [] if g.get("name") == "random")
g["fork"] = int(g.get("fork") or 0) + 1
print("random ghost ->", g)
if "--yes" not in sys.argv:
    sys.exit("(dry run: add --yes to write)")
key = status.env("SUPABASE_SERVICE_ROLE_KEY")
r = requests.patch(status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/desk_config?id=eq.1",
                   headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                   json={"settings": doc, "updated_at": datetime.now(timezone.utc).isoformat()}, timeout=30)
r.raise_for_status()
print("written")
