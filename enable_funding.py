"""Turn on the $FLYAI funding ledger (fundflyai.py; the user 2026-09-30: the pool starts as FLYAI, the desk swaps it
into other tokens and back "carefully, when needed").

On the PAPER desk this does not change any trade: the books keep their dollars, and every bar the desk books the FLYAI
it would sell to fund them (slices of at most 0.5% of the FLYAI pool's depth, $250 a bar) as real paper fills of
book "fund". The scoreboard then shows the pool's FLYAI count against just holding it, and how much of that is
trading rather than being short FLYAI. Live: also `python flytrade/desk/admin.py limits --fund-flyai` so the vault
lets the operator spend FLYAI (its USD limits still apply).

Code first: bash flytrade/desk/deploy.sh, THEN this.
    python enable_funding.py          # show the change
    python enable_funding.py --yes    # write it
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402  (reads flybook/.env)
import requests  # noqa: E402

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
if (doc.get("funding") or {}).get("on"):
    sys.exit("already applied (funding is on)")
doc["funding"] = {"on": True, "start_flyai": 31_200_000.0, "max_pool_share": 0.005, "max_bar_usd": 250.0}
print("funding:", doc["funding"])
if "--yes" not in sys.argv:
    sys.exit("(dry run: add --yes to write)")
key = status.env("SUPABASE_SERVICE_ROLE_KEY")
r = requests.patch(status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/desk_config?id=eq.1",
                   headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                   json={"settings": doc, "updated_at": datetime.now(timezone.utc).isoformat()}, timeout=30)
r.raise_for_status()
print("written")
