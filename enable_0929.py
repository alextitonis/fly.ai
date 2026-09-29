"""The 2026-09-29 desk settings (the user: "see what can we do and fix etc and improve from all the test").

Retire the ghosts that lost in every window measured on the same bars (desk_marks 6 h / 12 h / 24 h / 36 h, 09-27
18:10 -> 09-29 07:32; main brains -2.3% / -4.6% over 24 h / 36 h):
    old -7.8 / -12.9   cap15 -9.1 / -13.8   small -9.2 / -13.9   realcost -9.3 / -14.7   cheap -9.6 / -12.9
    explore -11.6 / -18.6   lockout -13.9 / -20.3   hours -13.9 / -20.9   premerge -14.0 / -19.8
Each ghost is a full extra run of the 12 brains per bar on a 1-CPU machine: nine fewer is ~30% less brain work.
lockout also duplicates main now (main has lockout on); realcost duplicates main's measured paper costs.

Kept on purpose: rev6. Its settings are main's since 09-28, so rev6 minus main is pure luck - over 12 h that gap was
+6.6 points, $97 of it one fake +397% take-profit on a bad solana:CALI print (fixed in chains.prices). No ghost's
lead over main is real yet; nothing is promoted into main.

Settings only; the code half ships with flytrade/desk/deploy.sh first.
    python enable_0929.py          # show the change
    python enable_0929.py --yes    # write it
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402  (reads flybook/.env)
import requests  # noqa: E402

RETIRE = ["old", "cap15", "small", "realcost", "cheap", "explore", "lockout", "hours", "premerge"]

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
names = [g["name"] for g in doc.get("ghosts", [])]
gone = [n for n in RETIRE if n in names]
if not gone:
    sys.exit("already applied (none of the retired ghosts is configured)")
doc["ghosts"] = [g for g in doc["ghosts"] if g["name"] not in RETIRE]

print("retire:", ", ".join(gone))
print(f"ghosts: {len(names)} -> {len(doc['ghosts'])}:", ", ".join(g["name"] for g in doc["ghosts"]))
if "--yes" not in sys.argv:
    sys.exit("(dry run: add --yes to write)")
key = status.env("SUPABASE_SERVICE_ROLE_KEY")
r = requests.patch(status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/desk_config?id=eq.1",
                   headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                   json={"settings": doc, "updated_at": datetime.now(timezone.utc).isoformat()}, timeout=30)
r.raise_for_status()
print("written")
