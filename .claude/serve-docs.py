"""Local preview of flyaiworld.com (2026-10-25): docs/ like Vercel serves it, so links work as on the live site.

  python .claude/serve-docs.py [port]        (default 8090; .claude/launch.json "docs")

- clean URLs: /desk -> desk.html, /simulation/ -> simulation/index.html
- /traderflies/* -> the Trader Flies dev server (vite with VITE_BASE=/traderflies/ on 5173, launch.json "traderflies"),
  so the app is the working copy, not the published build in docs/traderflies
- /mapi/* -> the mine server, as vercel.json rewrites it (public reads: leaderboards, fly views)
"""
import http.server, os, sys, urllib.error, urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs")
APP = "http://localhost:5173"   # vite listens on localhost (IPv6 ::1 on Windows), not 127.0.0.1
MINE = "https://flyai-mine.fly.dev"


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def proxy(self, url):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "fly-local-preview"})
            with urllib.request.urlopen(req, timeout=20) as r:
                body, status, ctype = r.read(), r.status, r.headers.get("Content-Type", "")
        except urllib.error.HTTPError as e:
            body, status, ctype = e.read(), e.code, e.headers.get("Content-Type", "")
        except Exception as e:  # the dev server isn't running, the network is down
            body, status, ctype = f"proxy error: {e}".encode(), 502, "text/plain"
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/traderflies" or path.startswith("/traderflies/"):
            return self.proxy(APP + self.path)
        if path.startswith("/mapi/"):
            return self.proxy(MINE + self.path[len("/mapi"):])
        local = os.path.join(ROOT, path.lstrip("/"))
        if not os.path.exists(local) and os.path.exists(local + ".html"):
            self.path = path + ".html" + self.path[len(path):]
        return super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")   # always the working copy
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8090
    http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
