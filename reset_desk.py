"""Restart the paper desk's money and trades (the user 2026-09-23: "reset the money and all trades, keep all the known
data"), after the dust-sell and Jev-gate bugs skewed the books.

Cleared: every book, ghost, the basket, capital, ATH, day opens, sleeves' rule state, bench, epochs, open covered calls,
highlights and the evolution window (its start values are old book values), plus every row of desk_trades and
desk_marks. Kept: the flies' minds, bars, prices, universe, chains, known tokens, looks, readouts, Jev/TimesFM events,
launches and the settings. The engine opens fresh $100 books on its next bar.

Run it only with the desk STOPPED (the engine keeps its state in memory and would save the old books back):
    fly machine stop 80e9266f6993e8 -a flytrade-desk
    python reset_desk.py            # dry run: what would go
    python reset_desk.py --yes
    fly machine start 80e9266f6993e8 -a flytrade-desk

Backup taken first: C:\\Users\\artif\\OneDrive\\Desktop\\fly-data\\desk-reset-2026-09-23 (desk_state, desk_trades,
desk_marks, desk_public, desk_config as JSON).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402
import requests  # noqa: E402

MONEY = ["books", "capital", "ghosts", "basket", "ath", "day_open", "curve_bought", "pending", "rules", "benched",
         "epoch_active", "epoch_started", "epoch_bars", "epoch_holders", "loxley", "writing", "highlights", "evolve"]

key = status.env("SUPABASE_SERVICE_ROLE_KEY")
url = status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/"
H = {"apikey": key, "Authorization": f"Bearer {key}", "Prefer": "count=exact"}

have = sorted(r["key"] for r in status.get("desk_state?select=key"))
print("state cleared:", [k for k in have if k in MONEY])
print("state kept:   ", [k for k in have if k not in MONEY])
for t in ("desk_trades", "desk_marks"):
    r = requests.head(url + f"{t}?select=id", headers={**H, "Range": "0-0"}, timeout=60)
    print(f"{t}: {r.headers.get('content-range')} rows cleared")
if "--yes" not in sys.argv:
    sys.exit("(dry run: stop the desk, then add --yes)")

r = requests.delete(url + "desk_state?key=in.(" + ",".join(MONEY) + ")", headers=H, timeout=120)
r.raise_for_status()
print("desk_state:", r.headers.get("content-range"))
for t in ("desk_trades", "desk_marks"):
    r = requests.delete(url + f"{t}?id=gte.0", headers=H, timeout=600)
    r.raise_for_status()
    print(f"{t}:", r.headers.get("content-range"))
print("done - start the desk: fly machine start 80e9266f6993e8 -a flytrade-desk")
