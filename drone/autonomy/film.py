"""A demo film of the whole autonomous patrol: dock -> patrol above the forest -> finds -> home on battery -> land on the
dock -> charge -> out again.

    python -m autonomy.film --seed 9900                         # from drone/: runs/autonomy/film/patrol9900.mp4 + .json
    python -m autonomy.film --seed 9900 --preview               # 960 x 540, quick look

The flight is run_sim.run (plain steering, GPS on), the same code the tests score. Only looks are added, for this camera
(geom group forest.FILM_ONLY, which the drone's own cameras never draw): a drone shell bigger than the 9 cm Crazyflie so it
reads on screen, the people and animals the stand-in detector reads from the world's list, a light pillar on each confirmed
find, the dock's charge ring. Dull parts are sped up and the HUD says by how much. Detection is still
sim_backend.SimTruthDetector (a stand-in), which is why the film says "simulation".
"""
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

import mujoco
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from . import run_sim
from .sim_backend import HERE, _footprint

import forest  # noqa: E402  (on the path through sim_backend)

FPS = 30
G = forest.FILM_ONLY
N_BEACONS = 24
MINT = (72, 230, 170)
AMBER = (255, 186, 60)
RED = (255, 90, 80)
KIND = {"fire": ((255, 110, 40), "FIRE"), "person": ((255, 214, 64), "PERSON"), "animal": ((110, 205, 255), "ANIMAL")}
FONTS = Path("C:/Windows/Fonts")
BOX, CYL, CAP, SPH, ELL = (mujoco.mjtGeom.mjGEOM_BOX, mujoco.mjtGeom.mjGEOM_CYLINDER, mujoco.mjtGeom.mjGEOM_CAPSULE,
                           mujoco.mjtGeom.mjGEOM_SPHERE, mujoco.mjtGeom.mjGEOM_ELLIPSOID)


def _yaw(a: float) -> list[float]:
    return [float(np.cos(a / 2)), 0.0, 0.0, float(np.sin(a / 2))]


def _tilt(axis: int, a: float) -> list[float]:
    q = [float(np.cos(a / 2)), 0.0, 0.0, 0.0]
    q[1 + axis] = float(np.sin(a / 2))
    return q


