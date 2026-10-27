#!/usr/bin/env python3
"""OpenRouter video generation: list models, generate, fetch. Stdlib only."""
import argparse, base64, json, mimetypes, os, sys, time, urllib.request, urllib.error
from pathlib import Path

API = "https://openrouter.ai/api/v1"
KEY = os.environ.get("OPENROUTER_API_KEY")


def req(method, path, body=None, raw=False):
    if not KEY:
        sys.exit("OPENROUTER_API_KEY is not set")
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + path, data=data, method=method, headers={
        "Authorization": f"Bearer {KEY}",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            out = resp.read()
            return out if raw else json.loads(out or b"{}")
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code}: {e.read().decode(errors='replace')[:800]}")


def image_url(path_or_url):
    if path_or_url.startswith(("http://", "https://", "data:")):
        return path_or_url
    mime = mimetypes.guess_type(path_or_url)[0] or "image/png"
    return f"data:{mime};base64," + base64.b64encode(Path(path_or_url).read_bytes()).decode()


def cmd_list(_):
    models = req("GET", "/videos/models")
    for m in models.get("data", []) if isinstance(models, dict) else models:
        price = m.get("pricing") or m.get("price") or ""
        print(f"{m.get('id', '?'):45} {json.dumps(price)[:120]}")


def poll(job_id, every=15, timeout=900):
    start = time.time()
    while True:
        job = req("GET", f"/videos/{job_id}")
        status = job.get("status")
        print(f"  {job_id}: {status} ({int(time.time() - start)}s)", file=sys.stderr)
        if status == "completed":
            return job
        if status == "failed":
            sys.exit(f"failed: {job.get('error')}")
        if time.time() - start > timeout:
            sys.exit(f"timed out; resume later with: fetch {job_id}")
        time.sleep(every)


def save(job, out_dir, meta):
    out = Path(out_dir); out.mkdir(parents=True, exist_ok=True)
    stem = f"{time.strftime('%Y%m%d-%H%M%S')}-{job['id'][:8]}"
    mp4 = out / f"{stem}.mp4"
    mp4.write_bytes(req("GET", f"/videos/{job['id']}/content?index=0", raw=True))
    cost = (job.get("usage") or {}).get("cost")
    (out / f"{stem}.json").write_text(json.dumps({**meta, "job_id": job["id"], "cost": cost}, indent=2))
    print(json.dumps({"file": str(mp4), "cost_usd": cost, "job_id": job["id"]}))


def cmd_gen(a):
    body = {"model": a.model, "prompt": a.prompt, "duration": a.duration,
            "aspect_ratio": a.aspect, "resolution": a.resolution}
    if a.no_audio:
        body["generate_audio"] = False
    if a.seed is not None:
        body["seed"] = a.seed
    if a.image:
        body["frame_images"] = [{"type": "image_url", "image_url": {"url": image_url(a.image)},
                                 "frame_type": "first_frame"}]
    job = req("POST", "/videos", body)
    print(f"submitted {job['id']}", file=sys.stderr)
    done = poll(job["id"])
    save(done, a.out, {k: v for k, v in body.items() if k != "frame_images"})


def cmd_fetch(a):
    save(poll(a.job_id), a.out, {"resumed": True})


p = argparse.ArgumentParser()
sub = p.add_subparsers(dest="cmd", required=True)
sub.add_parser("list").set_defaults(fn=cmd_list)
g = sub.add_parser("gen")
g.add_argument("--model", required=True)
g.add_argument("--prompt", required=True)
g.add_argument("--duration", type=int, default=5)
g.add_argument("--aspect", default="9:16")
g.add_argument("--resolution", default="480p")
g.add_argument("--image")
g.add_argument("--seed", type=int)
g.add_argument("--no-audio", action="store_true")
g.add_argument("--out", default="videos")
g.set_defaults(fn=cmd_gen)
f = sub.add_parser("fetch")
f.add_argument("job_id")
f.add_argument("--out", default="videos")
f.set_defaults(fn=cmd_fetch)
a = p.parse_args(); a.fn(a)
