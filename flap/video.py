"""9:16 clip: the game on top, the fly's brain underneath. Frames go straight into ffmpeg (no audio)."""
from __future__ import annotations

import shutil
import subprocess
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1920
GAME_H = 1440                       # 480x640 game scaled x2.25
FPS = 50                            # one frame per 20 ms brain step = real game speed
FFMPEG = shutil.which("ffmpeg") or "C:/ffmpeg/bin/ffmpeg.exe"

BG = (12, 14, 18)
INK = (240, 244, 248)
DIM = (120, 130, 140)
MINT = (80, 240, 180)
HOT = (255, 90, 90)
GOLD = (255, 205, 70)


def font(size, bold=True):
    for name in (["arialbd.ttf", "segoeuib.ttf"] if bold else ["arial.ttf", "segoeui.ttf"]):
        try:
            return ImageFont.truetype(f"C:/Windows/Fonts/{name}", size)
        except OSError:
            pass
    return ImageFont.load_default()


class Recorder:
    RASTER_W = 1000
    ROWS = 160          # neurons shown in the spike strip

    def __init__(self, out: Path):
        self.out = Path(out)
        self.out.parent.mkdir(parents=True, exist_ok=True)
        self.proc = subprocess.Popen(
            [FFMPEG, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
             "-r", str(FPS), "-i", "-", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20",
             "-preset", "medium", "-movflags", "+faststart", str(self.out)],
            stdin=subprocess.PIPE)
        self.f_big, self.f_mid, self.f_small = font(64), font(40), font(30, bold=False)
        self.raster = deque(maxlen=self.RASTER_W // 4)
        self.flap_glow = 0
        self.flaps = 0
        self.rows = None

    def _rows(self, fly):
        """A fixed sample of neurons for the strip: the eye (LC10a) on top, the steering DNs and DNp01
        in the middle, a random sample of the rest of the brain below."""
        if self.rows is None:
            rng = np.random.default_rng(0)
            eye = np.concatenate([fly.see["L"][:24], fly.see["R"][:24]])
            dns = np.concatenate([fly.steer["L"], fly.steer["R"], fly.escape_cells])
            rest = rng.choice(fly.brain.n, self.ROWS - len(eye) - len(dns), replace=False)
            self.rows = np.concatenate([eye, dns, rest])
            self.dn_rows = (len(eye), len(eye) + len(dns))
        return self.rows

    def mark(self, fly, flap: bool):
        """Every brain step (frames may be rarer when the brain steps faster than 50 fps)."""
        if flap:
            self.flap_glow, self.flaps = 10, self.flaps + 1

    def add(self, frame: np.ndarray, fly, v, t: float, dead: bool = False):
        rows = self._rows(fly)
        self.raster.append(np.isin(rows, fly.fired) if not dead else np.zeros(len(rows), bool))
        img = Image.new("RGB", (W, H), BG)
        img.paste(Image.fromarray(frame).resize((W, GAME_H), Image.NEAREST), (0, 0))
        d = ImageDraw.Draw(img)

        # top banner over the game
        d.rectangle([0, 0, W, 92], fill=(0, 0, 0))
        d.text((W // 2, 46), "A REAL FLY BRAIN PLAYS FLAPPY BIRD", font=self.f_mid, fill=INK, anchor="mm")

        y0 = GAME_H + 18
        # eyes: where the opening is
        eL, eR = fly.eye
        d.text((40, y0), "EYES", font=self.f_small, fill=DIM)
        self._bar(d, 40, y0 + 40, 300, eL, MINT, "gap above")
        self._bar(d, 40, y0 + 90, 300, eR, MINT, "gap below")
        # steering neurons: the fly's decision
        d.text((420, y0), "STEERING NEURONS (Hz)", font=self.f_small, fill=DIM)
        self._bar(d, 420, y0 + 40, 300, min(1, fly.L / 40), GOLD, f"up   {fly.L:4.0f}")
        self._bar(d, 420, y0 + 90, 300, min(1, fly.R / 40), GOLD, f"down {fly.R:4.0f}")
        # flap flash
        if self.flap_glow > 0:
            a = self.flap_glow / 10
            col = tuple(int(BG[i] + (HOT[i] - BG[i]) * a) for i in range(3))
            d.rounded_rectangle([830, y0 + 20, 1050, y0 + 130], 24, fill=col)
            d.text((940, y0 + 75), "FLAP!", font=self.f_mid, fill=INK, anchor="mm")
            self.flap_glow -= 1
        # spike raster
        ry = y0 + 160
        rh = H - ry - 70
        d.text((40, ry - 8), f"{len(fly.fired):,} of 166,700 neurons firing", font=self.f_small, fill=DIM)
        ry += 32
        n = len(rows)
        cell = rh / n
        for i, col in enumerate(self.raster):
            x = 40 + i * 4
            for r in np.flatnonzero(col):
                c = GOLD if self.dn_rows[0] <= r < self.dn_rows[1] else (MINT if r < self.dn_rows[0] else (170, 180, 200))
                yy = ry + r * cell
                d.rectangle([x, yy, x + 2, yy + max(1, cell - 1)], fill=c)
        # footer: score + time
        d.text((40, H - 50), f"pipes {v.score}   flaps {self.flaps}   {t:5.1f}s", font=self.f_small, fill=INK, anchor="lm")
        d.text((W - 40, H - 50), "fruit fly connectome, nothing trained", font=self.f_small, fill=DIM, anchor="rm")
        self.proc.stdin.write(np.asarray(img).tobytes())

    def _bar(self, d, x, y, w, frac, col, label):
        d.rounded_rectangle([x, y, x + w, y + 36], 10, fill=(32, 36, 44))
        if frac > 0.01:
            d.rounded_rectangle([x, y, x + max(20, int(w * frac)), y + 36], 10, fill=col)
        d.text((x + 12, y + 18), label, font=self.f_small, fill=(10, 10, 10) if frac > 0.35 else INK, anchor="lm")

    def close(self, result=None):
        self.proc.stdin.close()
        self.proc.wait()