def film_props(spec: mujoco.MjSpec, n_people: int, n_animals: int, home: np.ndarray, width: int = 1920, height: int = 1080) -> None:
    """Looks only, called by PatrolWorld._build when filming. No contacts, group FILM_ONLY."""
    spec.visual.global_.offwidth, spec.visual.global_.offheight = max(width, 1920), max(height, 1080)
    spec.add_material(name="film_glow", emission=1.0, specular=0.0)
    g = {"contype": 0, "conaffinity": 0, "group": G}
    cf = spec.body("cf2")                       # a ~0.5 m quad shell around the Crazyflie, so it shows at patrol distance
    for a in (45, 135, 225, 315):
        r = np.radians(a)
        c, s = np.cos(r), np.sin(r)
        cf.add_geom(type=BOX, size=[0.12, 0.013, 0.008], pos=[0.12 * c, 0.12 * s, 0.0], quat=_yaw(r), rgba=[0.16, 0.17, 0.18, 1], **g)
        cf.add_geom(type=CYL, size=[0.02, 0.016, 0], pos=[0.24 * c, 0.24 * s, 0.008], rgba=[0.08, 0.08, 0.09, 1], **g)
        cf.add_geom(type=CYL, size=[0.085, 0.002, 0], pos=[0.24 * c, 0.24 * s, 0.028], rgba=[0.85, 0.88, 0.9, 0.3], **g)
    cf.add_geom(type=BOX, size=[0.075, 0.05, 0.028], pos=[0, 0, 0.006], rgba=[0.93, 0.94, 0.95, 1], **g)
    cf.add_geom(type=BOX, size=[0.02, 0.03, 0.015], pos=[0.085, 0, -0.01], rgba=[0.05, 0.05, 0.06, 1], **g)       # camera pod
    cf.add_geom(name="film_led", type=SPH, size=[0.02, 0, 0], pos=[-0.07, 0, 0.04], rgba=[*np.array(MINT) / 255, 1], material="film_glow", **g)
    w = spec.worldbody
    for i in range(n_people):                   # a hiker in a bright jacket, arms up
        b = w.add_body(name=f"film_person{i}", mocap=True, pos=[0, 0, -50])
        jacket = [[1.0, 0.42, 0.08, 1], [0.9, 0.12, 0.15, 1]][i % 2]
        for side in (-1, 1):
            b.add_geom(type=CAP, size=[0.065, 0.36, 0], pos=[0, 0.09 * side, 0.43], rgba=[0.12, 0.14, 0.2, 1], **g)
            b.add_geom(type=CAP, size=[0.05, 0.25, 0], pos=[0, 0.3 * side, 1.62], quat=_tilt(0, -0.45 * side), rgba=jacket, **g)
        b.add_geom(type=CAP, size=[0.17, 0.22, 0], pos=[0, 0, 1.15], rgba=jacket, **g)
        b.add_geom(type=BOX, size=[0.1, 0.15, 0.2], pos=[-0.2, 0, 1.2], rgba=[0.2, 0.3, 0.22, 1], **g)
        b.add_geom(type=SPH, size=[0.11, 0, 0], pos=[0, 0, 1.64], rgba=[0.78, 0.62, 0.52, 1], **g)
    for i in range(n_animals):                  # a deer
        b = w.add_body(name=f"film_animal{i}", mocap=True, pos=[0, 0, -50])
        fur = [0.55, 0.36, 0.2, 1]
        b.add_geom(type=ELL, size=[0.5, 0.19, 0.22], pos=[0, 0, 0.88], rgba=fur, **g)
        b.add_geom(type=CAP, size=[0.07, 0.2, 0], pos=[0.45, 0, 1.12], quat=_tilt(1, 0.6), rgba=fur, **g)
        b.add_geom(type=ELL, size=[0.17, 0.08, 0.08], pos=[0.62, 0, 1.36], rgba=[0.5, 0.33, 0.18, 1], **g)
        b.add_geom(type=SPH, size=[0.06, 0, 0], pos=[-0.5, 0, 0.98], rgba=[0.92, 0.9, 0.85, 1], **g)
        for dx in (-0.32, 0.32):
            for dy in (-0.11, 0.11):
                b.add_geom(type=CAP, size=[0.04, 0.3, 0], pos=[dx, dy, 0.34], rgba=[0.42, 0.27, 0.15, 1], **g)
    for i in range(N_BEACONS):                  # a light pillar on each confirmed find, coloured by kind when it appears
        b = w.add_body(name=f"film_beacon{i}", mocap=True, pos=[0, 0, -100])
        b.add_geom(name=f"film_beacon_col{i}", type=CYL, size=[0.06, 3.5, 0], pos=[0, 0, 3.5], rgba=[1, 1, 1, 0.4], material="film_glow", **g)
        b.add_geom(name=f"film_beacon_ring{i}", type=CYL, size=[0.9, 0.02, 0], pos=[0, 0, 0.05], rgba=[1, 1, 1, 0.45], material="film_glow", **g)
    hx, hy = home
    w.add_geom(type=CYL, size=[0.8, 0.006, 0], pos=[hx, hy, 0.006], rgba=[0.16, 0.17, 0.19, 1], **g)              # the dock
    w.add_geom(name="film_dock_ring", type=CYL, size=[0.62, 0.003, 0], pos=[hx, hy, 0.014], rgba=[1, 1, 1, 1], material="film_glow", **g)


