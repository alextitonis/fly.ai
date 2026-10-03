"""Faster Fly Desk bars (the user 2026-10-03: "make the actions quick ... not wait 15 mins"): a bar takes 5-7.5 minutes of
the machine's one shared CPU, most of it the ghost books. These have given their answer (as of 2026-10-03 08:27 UTC):

    guard -68.5%, guard8 -65.0%, poly -59.9%, pre0930 -48.4%, revbook -48.1%, polyband -28.5%, rev50 -22.9%

Removing them drops their state with them (Desk.ghosts pops a ghost taken out of the settings).
    python enable_trim_ghosts.py          # show the change
    python enable_trim_ghosts.py --yes    # write it
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402  (reads flybook/.env)
import requests  # noqa: E402

GONE = {"guard", "guard8", "poly", "pre0930", "revbook", "polyband", "rev50"}

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
before = [g["name"] for g in doc.get("ghosts", [])]
doc["ghosts"] = [g for g in doc.get("ghosts", []) if g["name"] not in GONE]
after = [g["name"] for g in doc["ghosts"]]
if len(after) == len(before):
    sys.exit("nothing to remove")
print(f"ghosts {len(before)} -> {len(after)}; removed:", ", ".join(n for n in before if n in GONE))
if "--yes" not in sys.argv:
    sys.exit("(dry run: add --yes to write)")
key = status.env("SUPABASE_SERVICE_ROLE_KEY")
r = requests.patch(status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/desk_config?id=eq.1",
                   headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                   json={"settings": doc, "updated_at": datetime.now(timezone.utc).isoformat()}, timeout=30)
r.raise_for_status()
print("written")
