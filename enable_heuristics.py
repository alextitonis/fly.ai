"""Promote the two best ghosts to the main flies: flags rpe (reward charged the desk's real costs) + risk (launch
taste, GoPlus holders, curve fill speed). On 2026-09-22 (~22 bars, thin) rpe +6.7% and risk +6.7% vs main -6.5%,
random -0.2%. Adds ghost "plain" (no flags) so the old setup stays measured beside them. Run AFTER deploy.sh.

    python enable_heuristics.py            # show the change
    python enable_heuristics.py --yes      # write it
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402  (reads flybook/.env)
import requests  # noqa: E402

FLAGS = ["rpe", "risk"]
PLAIN = {"name": "plain", "settings": {"flags": []}}

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
print("flags:", doc.get("flags", []), "->", FLAGS)
doc["flags"] = FLAGS
ghosts = doc.setdefault("ghosts", [])
if not any(g.get("name") == PLAIN["name"] for g in ghosts):
    ghosts.append(PLAIN)
print("ghosts:", [g["name"] for g in ghosts])
if "--yes" not in sys.argv:
    sys.exit("(dry run: add --yes to write)")
key = status.env("SUPABASE_SERVICE_ROLE_KEY")
r = requests.patch(status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/desk_config?id=eq.1",
                   headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                   json={"settings": doc, "updated_at": __import__("datetime").datetime.utcnow().isoformat() + "Z"},
                   timeout=30)
r.raise_for_status()
print("written")
