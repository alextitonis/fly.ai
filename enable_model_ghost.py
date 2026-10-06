"""Ghost "model" (2026-10-06, the user: "paper ghost only"): the flytrade/learn return predictor as one paper rule book.

What it is: rules.model -> flytrade/desk/modelbook.py. Each hour it scores the Robinhood memes and stock tokens in
pools of $50k+ with the snapshot LightGBM model (flytrade/desk/models/snap_1h.*: predicted 1 h log return net of a
round trip) and holds the top 3 long-only, but only where the predicted move beats this book's own round trip (pool
fee + impact at its slot size + gas); a held token only has to beat the exit leg (the no-trade band). Paper fills, no
money. It needs 100 bars (25 h) of 15-min snapshots: it seeds them from desk_bars at startup, so it starts trading as
soon as desk_bars holds 100 rows (recorded since 2026-10-06 07:59 UTC -> from about 10-07 09:00 UTC).

Why only a ghost: flytrade/learn/README.md "Predictor" - out of sample (16 days of research DEX data) it ranks no
better than plain reversal, every stock-token book lost after costs, and this book's profit came from memes bought
after crashes in a list of tokens that SURVIVED. A live paper record has no survivorship. The router can read it as
"ghost:model:solo" once it has days of bars.

Settings only; the code ships with flytrade/desk/deploy.sh FIRST (old code has no "model" strategy: it would do
nothing, and an image without lightgbm reports one "model_ghost" import event).
    python enable_model_ghost.py          # show the change
    python enable_model_ghost.py --yes    # write it
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402  (reads flybook/.env)
import requests  # noqa: E402

NEW = [{"name": "model", "settings": {"solo": {
    "strategy": "model", "horizon": "1h", "allocation_usd": 500.0, "max_positions": 3, "hold_bars": 4,
    "categories": ["meme", "stock"], "min_pool_usd": 50000, "band": 0.5, "min_trade_usd": 3.0, "edge_bps": 0}}}]

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
doc["ghosts"] = [g for g in doc.get("ghosts") or [] if g.get("name") not in {n["name"] for n in NEW}] + NEW
print("ghosts:", [g["name"] for g in doc["ghosts"]])
for g in NEW:
    print(" ", g)
if "--yes" not in sys.argv:
    sys.exit("(dry run: add --yes to write)")
key = status.env("SUPABASE_SERVICE_ROLE_KEY")
r = requests.patch(status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/desk_config?id=eq.1",
                   headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                   json={"settings": doc, "updated_at": datetime.now(timezone.utc).isoformat()}, timeout=30)
r.raise_for_status()
print("written")
