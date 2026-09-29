"""Polymarket in the main flies' wallet (2026-09-29, the user: "put poly in main and put it in ui too").

trade_chains + "poly": the main flies trade Polymarket outcome shares from the same money as every other chain (one
wallet across every chain, the user 2026-09-22). PAPER, like the other chains: the desk reads Polymarket's public API
from its server and never places an order. Their brains smell Jev's probability (and TimesFM's forecast) against each
share's price; a share that resolves pays its book $1 or $0. The site's Fly Desk page shows the Polymarket block with
readable market names. The "poly" ghost stays: the flies on Polymarket alone, as the comparison.

Settings only; the code ships with flytrade/desk/deploy.sh first.
    python enable_poly_main.py          # show the change
    python enable_poly_main.py --yes    # write it
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402  (reads flybook/.env)
import requests  # noqa: E402
import config  # noqa: E402

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
chains = list(doc.get("trade_chains") or config.DEFAULTS["trade_chains"])
if "poly" in chains:
    sys.exit("already applied (poly is in trade_chains)")
doc["trade_chains"] = chains + ["poly"]
print("trade_chains:", chains, "->", doc["trade_chains"])
if "--yes" not in sys.argv:
    sys.exit("(dry run: add --yes to write)")
key = status.env("SUPABASE_SERVICE_ROLE_KEY")
r = requests.patch(status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/desk_config?id=eq.1",
                   headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                   json={"settings": doc, "updated_at": datetime.now(timezone.utc).isoformat()}, timeout=30)
r.raise_for_status()
print("written")
