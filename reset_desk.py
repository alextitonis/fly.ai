"""Restart the paper desk's money and trades (the user 2026-09-23 "reset the money and all trades, keep all the known
data"; rewritten 2026-09-30 for DIRECT SQL - PostgREST was answering 503 that night - with its own backup).

Cleared: every book, ghost, the basket, capital, ATH, day opens, sleeves' rule state, bench, epochs, open covered calls,
highlights, the evolution window (its start values are old book values) and the $FLYAI funding ledger, plus every row of
desk_trades and desk_marks. Kept: the flies' minds, bars, prices, universe, chains, known tokens, looks, readouts,
Jev/TimesFM events, launches and the settings. The engine opens fresh books on its next bar ($100 a fly + the reversal
and stockgap sleeves from the settings).

The backup is written FIRST, to C:\\Users\\artif\\OneDrive\\Desktop\\fly-data\\desk-reset-<date> (desk_state, desk_config,
desk_public as JSON; desk_trades and desk_marks as JSON lines), and nothing is deleted if it fails.

Run it only with the desk STOPPED (the engine keeps its state in memory and would save the old books back; the script
refuses while `fly status` says the machine is started):
    fly machine stop 80e9266f6993e8 -a flytrade-desk
    python reset_desk.py            # dry run: what would go
    python reset_desk.py --yes
    fly machine start 80e9266f6993e8 -a flytrade-desk
"""
import json
import re
import subprocess
import sys
import time
from pathlib import Path

MONEY = ["books", "capital", "ghosts", "basket", "ath", "day_open", "curve_bought", "pending", "rules", "benched",
         "epoch_active", "epoch_started", "epoch_bars", "epoch_holders", "loxley", "writing", "highlights", "evolve",
         "funding"]
ROOT = Path(__file__).parent


def dsn() -> str:
    txt = (ROOT / "flybook" / ".env").read_text(encoding="utf8")
    m = re.search(r"postgres(?:ql)?://postgres\.fixyinamewrjrcybjoua:[^@\s\"']+@aws-1-eu-west-3\.pooler\.supabase\.com:\d+(?:/\w+)?", txt)
    if not m:
        sys.exit("no pooler URL for the flybook project in flybook/.env")
    u = m.group(0)
    return u if u.count("/") >= 3 else u + "/postgres"


def desk_running() -> bool:
    out = subprocess.run(["fly", "status", "-a", "flytrade-desk"], capture_output=True, text=True, timeout=60).stdout
    return any(" started " in line or "│ started" in line for line in out.splitlines())


def main() -> None:
    import psycopg
    yes = "--yes" in sys.argv
    with psycopg.connect(dsn(), autocommit=True, connect_timeout=30, prepare_threshold=None,
                         options="-c statement_timeout=600000") as c:
        have = sorted(r[0] for r in c.execute("select key from desk_state").fetchall())
        print("state cleared:", [k for k in have if k in MONEY])
        print("state kept:   ", [k for k in have if k not in MONEY])
        # desk_epochs too (2026-10-04, before the live launch): the header always said epochs are cleared, but the rows
        # stayed - and the last paper epoch's peak_after would become the live desk's Peak Line (no payout until the
        # live books passed the paper peak)
        counts = {t: c.execute(f"select count(*) from {t}").fetchone()[0] for t in ("desk_trades", "desk_marks", "desk_epochs")}
        for t, n in counts.items():
            print(f"{t}: {n} rows cleared")
        if not yes:
            sys.exit("(dry run: stop the desk, then add --yes)")
        if desk_running():
            sys.exit("the desk machine is still started: fly machine stop 80e9266f6993e8 -a flytrade-desk")

        out = Path(r"C:\Users\artif\OneDrive\Desktop\fly-data") / f"desk-reset-{time.strftime('%Y-%m-%d')}"
        out.mkdir(parents=True, exist_ok=True)
        for t, keycol in (("desk_state", "key"), ("desk_config", "id"), ("desk_public", "key"), ("desk_epochs", "epoch")):
            # one row at a time: the whole of desk_state (~16 MB of jsonb) in one statement timed out on a starved database
            keys = [r[0] for r in c.execute(f"select {keycol} from {t} order by {keycol}").fetchall()]
            rows = []
            for k in keys:
                got = c.execute(f"select row_to_json(x) from (select * from {t} where {keycol} = %s) x", (k,)).fetchone()
                if got:
                    rows.append(got[0])
            (out / f"{t}.json").write_text(json.dumps(rows, default=str), encoding="utf8")
            print(f"backup {t}: {len(rows)} rows", flush=True)
        for t in ("desk_trades", "desk_marks"):
            n = 0
            last = -1
            with open(out / f"{t}.jsonl", "w", encoding="utf8") as f:
                while True:                            # pages by id: a starved database answers small reads
                    page = c.execute(f"select id, row_to_json(x) from (select * from {t} where id > %s order by id "
                                     f"limit 2000) x", (last,)).fetchall()
                    if not page:
                        break
                    for rid, row in page:
                        f.write(json.dumps(row, default=str) + "\n")
                        n += 1
                        last = rid
            if n != counts[t]:
                print(f"note: {t} backup has {n} rows, counted {counts[t]} (rows arrived meanwhile?)")
            print(f"backup {t}: {n} rows", flush=True)
        print("backup in", out)

        with c.transaction():                          # all or nothing
            d1 = c.execute("delete from desk_state where key = any(%s)", (MONEY,)).rowcount
            d2 = c.execute("delete from desk_trades").rowcount
            d3 = c.execute("delete from desk_marks").rowcount
            d4 = c.execute("delete from desk_epochs").rowcount
        print(f"deleted: desk_state {d1}, desk_trades {d2}, desk_marks {d3}, desk_epochs {d4}")
    print("done - start the desk: fly machine start 80e9266f6993e8 -a flytrade-desk")


if __name__ == "__main__":
    main()