def _font(name: str, size: int) -> ImageFont.FreeTypeFont:
    for f in (name, "segoeui.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(str(FONTS / f), size)
        except OSError:
            continue
    return ImageFont.load_default()


class Director:
    """on_tick for run_sim.run: keeps the looks in step with the world and writes frames at a speed set by what's happening."""

    SPEED = {"TAKEOFF": 1.5, "PATROL": 6.0, "RETURN": 6.0, "LAND": 3.0, "CHARGE": 25.0, "EMERGENCY": 2.0, "DOWN": 2.0}

    def __init__(self, out: Path, width: int, height: int, msaa: int, after: float):
        self.W, self.H, self.msaa, self.after = width, height, msaa, after
        self.k = width / 1920
        out.parent.mkdir(parents=True, exist_ok=True)
        self.ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{width}x{height}", "-r", str(FPS),
                                    "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out)],
                                   stdin=subprocess.PIPE)
        f = lambda n, s: _font(n, int(s * self.k))   # noqa: E731
        self.f_big, self.f_mid, self.f_small, self.f_tiny = f("segoeuib.ttf", 46), f("seguisb.ttf", 28), f("segoeui.ttf", 24), f("segoeui.ttf", 19)
        self.r = None
        self.next = 0.0
        self.frames = 0
        self.state = None
        self.state_t = 0.0
        self.why = None
        self.cycle = 0
        self.end_at = None
        self.slow_until = -1.0
        self.seen = 0                     # confirmed finds handled so far
        self.beacons: list[tuple] = []    # (world xy, kind, frame it appeared)
        self.shown: set = set()           # target indices already on screen
        self.alerts: list[tuple] = []     # (frame, text, sub, colour)
        self.log: list[tuple] = []        # (mission time, kind, x, y) for the report list
        self.handed = 0
        self.trail: list[np.ndarray] = []
        self.cov = np.zeros((96, 96), bool)
        self.cam_at = None
        self.cam_dist, self.cam_el = 5.5, -68.0

    # ---- set-up once the world exists ----
    def _setup(self, world) -> None:
        m = world.model
        q = m.vis.quality
        was = int(q.offsamples)
        q.offsamples = self.msaa
        self.r = mujoco.Renderer(m, self.H, self.W)
        q.offsamples = was
        self.r.scene.flags[mujoco.mjtRndFlag.mjRND_SHADOW] = 0
        self.opt = mujoco.MjvOption()
        self.opt.geomgroup[G] = 1
        self.cam = mujoco.MjvCamera()
        self.cam.type = mujoco.mjtCamera.mjCAMERA_FREE
        mid = lambda n: m.body(n).mocapid[0]      # noqa: E731
        self.m_people = [mid(f"film_person{i}") for i in range(world.n_people)]
        self.m_animals = [mid(f"film_animal{i}") for i in range(world.n_animals)]
        self.m_beacon = [mid(f"film_beacon{i}") for i in range(N_BEACONS)]
        self.g_beacon = [(m.geom(f"film_beacon_col{i}").id, m.geom(f"film_beacon_ring{i}").id) for i in range(N_BEACONS)]
        self.g_led, self.g_ring = m.geom("film_led").id, m.geom("film_dock_ring").id
        self.half = forest.HALF
        self.trees = [(x, y) for x, y, _ in world.trees]
        self.map_bg = self._map_background()

    # ---- the per-tick hook ----
    def __call__(self, mission, hw, world, v, rep, route) -> bool:
        if self.r is None:
            self._setup(world)
        t = v.t
        if mission.state != self.state:
            if mission.state == "TAKEOFF":
                self.cycle += 1
                if self.cycle > 1:
                    self._alert("BACK ON PATROL", "charged, picking the sweep up where it left off", MINT)
            if mission.state == "RETURN":
                self.why = mission.log.events[-1][3] if mission.log.events else None
                if self.why == "battery":
                    self._alert("BATTERY LOW", "heading home with enough left to land", AMBER)
            if mission.state == "CHARGE" and self.state == "LAND":
                self.handed = len(mission.passed_on)
                self._alert("DOCKED", f"{self.handed} reports handed to base, charging", MINT)
            if mission.state == "PATROL" and self.cycle >= 2 and self.end_at is None:
                self.end_at = t + self.after
            self.state, self.state_t = mission.state, t
        for s in rep.scored[self.seen:]:                 # in the order finds were confirmed
            f = rep.finds[s["id"] - 1]
            col, name = KIND[f["kind"]]
            xy = world.home + (f["x"], f["y"])
            # the reporter sometimes logs one thing two or three times (a deer that walked on): on film a repeat of a target already
            # shown is an update, not a new find. Matching by distance merged two different people on seed 9900, so this uses the
            # run's scoring (the sim's truth): film only, the drone never sees it. False finds (no target) are always shown.
            if s["target"] is not None and s["target"] in self.shown:
                continue
            self.shown.add(s["target"])
            self.beacons.append((xy, f["kind"], self.frames))
            self.log.append((t, f["kind"], f["x"], f["y"]))
            self._alert(f"{name} SPOTTED", f"logged at {f['x']:.0f} m E, {f['y']:.0f} m N of the dock", col)
            self.slow_until = t + 2.5
        self.seen = len(rep.scored)
        speed = 2.0 if (t < self.slow_until and mission.state == "PATROL") else self.SPEED.get(mission.state, 4.0)
        while self.next <= t:
            self._frame(mission, hw, world, v, route, speed)
            self.next += speed / FPS
        return self.end_at is not None and t >= self.end_at

    def _alert(self, text: str, sub: str, colour: tuple) -> None:
        self.alerts.append((self.frames, text, sub, colour))

    # ---- one frame ----
    def _place_props(self, world, mission, v) -> None:
        d = world.data
        people = [t for t in world.targets if t["kind"] == "person"]
        animals = [t for t in world.targets if t["kind"] == "animal"]
        for mid, tg in zip(self.m_people, people):
            d.mocap_pos[mid] = [*tg["pos"], 0.0]
        for mid, tg in zip(self.m_animals, animals):
            d.mocap_pos[mid] = [*tg["pos"], 0.0]
            d.mocap_quat[mid] = _yaw(float(np.arctan2(tg["v"][1], tg["v"][0])))
        for i, (xy, kind, f0) in enumerate(self.beacons[:N_BEACONS]):
            d.mocap_pos[self.m_beacon[i]] = [xy[0], xy[1], 0.0]
            age = (self.frames - f0) / FPS
            grow = min(1.0, age / 0.4) * (0.45 + 0.55 * np.exp(-max(0.0, age - 3.0) / 2.0))   # bright when found, then calmer
            c = np.array(KIND[kind][0]) / 255
            col, ring = self.g_beacon[i]
            world.model.geom_rgba[col] = [*c, 0.42 * grow]
            world.model.geom_rgba[ring] = [*c, 0.6 * grow]
        pulse = 0.5 + 0.5 * np.sin(self.frames / 6)
        led = {"RETURN": AMBER, "LAND": AMBER, "EMERGENCY": RED, "DOWN": RED}.get(mission.state, MINT)
        world.model.geom_rgba[self.g_led] = [*(np.array(led) / 255), 1.0]
        ring = np.array(MINT) / 255 * (0.35 + 0.65 * pulse) if mission.state == "CHARGE" else np.array([0.85, 0.87, 0.9])
        world.model.geom_rgba[self.g_ring] = [*ring, 1.0]

    def _camera(self, world, mission) -> None:
        p = world.pos.copy()
        close = mission.state in ("TAKEOFF", "LAND", "CHARGE") or (mission.state == "RETURN" and np.hypot(*(p[:2] - world.home)) < 4)
        # close: steep and from above the crowns (at -24 deg it sat inside the trees round the dock)
        want_d, want_e = (5.5, -68.0) if close else (7.5, -40.0)
        if self.cam_at is None:
            self.cam_at = p
        self.cam_at = self.cam_at + 0.18 * (p - self.cam_at)
        self.cam_dist += 0.04 * (want_d - self.cam_dist)
        self.cam_el += 0.04 * (want_e - self.cam_el)
        self.cam.lookat[:] = self.cam_at
        self.cam.distance, self.cam.elevation = self.cam_dist, self.cam_el
        self.cam.azimuth = 35.0 + 3.0 * self.frames / FPS          # a slow orbit: following the heading swung round on every row
        self.r.update_scene(world.data, self.cam, scene_option=self.opt)

    def _frame(self, mission, hw, world, v, route, speed) -> None:
        self._place_props(world, mission, v)
        self._camera(world, mission)
        rgb = self.r.render()
        p = world.pos
        if not self.trail or np.hypot(*(p[:2] - self.trail[-1])) > 0.3:
            self.trail.append(p[:2].copy())
        if p[2] > 3:
            rad = _footprint(p, hw.down_camera)
            n = self.cov.shape[0]
            c = (np.arange(n) + 0.5) / n * 2 * (self.half + 1) - (self.half + 1)
            gx, gy = np.meshgrid(c, c, indexing="ij")
            self.cov |= np.hypot(gx - p[0], gy - p[1]) < rad
        im = Image.fromarray(rgb).convert("RGBA")
        hud = Image.new("RGBA", im.size, (0, 0, 0, 0))
        self._hud(ImageDraw.Draw(hud), hud, mission, hw, world, v, route, speed)
        im = Image.alpha_composite(im, hud).convert("RGB")
        self.ff.stdin.write(np.asarray(im).tobytes())
        self.frames += 1

    # ---- the HUD ----
    def _map_background(self) -> Image.Image:
        S = int(380 * self.k)
        im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(16 * self.k), fill=(12, 16, 14, 190))
        for x, y in self.trees:
            u, w_ = self._map(x, y, S)
            r = max(2, int(0.75 / (2 * (self.half + 1)) * S))
            d.ellipse([u - r, w_ - r, u + r, w_ + r], fill=(46, 92, 52, 255))
        a, b = self._map(-self.half, self.half, S), self._map(self.half, -self.half, S)
        d.rectangle([a[0], a[1], b[0], b[1]], outline=(255, 255, 255, 70), width=1)
        return im

    def _map(self, x: float, y: float, S: int) -> tuple[int, int]:
        span = 2 * (self.half + 1)
        return int((x + self.half + 1) / span * S), int((self.half + 1 - y) / span * S)

    def _hud(self, d: ImageDraw.ImageDraw, hud: Image.Image, mission, hw, world, v, route, speed) -> None:
        k, W, H = self.k, self.W, self.H
        pad = int(32 * k)
        state = mission.state
        level = hw.battery.level()
        title, sub = {
            "TAKEOFF": ("TAKING OFF", "leaving the dock"),
            "PATROL": ("PATROLLING", f"sweeping the forest from {world.pos[2]:.0f} m up  ·  {len(self.beacons)} found"),
            "RETURN": ("FLYING HOME", "battery low" if self.why == "battery" else "sweep finished"),
            "LAND": ("LANDING", "lining up on the dock's marker"),
            "CHARGE": ("CHARGING", f"on the dock  ·  {self.handed} reports handed to base"),
            "EMERGENCY": ("EMERGENCY LANDING", "battery flat"),
            "DOWN": ("DOWN", "landed away from the dock"),
        }.get(state, (state, ""))
        if state == "CHARGE" and self.cycle == 0:
            title, sub = "READY", "fully charged on the dock"
        # top left: what it's doing
        bw = int(620 * k)
        d.rounded_rectangle([pad, pad, pad + bw, pad + int(112 * k)], radius=int(16 * k), fill=(0, 0, 0, 165))
        d.text((pad + int(24 * k), pad + int(12 * k)), title, font=self.f_big, fill=(255, 255, 255, 255))
        d.text((pad + int(26 * k), pad + int(70 * k)), sub, font=self.f_small, fill=(205, 212, 208, 255))
        # top right: the map
        S = self.map_bg.size[0]
        mx, my = W - pad - S, pad
        hud.alpha_composite(self.map_bg, (mx, my))
        n = self.cov.shape[0]
        cov = np.zeros((n, n, 4), np.uint8)
        cov[self.cov.T[::-1]] = (MINT[0], MINT[1], MINT[2], 70)
        hud.alpha_composite(Image.fromarray(cov).resize((S, S), Image.NEAREST), (mx, my))
        if len(self.trail) > 1:
            pts = [tuple(np.add(self._map(x, y, S), (mx, my))) for x, y in self.trail[-900:]]
            d.line(pts, fill=(255, 255, 255, 150), width=max(1, int(2 * k)))
        hx, hy = np.add(self._map(*world.home, S), (mx, my))
        r = int(9 * k)
        d.rectangle([hx - r, hy - r, hx + r, hy + r], fill=(240, 240, 240, 255))
        d.rectangle([hx - r // 2, hy - r // 2, hx + r // 2, hy + r // 2], fill=(20, 20, 20, 255))
        d.text((hx + r + 4, hy - int(26 * k)), "DOCK", font=self.f_tiny, fill=(240, 240, 240, 230))
        for xy, kind, _ in self.beacons:
            u, w_ = np.add(self._map(*xy, S), (mx, my))
            r = int(8 * k)
            d.ellipse([u - r, w_ - r, u + r, w_ + r], fill=(*KIND[kind][0], 255), outline=(0, 0, 0, 255), width=max(1, int(2 * k)))
        u, w_ = np.add(self._map(*world.pos[:2], S), (mx, my))
        h = world.heading
        tri = [(u + 14 * k * np.cos(h), w_ - 14 * k * np.sin(h)), (u + 9 * k * np.cos(h + 2.5), w_ - 9 * k * np.sin(h + 2.5)), (u + 9 * k * np.cos(h - 2.5), w_ - 9 * k * np.sin(h - 2.5))]
        d.polygon(tri, fill=(*MINT, 255), outline=(0, 0, 0, 255))
        d.text((mx + int(14 * k), my + S + int(6 * k)), "what it has covered and found", font=self.f_tiny, fill=(225, 230, 228, 230))
        # bottom left: battery, clock, speed
        by = H - pad - int(118 * k)
        d.rounded_rectangle([pad, by, pad + int(470 * k), H - pad], radius=int(16 * k), fill=(0, 0, 0, 165))
        bx0, bx1, bt = pad + int(24 * k), pad + int(330 * k), by + int(22 * k)
        col = MINT if level > 0.3 else AMBER if level > 0.15 else RED
        d.rounded_rectangle([bx0, bt, bx1, bt + int(30 * k)], radius=int(6 * k), outline=(255, 255, 255, 200), width=max(1, int(2 * k)))
        fill = bx0 + int(3 * k) + int((bx1 - bx0 - 6 * k) * max(0.0, level))
        d.rounded_rectangle([bx0 + int(3 * k), bt + int(3 * k), max(bx0 + int(4 * k), fill), bt + int(27 * k)], radius=int(4 * k), fill=(*col, 255))
        d.text((bx1 + int(14 * k), bt - int(4 * k)), f"{level * 100:3.0f}%", font=self.f_mid, fill=(255, 255, 255, 255))
        mm, ss = divmod(int(v.t), 60)
        d.text((bx0, bt + int(44 * k)), f"mission time {mm:02d}:{ss:02d}", font=self.f_small, fill=(215, 220, 218, 255))
        d.text((bx0 + int(250 * k), bt + int(44 * k)), f"» {speed:g}x", font=self.f_small, fill=(*MINT, 255))
        # bottom right: the report log
        lines = self.log[-4:]
        lw = int(470 * k)
        lh = int(46 * k) + int(32 * k) * max(1, len(lines))
        lx, ly = W - pad - lw, H - pad - lh
        d.rounded_rectangle([lx, ly, W - pad, H - pad], radius=int(16 * k), fill=(0, 0, 0, 165))
        d.text((lx + int(22 * k), ly + int(10 * k)), "REPORTS", font=self.f_tiny, fill=(170, 178, 174, 255))
        if not lines:
            d.text((lx + int(22 * k), ly + int(40 * k)), "nothing yet", font=self.f_small, fill=(150, 156, 152, 255))
        for i, (t, kind, x, y) in enumerate(lines):
            mm, ss = divmod(int(t), 60)
            yy = ly + int(40 * k) + i * int(32 * k)
            d.ellipse([lx + int(22 * k), yy + int(8 * k), lx + int(36 * k), yy + int(22 * k)], fill=(*KIND[kind][0], 255))
            d.text((lx + int(48 * k), yy), f"{mm:02d}:{ss:02d}  {kind:<7s} {x:4.0f} m E  {y:4.0f} m N", font=self.f_small, fill=(235, 238, 236, 255))
        # footer
        d.text((pad, H - pad - int(150 * k)), "simulation  ·  no pilot  ·  no radio link  ·  GPS receive-only", font=self.f_tiny, fill=(235, 238, 236, 210))
        # the newest alert, for 2.5 s of film
        live = [a for a in self.alerts if self.frames - a[0] < 2.5 * FPS]
        if live:
            f0, text, sub, colour = live[-1]
            age = (self.frames - f0) / FPS
            alpha = min(1.0, age / 0.2, (2.5 - age) / 0.4)
            tw = d.textlength(text, font=self.f_big)
            sw = d.textlength(sub, font=self.f_small)
            bw = int(max(tw, sw) + 70 * k)
            x0, y0 = (W - bw) // 2, int(H * 0.16)
            d.rounded_rectangle([x0, y0, x0 + bw, y0 + int(112 * k)], radius=int(18 * k), fill=(0, 0, 0, int(185 * alpha)), outline=(*colour, int(255 * alpha)), width=max(2, int(3 * k)))
            d.text(((W - tw) // 2, y0 + int(10 * k)), text, font=self.f_big, fill=(*colour, int(255 * alpha)))
            d.text(((W - sw) // 2, y0 + int(70 * k)), sub, font=self.f_small, fill=(230, 233, 231, int(255 * alpha)))

    # ---- title cards ----
    def card(self, lines: list[tuple[str, str]], seconds: float, first_frame: np.ndarray | None = None) -> None:
        """Text on a dark background (or over a darkened still), fading in and out."""
        base = Image.new("RGB", (self.W, self.H), (8, 11, 10)) if first_frame is None else Image.fromarray(first_frame)
        if first_frame is not None:
            base = Image.blend(base, Image.new("RGB", base.size, (0, 0, 0)), 0.62)
        total = int(seconds * FPS)
        for i in range(total):
            a = min(1.0, i / (0.4 * FPS), (total - i) / (0.4 * FPS))
            im = base.copy()
            d = ImageDraw.Draw(im)
            y = int(self.H * 0.5 - 60 * self.k * len(lines) / 2)
            for text, size in lines:
                font = {"big": self.f_big, "mid": self.f_mid, "small": self.f_small}[size]
                tw = d.textlength(text, font=font)
                c = int(255 * a)
                d.text(((self.W - tw) // 2, y), text, font=font, fill=(c, c, c) if size != "mid" else (int(MINT[0] * a), int(MINT[1] * a), int(MINT[2] * a)))
                y += int({"big": 72, "mid": 52, "small": 44}[size] * self.k)
            self.ff.stdin.write(np.asarray(im).tobytes())

    def close(self) -> None:
        self.ff.stdin.close()
        self.ff.wait()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--seed", type=int, default=9900)
    ap.add_argument("--preview", action="store_true", help="960 x 540, no smoothing: a quick look")
    ap.add_argument("--after", type=float, default=25.0, help="s of the second patrol to film before the end card")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    run_args = argparse.Namespace(seed=a.seed, minutes=40.0, steer="plain", rewire=False, no_gps=False, gps_lost_at=None, wind=False, height=6.5,
                                  speed=1.2, size=28.0, flight_time=240.0, charge_time=120.0, fence=8.0, name=f"film{a.seed}", film=True)
    out = Path(a.out) if a.out else HERE / "runs" / "autonomy" / "film" / f"patrol{a.seed}{'_preview' if a.preview else ''}.mp4"
    W, H = (960, 540) if a.preview else (1920, 1080)
    d = Director(out, W, H, msaa=1 if a.preview else 8, after=a.after)
    d.card([("One drone. No pilot.", "big"), ("It patrols the forest, reports what it finds,", "small"), ("and flies home to charge itself.", "small")], 3.5)
    res = run_sim.run(run_args, on_tick=d)
    got = tot = 0
    for x in res["found"].values():
        g, t = map(int, x.split("/"))
        got, tot = got + g, tot + t
    pad_cm = None if res["pad_error_m"] is None else round(res["pad_error_m"] * 100)
    d.card([("Fully autonomous patrol", "mid"), (f"found {got} of {tot}: the fire, the people, the animals", "small"),
            (f"landed {pad_cm} cm from the dock's centre, charged, went back out" if pad_cm is not None else "charged and went back out", "small"),
            ("simulation", "small")], 4.0)
    d.close()
    res["film"] = str(out)
    res["film_frames"] = d.frames
    out.with_suffix(".json").write_text(json.dumps(res, indent=1))
    print(json.dumps({k: res[k] for k in ("seed", "sim_s", "wall_s", "failed", "charges", "found", "false_finds", "finds", "pad_error_m", "film_frames")}))


if __name__ == "__main__":
    main()
