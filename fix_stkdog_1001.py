"""Undo the STKDOG paper gain on the desk's record (2026-10-01).

STKDOG (Robinhood; five pools at 42-80% fee tiers) sat at a stale 3.34e-6 for hours, then printed 1.0e-9. The quick
rule clock had no bad-print filter, so the reversal sleeves read a 3,300x "dip" and bought 12-21 billion each for
~$13 (15 buys, 01:31-02:57 UTC), and the books marked them at the stale 3.34e-6: the pot showed ~$576k on $6.2k.
The code fix (engine.quick_rules filter + bookvalue SUSPECT) stops it from here on; this repairs what was recorded:

    desk_marks   each reversal sleeve's marks since the first buy: the STKDOG lot counted at its cost, not 3.34e-6
    ath          the all-time-high tile: reseeded from the repaired marks on the engine's next bar

The positions themselves stay (they count at cost until a price is confirmed). The engine keeps its state in memory and
saves it every bar, so stop it first:
    fly machine stop -a flytrade-desk <id>     # (fly machine list -a flytrade-desk)
    python fix_stkdog_1001.py                  # show the change
    python fix_stkdog_1001.py --yes            # write it
    bash flytrade/desk/deploy.sh               # the fixed code, starts the desk again
"""
import json
import sys
from pathlib import Path

import psycopg
from dotenv import dotenv_values

STALE = 3.34e-06
env = dotenv_values(Path(__file__).parent / "flybook" / ".env")
c = psycopg.connect(env.get("SUPABASE_POOLER_URL") or env["SUPABASE_DB_URL"], connect_timeout=30)

buys = c.execute("select book, at, qty, usd from desk_trades where symbol='STKDOG' and side='buy' "
                 "and status='filled' order by at").fetchall()
sells = c.execute("select count(*) from desk_trades where symbol='STKDOG' and side<>'buy'").fetchone()[0]
if sells:
    sys.exit(f"{sells} STKDOG sells on record: the lots changed, this script assumes buys only")
lots: dict[str, list] = {}
for book, at, qty, usd in buys:
    lots.setdefault(book.removeprefix("fly:"), []).append((at, float(qty), float(usd)))   # marks: "2/reversal"
first = min(at for book, at, *_ in buys)

fixes, before, after = [], 0.0, 0.0
for mid, book, at, value in c.execute("select id, book, at, value_usd from desk_marks where at >= %s and book = any(%s)",
                                      (first, list(lots))).fetchall():
    qty = sum(q for t, q, u in lots[book] if t <= at)
    cost = sum(u for t, q, u in lots[book] if t <= at)
    excess = qty * STALE - cost
    if qty <= 0 or excess <= 0 or float(value) < qty * STALE:   # not counted at the stale price: leave it
        continue
    fixes.append((round(float(value) - excess, 6), mid))
    before, after = before + float(value), after + float(value) - excess
ath = c.execute("select value from desk_state where key='ath'").fetchone()[0]
print(f"{len(buys)} STKDOG buys in {len(lots)} sleeves since {first:%Y-%m-%d %H:%M} UTC")
print(f"marks to repair: {len(fixes)} (sum ${before:,.0f} -> ${after:,.0f})")
print(f"ath now: {json.dumps(ath)} -> reseeded from the repaired marks")
if "--yes" not in sys.argv:
    sys.exit("(dry run: add --yes to write; stop the desk first)")
c.cursor().executemany("update desk_marks set value_usd = %s where id = %s", fixes)
c.execute("update desk_state set value = %s where key = 'ath'", (json.dumps({"seeded": 1}),))
c.commit()                     # the selects above opened a transaction: a nested transaction() was only a savepoint
print("written")
