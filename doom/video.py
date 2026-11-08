"""9:16 clip where the fly's brain is the screen. Nothing on it is Doom's own picture:

- top: the screen, drawn only from the fly's 6,006 photoreceptors firing. Each hex tile is one column of its
  eye, put back where on the screen that column looks, lit by its photoreceptors' spike rate (divided by what
  the column fires on a plain grey screen, like a camera's flat-field correction).
- below: the brain in 3D, slowly turning. Every neuron with a position glows when it fires, and the same eye
  columns are painted on the lamina (eye.lamina_xyz), so you watch Doom land on the brain itself.

Frames go straight into ffmpeg at 35 fps (Doom's own tic rate), no audio."""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.spatial import cKDTree

import eye as eyemod

W, H = 1080, 1920
FPS = 35
FFMPEG = shutil.which("ffmpeg") or "C:/ffmpeg/bin/ffmpeg.exe"

BG = (8, 9, 12)
INK = (240, 244, 248)
DIM = (120, 130, 140)
HOT = (255, 70, 50)
GOLD = (255, 205, 70)

SCREEN_H = 960                     # the brain-drawn screen (the eyes are taller than wide)
BRAIN_Y, BRAIN_H = 960, 720
SWAY = np.radians(55)              # the 3D brain turns +-55 degrees so each eye's lamina faces you in turn
SWAY_PERIOD = 10.0                 # s


def font(size, bold=True):
    for name in (["arialbd.ttf", "segoeuib.ttf"] if bold else ["arial.ttf", "segoeui.ttf"]):
        try:
            return ImageFont.truetype(f"C:/Windows/Fonts/{name}", size)
        except OSError:
            pass
    return ImageFont.load_default()


def heat(v: np.ndarray) -> np.ndarray:
    """0..1 -> black, deep red, orange, pale yellow."""
    v = np.clip(v, 0, 1)[..., None]
    stops = np.array([[6, 6, 8], [110, 18, 8], [240, 110, 25], [255, 236, 180]], np.float32)
    x = v * (len(stops) - 1)
    i = np.clip(x.astype(int), 0, len(stops) - 2)
    f = x - i
    return (stops[i[..., 0]] * (1 - f) + stops[i[..., 0] + 1] * f).astype(np.uint8)


