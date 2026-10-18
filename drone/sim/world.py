"""The drone emulator: a Crazyflie 2 in a small arena with fruit and pillars, on MuJoCo.

    from sim import DroneSim
    sim = DroneSim(seed=1)
    sim.step(forward=0.5, climb=0.0, yaw_rate=0.3)    # one control tick (sim.dt seconds)
    frame = sim.render()                              # (H, W, 3) uint8 from the chase camera

The drone model is Bitcraze's Crazyflie 2 from MuJoCo Menagerie (crazyflie/, MIT). Commands are what a pilot gives a
real Crazyflie in velocity mode: forward speed along its heading, climb speed, and yaw rate; control.py turns them into
thrust and body moments. Fruit are mocap bodies: one eaten (the drone within EAT_RADIUS) respawns elsewhere.
With gusts on, wind comes every few seconds from a random direction for 1.5-3 s and pushes the drone (a real force on
its body); wind_from() says where it comes from, for whatever plays the drone's antennae.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import mujoco
import numpy as np

from .control import Controller

HERE = Path(__file__).resolve().parent
MODEL = HERE / "crazyflie" / "cf2.xml"

ARENA = 3.0          # half width of the square arena, m
CRUISE = 1.0         # height the drone holds when not told to climb, m
EAT_RADIUS = 0.25    # m from a fruit's centre to eat it
FRUIT_RADIUS = 0.08
PILLAR_RADIUS = 0.12
CONTROL_HZ = 100     # control ticks a second; the physics runs at the model's own timestep under it
GUST_MAX = 0.03      # N: the strongest gust (the drone weighs 0.26 N)


@dataclass
class Thing:
    """Something the drone can see: where it is relative to the drone."""
    kind: str        # "fruit" | "pillar"
    bearing: float   # rad, 0 = straight ahead, + = to the left (counter-clockwise)
    distance: float  # m, centre to centre
    size: float      # angular size, rad


def _arena(n_fruit: int, pillars: list[tuple[float, float]]) -> mujoco.MjSpec:
    spec = mujoco.MjSpec.from_file(str(MODEL))
    spec.option.timestep = 0.002
    spec.visual.global_.offwidth, spec.visual.global_.offheight = 1280, 720
    spec.add_texture(name="sky", type=mujoco.mjtTexture.mjTEXTURE_SKYBOX, builtin=mujoco.mjtBuiltin.mjBUILTIN_GRADIENT,
                     rgb1=[0.55, 0.75, 0.9], rgb2=[0.1, 0.15, 0.2], width=512, height=3072)
    spec.add_texture(name="grid", type=mujoco.mjtTexture.mjTEXTURE_2D, builtin=mujoco.mjtBuiltin.mjBUILTIN_CHECKER,
                     rgb1=[0.16, 0.2, 0.18], rgb2=[0.12, 0.15, 0.13], mark=mujoco.mjtMark.mjMARK_EDGE,
                     markrgb=[0.35, 0.95, 0.75], width=300, height=300)
    spec.add_material(name="floor", textures=["", "grid"], texrepeat=[6, 6], texuniform=True, reflectance=0.15)
    w = spec.worldbody
    w.add_light(pos=[0, 0, 4], dir=[0, 0, -1], type=mujoco.mjtLightType.mjLIGHT_DIRECTIONAL, diffuse=[0.7, 0.7, 0.7])
    w.add_geom(name="floor", type=mujoco.mjtGeom.mjGEOM_PLANE, size=[ARENA + 1, ARENA + 1, 0.05], material="floor")
    for i, (x, y) in enumerate(pillars):
        w.add_geom(name=f"pillar{i}", type=mujoco.mjtGeom.mjGEOM_CYLINDER, size=[PILLAR_RADIUS, 1.2, 0],
                   pos=[x, y, 1.2], rgba=[0.85, 0.85, 0.82, 1])
    for i in range(n_fruit):
        b = w.add_body(name=f"fruit{i}", mocap=True, pos=[0, 0, -5])
        b.add_geom(type=mujoco.mjtGeom.mjGEOM_SPHERE, size=[FRUIT_RADIUS, 0, 0], rgba=[1.0, 0.45, 0.1, 1],
                   contype=0, conaffinity=0)
    w.add_camera(name="overview", pos=[0, -ARENA * 2.2, ARENA * 1.6], xyaxes=[1, 0, 0, 0, 0.6, 0.8])
    return spec


class DroneSim:
    def __init__(self, seed: int = 0, n_fruit: int = 3, pillars: list[tuple[float, float]] | None = None,
                 gusts: bool = True):
        self.rng = np.random.default_rng(seed)
        self.gusts = gusts
        self.pillars = pillars if pillars is not None else [(1.2, 0.8), (-1.0, -1.3), (-1.4, 1.4), (1.5, -1.6)]
        self.model = _arena(n_fruit, self.pillars).compile()
        self.data = mujoco.MjData(self.model)
        self.body = self.model.body("cf2").id
        self.fruit = [self.model.body(f"fruit{i}").mocapid[0] for i in range(n_fruit)]
        self.control = Controller(self.model)
        self.substeps = max(1, round(1 / CONTROL_HZ / self.model.opt.timestep))
        self.dt = self.substeps * self.model.opt.timestep
        self.renderer: mujoco.Renderer | None = None
        self.reset()

    def reset(self) -> None:
        mujoco.mj_resetDataKeyframe(self.model, self.data, self.model.key("hover").id)
        self.data.qpos[:3] = [0, 0, CRUISE]
        mujoco.mj_forward(self.model, self.data)
        self.control.reset(CRUISE)
        self.eaten = 0
        self.crashed = False
        self.wind = np.zeros(2)                      # N, world frame: the way the air pushes
        self.gust_end, self.next_gust = 0.0, self.t + self.rng.uniform(3, 6)
        for m in self.fruit:
            self._place(m)

    def _place(self, mocap: int) -> None:
        for _ in range(100):
            p = self.rng.uniform(-ARENA + 0.4, ARENA - 0.4, 2)
            if all(np.hypot(*(p - q)) > 0.5 for q in self.pillars) and np.hypot(*(p - self.pos[:2])) > 1.0:
                break
        self.data.mocap_pos[mocap] = [p[0], p[1], CRUISE + self.rng.uniform(-0.15, 0.15)]

    @property
    def t(self) -> float:
        return float(self.data.time)

    @property
    def pos(self) -> np.ndarray:
        return self.data.xpos[self.body].copy()

    @property
    def heading(self) -> float:
        w, x, y, z = self.data.xquat[self.body]
        return float(np.arctan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)))

    def step(self, forward: float = 0.0, climb: float = 0.0, yaw_rate: float = 0.0) -> dict:
        """One control tick. forward m/s along the heading, climb m/s (0 = hold the current target height), yaw_rate
        rad/s (+ = left). Returns what happened this tick: {"ate": n, "crashed": bool}."""
        if self.gusts:
            if not self.wind.any() and self.t >= self.next_gust:
                a = self.rng.uniform(-np.pi, np.pi)
                self.wind = self.rng.uniform(0.4, 1.0) * GUST_MAX * np.array([np.cos(a), np.sin(a)])
                self.gust_end = self.t + self.rng.uniform(1.5, 3.0)
            elif self.wind.any() and self.t >= self.gust_end:
                self.wind[:] = 0
                self.next_gust = self.t + self.rng.uniform(4, 8)
        self.data.xfrc_applied[self.body, :2] = self.wind
        for _ in range(self.substeps):
            self.data.ctrl[:] = self.control(self.data, self.body, forward, climb, yaw_rate, self.model.opt.timestep)
            mujoco.mj_step(self.model, self.data)
        ate = 0
        p = self.pos
        for m in self.fruit:
            if np.linalg.norm(self.data.mocap_pos[m] - p) < EAT_RADIUS:
                self._place(m)
                ate += 1
        self.eaten += ate
        hit_pillar = any(np.hypot(p[0] - x, p[1] - y) < PILLAR_RADIUS + 0.06 for x, y in self.pillars)
        if hit_pillar or p[2] < 0.05 or np.max(np.abs(p[:2])) > ARENA + 0.5:
            self.crashed = True
        return {"ate": ate, "crashed": self.crashed}

    def wind_from(self) -> tuple[float, float] | None:
        """(bearing the wind comes from, rad, + = left; strength 0..1), or None in still air."""
        if not self.wind.any():
            return None
        src = np.arctan2(-self.wind[1], -self.wind[0])
        return float((src - self.heading + np.pi) % (2 * np.pi) - np.pi), float(np.hypot(*self.wind) / GUST_MAX)

    def things(self, fov: float = np.radians(160)) -> list[Thing]:
        """Fruit and pillars within `fov` of the heading (a fly sees almost all the way round; 160 deg each side)."""
        p, h = self.pos, self.heading
        out = []
        objs = [("fruit", self.data.mocap_pos[m][:2], FRUIT_RADIUS) for m in self.fruit]
        objs += [("pillar", np.array(q), PILLAR_RADIUS) for q in self.pillars]
        for kind, q, r in objs:
            d = q - p[:2]
            dist = float(np.hypot(*d))
            bearing = float((np.arctan2(d[1], d[0]) - h + np.pi) % (2 * np.pi) - np.pi)
            if abs(bearing) <= fov:
                out.append(Thing(kind, bearing, dist, 2 * float(np.arctan2(r, max(dist, 1e-3)))))
        return out

    def render(self, camera: str = "chase", width: int = 1280, height: int = 720) -> np.ndarray:
        if self.renderer is None:
            self.renderer = mujoco.Renderer(self.model, height, width)
            self.cam = mujoco.MjvCamera()
        if camera == "chase":                       # behind and above the drone, turning with it
            self.cam.type = mujoco.mjtCamera.mjCAMERA_FREE
            self.cam.lookat[:] = self.pos
            self.cam.distance, self.cam.elevation = 0.75, -32
            want = np.degrees(self.heading)               # look along the heading, eased so turns read smoothly
            az = getattr(self, "cam_az", want)
            self.cam_az = az + 0.15 * (((want - az) + 180) % 360 - 180)
            self.cam.azimuth = self.cam_az
            self.renderer.update_scene(self.data, self.cam)
        else:
            self.renderer.update_scene(self.data, camera)
        return self.renderer.render()

    def close(self) -> None:
        if self.renderer is not None:
            self.renderer.close()
            self.renderer = None
