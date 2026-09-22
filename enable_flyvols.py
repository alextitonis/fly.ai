"""Add the "flyvols" ghost to the live desk settings: the flies with the OLD volatility sense (a Flybook fly coin's,
desk_vols False) beside the main flies with the new one - the A/B for the 2026-09-22 fix. Run AFTER deploy.sh.

    python enable_flyvols.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402  (reads flybook/.env)
import requests  # noqa: E402

GHOST = {"name": "flyvols", "settings": {"desk_vols": False}}

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
ghosts = doc.setdefault("ghosts", [])
if any(g.get("name") == GHOST["name"] for g in ghosts):
    sys.exit("flyvols is already in desk_config.ghosts")
ghosts.append(GHOST)
key = status.env("SUPABASE_SERVICE_ROLE_KEY")
r = requests.patch(status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/desk_config?id=eq.1",
                   headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                   json={"settings": doc, "updated_at": __import__("datetime").datetime.utcnow().isoformat() + "Z"},
                   timeout=30)
r.raise_for_status()
print("ghosts now:", [g["name"] for g in ghosts])
