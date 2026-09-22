"""Add the "tsfm" ghost: the main flies' flags plus tsfm (TimesFM's forecast as part of the smell), so the forecast
sense is the only difference from the main flies. Needs a TimesFM backend on the desk first (flytrade/desk/tsfm.py:
fly secrets TSFM_GCP_PROJECT + TSFM_GCP_KEY for BigQuery, or TSFM_URL); without one the ghost is just a copy.

    python enable_tsfm.py            # show the change
    python enable_tsfm.py --yes      # write it
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402  (reads flybook/.env)
import requests  # noqa: E402

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
main = [f for f in doc.get("flags", []) if f != "tsfm"]
ghost = {"name": "tsfm", "settings": {"flags": main + ["tsfm"]}}
ghosts = [g for g in doc.setdefault("ghosts", []) if g.get("name") != "tsfm"] + [ghost]
doc["ghosts"] = ghosts
print("tsfm ghost flags:", ghost["settings"]["flags"])
print("ghosts:", [g["name"] for g in ghosts])
if "--yes" not in sys.argv:
    sys.exit("(dry run: add --yes to write)")
key = status.env("SUPABASE_SERVICE_ROLE_KEY")
r = requests.patch(status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/desk_config?id=eq.1",
                   headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                   json={"settings": doc, "updated_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()},
                   timeout=30)
r.raise_for_status()
print("written")
