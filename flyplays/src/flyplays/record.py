"""9:16 clips: the game on top, the fly's brain underneath, 50 fps, no sound. Ready for TikTok / Shorts / Reels.

ffmpeg comes with the imageio-ffmpeg package (installed with flyplays), so there's nothing else to set up.
"""
from __future__ import annotations

import subprocess
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1920
FPS = 50
BG = (12, 14, 18)
INK = (240, 244, 248)
DIM = (120, 130, 140)
MINT = (94, 242, 204)
HOT = (255, 90, 90)
GOLD = (255, 205, 70)


def font(size: int, bold: bool = True):
    names = (["arialbd.ttf", "segoeuib.ttf", "DejaVuSans-Bold.ttf", "Arial Bold.ttf", "Helvetica.ttc"] if bold
             else ["arial.ttf", "segoeui.ttf", "DejaVuSans.ttf", "Arial.ttf", "Helvetica.ttc"])
    for name in names:
        for path in (name, f"C:/Windows/Fonts/{name}", f"/usr/share/fonts/truetype/dejavu/{name}",
                     f"/Library/Fonts/{name}", f"/System/Library/Fonts/{name}"):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                pass
    try:
        return ImageFont.load_default(size)
    except TypeError:
        return ImageFont.load_default()


def ffmpeg() -> str:
    import shutil
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        exe = shutil.which("ffmpeg")
        if not exe:
            raise SystemExit("clips need ffmpeg: pip install imageio-ffmpeg")
        return exe


class Recorder:
    ROWS = 160          # neurons shown in the spike strip
    COLS = 250          # steps of history in the strip

    def __init__(self, out, game, fly):
        self.out = Path(out)
        self.out.parent.mkdir(parents=True, exist_ok=True)
        self.game, self.fly = game, fly
        self.proc = subprocess.Popen(
            [ffmpeg(), "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
             "-r", str(FPS), "-i", "-", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20",
             "-preset", "medium", "-movflags", "+faststart", str(self.out)], stdin=subprocess.PIPE)
        self.f_mid, self.f_small = font(40), font(30, bold=False)
        self.raster = deque(maxlen=self.COLS)
        self.glow = {a: 0 for a in ("left", "right", "escape")}
        rng = np.random.default_rng(0)
        eye = np.concatenate([fly.see["chase"]["L"][:16], fly.see["chase"]["R"][:16],
                              fly.see["loom"]["L"][:8], fly.see["loom"]["R"][:8]])
        dns = np.concatenate([fly.steer["L"], fly.steer["R"], fly.escape_cells["L"], fly.escape_cells["R"]])
        rest = rng.choice(fly.brain.n, self.ROWS - len(eye) - len(dns), replace=False)
        self.rows = np.concatenate([eye, dns, rest])
        self.cut = (len(eye), len(eye) + len(dns))
        self.last_frame = None

    def add(self, t: float, state, d) -> None:
        fly, game = self.fly, self.game
        frame = game.frame()
        if frame is None:
            frame = self.last_frame if self.last_frame is not None else np.zeros((480, 640, 3), np.uint8)
        self.last_frame = frame
        self.raster.append(np.isin(self.rows, fly.fired) if d is not None else np.zeros(len(self.rows), bool))
        img = Image.new("RGB", (W, H), BG)
        fh, fw = frame.shape[:2]
        gw = W
        gh = int(round(fh * W / fw))
        if gh > 1300:                       # tall games: fit the height and centre
            gh, gw = 1300, int(round(fw * 1300 / fh))
        img.paste(Image.fromarray(frame).resize((gw, gh), Image.NEAREST), ((W - gw) // 2, 92))
        dr = ImageDraw.Draw(img)
        dr.rectangle([0, 0, W, 92], fill=(0, 0, 0))
        dr.text((W // 2, 46), game.title, font=self.f_mid, fill=INK, anchor="mm")

        y0 = 92 + gh + 20
        dv = fly.drive
        dr.text((40, y0), "EYES", font=self.f_small, fill=DIM)
        self._bar(dr, 40, y0 + 40, 300, max(dv["chaseL"], dv["loomL"], dv["threatL"]), MINT, "left eye")
        self._bar(dr, 40, y0 + 90, 300, max(dv["chaseR"], dv["loomR"], dv["threatR"]), MINT, "right eye")
        dr.text((400, y0), "DECISION NEURONS (Hz)", font=self.f_small, fill=DIM)
        self._bar(dr, 400, y0 + 40, 300, min(1, fly.L / 40), GOLD, f"steer L {fly.L:4.0f}")
        self._bar(dr, 400, y0 + 90, 300, min(1, fly.R / 40), GOLD, f"steer R {fly.R:4.0f}")
        if d is not None:
            for a in d.actions:
                if game.labels.get(a):
                    self.glow[a] = 10
        shown = [(a, g) for a, g in self.glow.items() if g > 0 and game.labels.get(a)]
        if shown:
            a, g = max(shown, key=lambda x: x[1])
            col = tuple(int(BG[i] + (HOT[i] - BG[i]) * g / 10) for i in range(3))
            dr.rounded_rectangle([760, y0 + 30, 1040, y0 + 130], 24, fill=col)
            dr.text((900, y0 + 80), game.labels[a], font=self.f_mid, fill=INK, anchor="mm")
        for a in self.glow:
            self.glow[a] = max(0, self.glow[a] - 1)

        ry = y0 + 170
        rh = H - ry - 80
        dr.text((40, ry - 10), f"{len(fly.fired):,} of {fly.brain.n:,} neurons firing", font=self.f_small, fill=DIM)
        ry += 30
        if rh > 40:
            cell = rh / len(self.rows)
            for i, col in enumerate(self.raster):
                x = 40 + i * 4
                for r in np.flatnonzero(col):
                    c = GOLD if self.cut[0] <= r < self.cut[1] else (MINT if r < self.cut[0] else (170, 180, 200))
                    yy = ry + r * cell
                    dr.rectangle([x, yy, x + 2, yy + max(1, cell - 1)], fill=c)
        dr.text((40, H - 46), f"{game.score_name} {state.score:g}    {t:5.1f}s", font=self.f_small, fill=INK, anchor="lm")
        dr.text((W - 40, H - 46), "real fruit fly connectome · nothing trained", font=self.f_small, fill=DIM, anchor="rm")
        self.proc.stdin.write(np.asarray(img).tobytes())

    def _bar(self, d, x, y, w, frac, col, label):
        d.rounded_rectangle([x, y, x + w, y + 36], 10, fill=(32, 36, 44))
        if frac > 0.01:
            d.rounded_rectangle([x, y, x + max(20, int(w * min(1.0, frac))), y + 36], 10, fill=col)
        d.text((x + 12, y + 18), label, font=self.f_small, fill=(10, 10, 10) if frac > 0.35 else INK, anchor="lm")

    def close(self) -> None:
        self.proc.stdin.close()
        self.proc.wait()
