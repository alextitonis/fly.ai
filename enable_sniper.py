"""The launch sniper on the Fly Desk (flytrade/desk/sniper.py; the user 2026-10-03, after a Solana launch went $41k ->
$671k in ten minutes: "we need to make sure the flies trade ... new launches", and "shared listeners for tokens, news
etc, no need to be individual").

Turns on the desk's PAPER sniper book ($2,000, $20 a launch, Robinhood Chain + Solana PumpSwap graduations, every 30 s)
and with it the shared "launch_feed" the Fly Wallets' launch option buys from. The paper book measures every launch the
rules take, rugs included; read it with `python flytrade/desk/status.py` ("launch sniper").

Settings only; the code ships with flytrade/desk/deploy.sh FIRST (old code has no sniper and ignores the key).
    python enable_sniper.py          # show the change
    python enable_sniper.py --yes    # write it
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402  (reads flybook/.env)
import requests  # noqa: E402

SNIPER = {"on": True, "chains": ["robinhood", "solana"], "allocation_usd": 2000.0, "usd_per_launch": 20.0}

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
if (doc.get("sniper") or {}).get("on"):
    sys.exit("already on")
doc["sniper"] = {**(doc.get("sniper") or {}), **SNIPER}
print("sniper:", doc["sniper"])
if "--yes" not in sys.argv:
    sys.exit("(dry run: add --yes to write)")
key = status.env("SUPABASE_SERVICE_ROLE_KEY")
r = requests.patch(status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/desk_config?id=eq.1",
                   headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                   json={"settings": doc, "updated_at": datetime.now(timezone.utc).isoformat()}, timeout=30)
r.raise_for_status()
print("written")