class Recorder:
    def __init__(self, out: Path | None, brain, eye):
        self.out = Path(out) if out else None
        self.proc = None
        if self.out:
            self.out.parent.mkdir(parents=True, exist_ok=True)
            self.proc = subprocess.Popen(
                [FFMPEG, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                 "-r", str(FPS), "-i", "-", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20",
                 "-preset", "medium", "-movflags", "+faststart", str(self.out)], stdin=subprocess.PIPE)
        self.f_mid, self.f_small = font(38), font(28, bold=False)
        self.brain = brain
        self._eye_setup(brain, eye)
        self._brain_setup(brain)
        self.bang = 0
        self.last = None

    # ---- the eye's columns ----------------------------------------------------------------------------
    def _eye_setup(self, brain, eye):
        ok = np.isfinite(eye["x"])
        keys = np.array([f"{s}{a}_{b}" for s, a, b in zip(eye["side"], eye["h1"], eye["h2"])])
        _, first, col_of = np.unique(keys[ok], return_index=True, return_inverse=True)
        self.pr_ok = np.flatnonzero(ok)
        self.col_of = col_of
        self.ncol = len(first)
        cx = np.bincount(col_of, eye["x"][ok]) / np.bincount(col_of)
        cy = np.bincount(col_of, eye["y"][ok]) / np.bincount(col_of)
        # screen tiles: each pixel belongs to its nearest column; a thin dark gap shows the hex grid
        px, py = cx * W, (1 - cy) * SCREEN_H
        tree = cKDTree(np.c_[px, py])
        d2, i2 = tree.query(np.c_[np.mgrid[0:SCREEN_H, 0:W][1].ravel(), np.mgrid[0:SCREEN_H, 0:W][0].ravel()], k=2)
        self.tile_idx = i2[:, 0].reshape(SCREEN_H, W)
        spacing = np.median(tree.query(np.c_[px, py], k=2)[0][:, 1])
        edge = (d2[:, 1] - d2[:, 0]).reshape(SCREEN_H, W)         # distance to the border with the next tile
        self.tile_mask = (edge > 1.0) & (d2[:, 0].reshape(SCREEN_H, W) < 0.8 * spacing)
        # the same columns on the lamina, in 3D
        idx_ok = self.pr_ok[first]
        self.col_side = eye["side"][idx_ok]
        self.col_xyz = eyemod.lamina_xyz(self.col_side, eye["h1"][idx_ok], eye["h2"][idx_ok])
        self.pr_rate = np.zeros(len(eye["x"]), np.float32)
        self.pr_lookup = np.full(brain.n, -1, np.int64)
        self.pr_lookup[brain.visual] = np.arange(len(brain.visual))
        flat = eyemod.flat_field(brain)[self.pr_ok]
        self.col_flat = np.maximum(np.bincount(col_of, flat, self.ncol), 1e-3)

    # ---- the brain in 3D ------------------------------------------------------------------------------
    def _brain_setup(self, brain):
        p = np.nan_to_num(brain.positions.astype(np.float64))
        ok = (np.abs(p).sum(1) > 0) & (p[:, 2] < 60000)          # the brain, not the VNC behind it
        self.b_idx = np.flatnonzero(ok)
        self.centre = p[ok].mean(0)
        self.b_xyz = p[ok] - self.centre
        self.col_xyz = self.col_xyz - self.centre
        r = np.sqrt((self.b_xyz[:, [0, 2]] ** 2).sum(1)).max()
        self.scale = min((W - 40) / (2 * r), (BRAIN_H - 20) / (np.ptp(self.b_xyz[:, 1]) + 1))
        self.pos_of = np.full(brain.n, -1, np.int64)
        self.pos_of[self.b_idx] = np.arange(len(self.b_idx))
        self.glow = np.zeros(len(self.b_idx), np.float32)
        # each eye's lamina sheet faces outward: from the brain centre to the sheet's centre
        self.normal = {}
        for s in "LR":
            c = self.col_xyz[self.col_side == s].mean(0)
            self.normal[s] = c / np.linalg.norm(c)

    def _project(self, xyz, th):
        c, s = np.cos(th), np.sin(th)
        x = xyz[:, 0] * c + xyz[:, 2] * s
        u = (W / 2 + x * self.scale).astype(int)
        v = (BRAIN_H / 2 + xyz[:, 1] * self.scale).astype(int)
        return u, v

    # ---- one frame ------------------------------------------------------------------------------------
    def render(self, game, fly, act, t, dead=False) -> Image.Image:
        steps = [] if dead else (fly.fired_tic or [fly.fired])
        fly.fired_tic = []
        spk = np.zeros(len(self.pr_rate), np.float32)
        for st in steps:
            k = self.pr_lookup[st]
            spk[k[k >= 0]] += 1.0 / len(steps)
        self.pr_rate = 0.85 * self.pr_rate + 0.15 * spk          # ~0.2 s memory at 35 frames/s
        col = np.bincount(self.col_of, self.pr_rate[self.pr_ok], self.ncol) / self.col_flat
        lo, hi = np.percentile(col, (3, 97))                     # auto-contrast, like a monitor's
        self.lo = lo if not hasattr(self, "lo") else 0.9 * self.lo + 0.1 * lo
        self.hi = hi if not hasattr(self, "hi") else 0.9 * self.hi + 0.1 * hi
        x = np.clip((col - self.lo) / max(self.hi - self.lo, 1e-3), 0, 1)
        x = 0.5 * x + 0.5 * x * x * (3 - 2 * x)                   # mild S-curve: more contrast in the mid-tones
        colours = heat(x)

        screen = colours[self.tile_idx]
        screen[~self.tile_mask] = BG

        # brain: every firing neuron leaves a short glow
        self.glow *= 0.7
        for st in steps:
            k = self.pos_of[st]
            self.glow[k[k >= 0]] += 1.0 / len(steps)
        th = SWAY * np.sin(2 * np.pi * t / SWAY_PERIOD)
        u, v = self._project(self.b_xyz, th)
        ok = (u >= 0) & (u < W) & (v >= 0) & (v < BRAIN_H)
        base = np.zeros((BRAIN_H, W), np.float32)
        np.add.at(base, (v[ok], u[ok]), 1.0)
        lit = np.zeros((BRAIN_H, W), np.float32)
        np.add.at(lit, (v[ok], u[ok]), self.glow[ok])
        img_b = (np.clip(np.log1p(base) / 4, 0, 1) * 0.4)[..., None] * np.array([80, 100, 130], np.float32)
        img_b += np.clip(lit * 1.8, 0, 1)[..., None] * np.array([255, 130, 40], np.float32)
        img_b = np.clip(img_b + np.array(BG, np.float32), 0, 255)

        # Doom on the lamina: each column a small square, fading as its eye turns away from you
        cu, cv = self._project(self.col_xyz, th)
        c, s = np.cos(th), np.sin(th)
        for side in "LR":
            n = self.normal[side]
            facing = n[0] * (-s) + n[2] * c          # the sheet's outward normal along the view (depth) axis
            a = float(np.clip((-facing - 0.02) * 5.0, 0, 1))
            if a <= 0:
                continue
            m = np.flatnonzero(self.col_side == side)
            for dy in range(-5, 6):
                for dx in range(-5, 6):
                    uu, vv = cu[m] + dx, cv[m] + dy
                    keep = (uu >= 0) & (uu < W) & (vv >= 0) & (vv < BRAIN_H)
                    img_b[vv[keep], uu[keep]] = (1 - a) * img_b[vv[keep], uu[keep]] + a * colours[m[keep]]
        brain_img = img_b.astype(np.uint8)

        img = Image.new("RGB", (W, H), BG)
        img.paste(Image.fromarray(screen), (0, 0))
        img.paste(Image.fromarray(brain_img), (0, BRAIN_Y))
        d = ImageDraw.Draw(img)

        y = BRAIN_Y + BRAIN_H + 30
        turn = act.get("turn_deg", 0.0)
        d.text((40, y + 20), "TURN", font=self.f_small, fill=DIM, anchor="lm")
        cx = 330
        d.rounded_rectangle([140, y, 520, y + 40], 10, fill=(32, 36, 44))
        w = int(np.clip(turn / 6, -1, 1) * 180)
        if abs(w) > 2:
            d.rounded_rectangle([min(cx, cx + w), y, max(cx, cx + w), y + 40], 10, fill=GOLD)
        d.line([cx, y - 4, cx, y + 44], fill=INK, width=2)
        if act.get("attack"):
            self.bang = 8
        if self.bang > 0:
            a = self.bang / 8
            colr = tuple(int(BG[i] + (HOT[i] - BG[i]) * a) for i in range(3))
            d.rounded_rectangle([560, y - 6, 1040, y + 46], 18, fill=colr)
            d.text((800, y + 20), "PANIC → BANG", font=self.f_mid, fill=INK, anchor="mm")
            self.bang -= 1
        else:
            d.text((800, y + 20), "escape neurons → trigger", font=self.f_small, fill=DIM, anchor="mm")
        d.text((40, H - 50), f"kills {game.kills}   health {max(0, game.health)}   {t:4.1f}s", font=self.f_small,
               fill=INK, anchor="lm")
        d.text((W - 40, H - 50), "fruit fly connectome · nothing trained", font=self.f_small, fill=DIM, anchor="rm")
        return img

    def add(self, game, fly, act, t, dead=False):
        img = self.render(game, fly, act, t, dead)
        self.last = img
        if self.proc:
            self.proc.stdin.write(np.asarray(img).tobytes())

    def close(self):
        if self.proc:
            self.proc.stdin.close()
            self.proc.wait()
