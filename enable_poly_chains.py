"""The live desk on Polymarket and the other chains, sized by the router (2026-10-07, the user: "it should be able to
do polymarket the desk on it's own as i said and multi chain not only rarely"; how much goes where: "the model
generally decides"; money: whatever cash is free).

What it switches on in the live desk settings:
  entry.live_chains + "poly"   the live gate lets Polymarket bets through (housepoly.py fills them from the house
                               wallet on Polygon; the desk runs in arn since 10-07, where Polymarket's API answers)
  rules.polyedge               the underdog-bet rule as a live sleeve: its bet = its money / max_positions
  rules.chains                 the other chains' basket (Base, BNB Chain, Arbitrum through Relay): the deepest pools there
  ghost "chains"               the basket on paper, $500: the router's evidence for it (polydog is polyedge's)
  router on + apply            the router moves the pot between house (FLYAI), core, stockgap, the brain, polyedge and
                               chains by each one's measured return per unit of risk (router.py: Thompson-sampled
                               mean-variance, at most 25% of the pot a day). A new arm starts at $0 and gets money once
                               its ghost has 24 bars of record. With the router driving, the fixed allocation_usd values
                               and park_step stop deciding (engine.routed_allocations).

Settings only; the code ships with flytrade/desk/deploy.sh FIRST (old code has no "chains" strategy, no polyedge
sleeve and no Polymarket fills: it would refuse the bets as before).
    python enable_poly_chains.py          # show the change
    python enable_poly_chains.py --yes    # write it
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402  (reads flybook/.env)
import requests  # noqa: E402

CHAINS = ["base", "bsc", "arbitrum"]
POLYEDGE = {"on": True, "allocation_usd": 0.0, "from_brain": True, "gap": 0.05, "min_price": 0.20, "max_price": 0.50,
            "max_positions": 4, "max_hours": 36, "min_stake_usd": 2.0}
BASKET = {"top": 6, "hold_bars": 96, "band": 0.25, "partial": 1.0, "min_trade_usd": 5.0, "chains": CHAINS,
          "min_pool_usd": 50_000.0}
ROUTER = {"on": True, "apply": True, "arms": {
    "house": {"price": "FLYAI", "exposure": 0.8}, "core": {"ghost": "core"}, "stockgap": {"ghost": "stockgap"},
    "brain": {"ghost": "rev6"}, "polyedge": {"ghost": "polydog"}, "chains": {"ghost": "chains"}}}

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
entry = doc.setdefault("entry", {})
before = {"live_chains": entry.get("live_chains"), "router": doc.get("router"),
          "polyedge": (doc.get("rules") or {}).get("polyedge"), "chains": (doc.get("rules") or {}).get("chains")}
entry["live_chains"] = sorted(set(entry.get("live_chains") or []) | set(CHAINS) | {"poly"})
if "poly" not in (doc.get("trade_chains") or []):
    doc["trade_chains"] = (doc.get("trade_chains") or []) + ["poly"]
rules = doc.setdefault("rules", {})
rules["polyedge"] = {**(rules.get("polyedge") or {}), **POLYEDGE}
rules["chains"] = {**(rules.get("chains") or {}), "on": True, "allocation_usd": 0.0, "from_brain": True, **BASKET}
if not any(g["name"] == "chains" for g in doc.get("ghosts", [])):
    doc["ghosts"] = doc.get("ghosts", []) + [{"name": "chains", "settings": {"solo": {"strategy": "chains",
                                                                                     "allocation_usd": 500.0, **BASKET}}}]
doc["router"] = {**(doc.get("router") or {}), **ROUTER}
print("before:", json.dumps(before))
print("after: live_chains", entry["live_chains"], "| trade_chains", doc["trade_chains"])
print("       rules.polyedge", rules["polyedge"])
print("       rules.chains", rules["chains"])
print("       router", json.dumps(doc["router"]))
print("       ghosts:", ", ".join(g["name"] for g in doc["ghosts"]))
if "--yes" not in sys.argv:
    sys.exit("(dry run: add --yes to write)")
key = status.env("SUPABASE_SERVICE_ROLE_KEY")
r = requests.patch(status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/desk_config?id=eq.1",
                   headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                   json={"settings": doc, "updated_at": datetime.now(timezone.utc).isoformat()}, timeout=30)
r.raise_for_status()
print("written")
