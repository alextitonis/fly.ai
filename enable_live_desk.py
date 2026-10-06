"""The live Fly Desk's settings (2026-10-04, the user: the Fly Desk launches with real trading from a house wallet;
"small cap first"; "use the best and combinations, just don't show it separately on the ui"; the pool shows all the
money, not all of it used at the start). Prepared, not run: the user deploys and launches later. Runbook:
flytrade/FLYDESK-LIVE-PLAN.md.

What it writes into desk_config (settings only; the code is houseexec.py + engine.house_check / pool_step):
    the mix, of --cap dollars       20% core hold (stocks + majors, pools >= $100k and >= 72 h old)
                                    30% stockgap (stock tokens under their share price, pools >= $100k)
                                    20% house: FLYAI bought 4%+ under its ~24 h average, sold when back (rules.house)
                                    30% the flies' brains, gated like the live Fly Wallets (pools >= $50k, >= 72 h,
                                        round trip <= 3%, no curves, Robinhood Chain only) + patience and churn band
                                    reversal off (its one good paper book holds the same young memes its twins lost on)
    rug gates                       entry gate on for the sleeves' buys too (entry.sleeves); pool-drain exit 50%
    funding                         FLYAI in the house wallet sold for the books' cash, <= $50 a bar, 0.25% of depth, not into a 5% dip
    pool_wallet                     the pool wallet (POOL_ADDRESS in flytrade/.env) shown beside it on the site
    limits                          max $50 a trade (the house wallet's day cap was removed 2026-10-06)
    mode                            shadow (default: real quotes, nothing sent) or live (--mode live)

    python enable_live_desk.py --cap 500                  # dry run: the plan, sizes per position, warnings
    python enable_live_desk.py --cap 500 --yes            # write it, shadow mode
    python enable_live_desk.py --cap 500 --mode live --yes
"""
import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT / "flytrade" / "desk"))
import status  # noqa: E402  (reads flybook/.env)
import requests  # noqa: E402

# house (2026-10-05, the user: FLYAI dropped, "it should buy"): rules.house, FLYAI on a dip - half of core's old share
MIX = {"core": 0.20, "stockgap": 0.30, "house": 0.20, "brains": 0.30}
MIN_SLOT_USD = 5.0                        # a position under this pays its gas twice over (the 09-27 dust lesson)


def pool_address() -> str:
    m = re.search(r"^POOL_ADDRESS=(0x[0-9a-fA-F]{40})", (ROOT / "flytrade" / ".env").read_text(encoding="utf8"), re.M)
    if not m:
        sys.exit("no POOL_ADDRESS in flytrade/.env")
    return m.group(1)


def flies_now() -> int:
    """How many main flies the desk runs now (the site snapshot's fly books)."""
    rows = status.get("desk_public?key=eq.site&select=value")
    return max(1, len((rows[0]["value"] if rows else {}).get("books") or []))


def plan(cap: float, flies: int) -> tuple[dict, list[str]]:
    # the house sleeve is carved out of the brain book when it opens (from_brain): the book opens with both shares
    per_fly = cap * (MIX["brains"] + MIX["house"]) / flies
    core_per_fly, gap_per_fly = cap * MIX["core"] / flies, cap * MIX["stockgap"] / flies
    top = max(1, min(10, int(core_per_fly // MIN_SLOT_USD)))
    gap_slots = max(1, min(4, int(gap_per_fly // MIN_SLOT_USD)))
    warn = []
    for name, v in (("brain book", per_fly), ("core slot", core_per_fly / top), ("stockgap slot", gap_per_fly / gap_slots)):
        if v < MIN_SLOT_USD:
            warn.append(f"{name} ${v:.2f} is under ${MIN_SLOT_USD:g}: raise --cap (or fewer flies)")
    settings = {
        "fly_allocation_usd": round(per_fly, 2),
        "entry": {"on": True, "home_only": False, "live_chains": ["base", "bsc", "arbitrum"], "relay_round_trip_pct": 1.0, "sleeves": True, "min_pool_usd": 50000.0, "min_pool_age_hours": 72.0,
                  "max_round_trip_pct": 3.0, "bonding": False},
        "patience": {"on": True, "threshold": 1.5, "decay": 0.7, "step": 0.5},
        "churn": {"on": True, "bars": 4, "mult": 1.5},
        "fast": {"drain_pct": 50.0},
        "rules": {
            "reversal": {"on": False},
            "loxley": {"on": False},                  # Loxley is dead (the user 2026-10-04)
            "core": {"on": True, "allocation_usd": round(cap * MIX["core"], 2), "top": top, "hold_bars": 96,
                     "band": 0.5, "partial": 1.0, "min_trade_usd": MIN_SLOT_USD, "min_pool_usd": 100000.0,
                     "min_pool_age_hours": 72.0, "categories": ["stock", "major"]},
            "stockgap": {"on": True, "allocation_usd": round(cap * MIX["stockgap"], 2), "entry_pct": 1.5,
                         "min_pool_usd": 100000.0, "max_positions": gap_slots},
            "house": {"on": True, "allocation_usd": round(cap * MIX["house"], 2), "from_brain": True},
        },
        # gentle on the FLYAI chart (2026-10-05, the user): <= $50 a bar, <= 0.25% of the pool's depth, and no selling
        # while FLYAI is 5%+ under its 1 h high
        "funding": {"on": True, "max_pool_share": 0.0025, "max_bar_usd": 50.0, "min_step_usd": 5.0, "max_dip_pct": 5.0},
        "pool_wallet": {"address": pool_address(), "tokens": ["FLYAI", "USDG", "ETH"]},
        "limits": {"max_trade_usd": 50.0},
        "launches": {"live": False},
        "loxley_writing": {"on": False},
        "loxley_routing": {"on": False},
    }
    return settings, warn


def deep_merge(doc: dict, new: dict) -> dict:
    out = dict(doc)
    for k, v in new.items():
        out[k] = deep_merge(out.get(k) or {}, v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--cap", type=float, default=500.0, help="dollars the desk may trade (the house wallet's slice)")
    p.add_argument("--flies", type=int, default=0, help="main flies (default: as many as the desk runs now)")
    p.add_argument("--mode", choices=["shadow", "live"], default="shadow")
    p.add_argument("--yes", action="store_true")
    a = p.parse_args()
    flies = a.flies or flies_now()
    settings, warn = plan(a.cap, flies)
    print(f"cap ${a.cap:,.0f} over {flies} flies: brains ${settings['fly_allocation_usd']:.2f} a fly, "
          f"core ${settings['rules']['core']['allocation_usd']:.0f} (top {settings['rules']['core']['top']}), "
          f"stockgap ${settings['rules']['stockgap']['allocation_usd']:.0f} ({settings['rules']['stockgap']['max_positions']} slots a fly)")
    print("pool wallet shown beside it:", settings["pool_wallet"]["address"])
    print("mode ->", a.mode)
    for w in warn:
        print("WARNING:", w)
    doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
    out = deep_merge(doc, settings)
    out["mode"] = a.mode
    print(json.dumps({k: out[k] for k in settings}, indent=1)[:3000])
    if not a.yes:
        sys.exit("(dry run: add --yes to write)")
    key = status.env("SUPABASE_SERVICE_ROLE_KEY")
    r = requests.patch(status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/desk_config?id=eq.1",
                       headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                       json={"settings": out, "updated_at": datetime.now(timezone.utc).isoformat()}, timeout=30)
    r.raise_for_status()
    print("written")


if __name__ == "__main__":
    main()
