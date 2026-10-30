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
G = 9.81
LEADER_RADIUS = 0.08 # m: how big the leader looks (the drone plus its beacon)
LEADER_RANGE = 3.5   # m: farther than this it is too small to pick out


@dataclass
class Thing:
    """Something the drone can see: where it is relative to the drone."""
    kind: str        # "fruit" | "pillar"
    bearing: float   # rad, 0 = straight ahead, + = to the left (counter-clockwise)
    distance: float  # m, centre to centre
    size: float      # angular size, rad


class Leader:
    """A second drone to follow: a scripted flight between random waypoints, never near a pillar. It only moves on rails
    (a mocap body tilted the way a real one leans into a turn): it is the follower we are testing, not this one."""
    SPEED, TURN = 0.45, 1.2      # m/s, rad/s

    def __init__(self, rng, pillars: list[tuple[float, float]]):
        self.rng, self.pillars = rng, pillars
        self.pos = np.array([0.8, 0.0, CRUISE])
        self.heading = 0.0
        self.tilt = np.zeros(2)
        self._waypoint()

    def _waypoint(self) -> None:
        for _ in range(100):
            p = self.rng.uniform(-ARENA + 0.6, ARENA - 0.6, 2)
            if self._clear(self.pos[:2], p) and np.hypot(*(p - self.pos[:2])) > 1.0:
                break
        self.goal = p

    def _clear(self, a: np.ndarray, b: np.ndarray) -> bool:
        return all(_segment_gap(a, b, np.array(q)) > 0.45 for q in self.pillars)

    def step(self, dt: float) -> None:
        d = self.goal - self.pos[:2]
        if np.hypot(*d) < 0.25 or not self._clear(self.pos[:2], self.goal):
            self._waypoint()
            d = self.goal - self.pos[:2]
        err = (np.arctan2(d[1], d[0]) - self.heading + np.pi) % (2 * np.pi) - np.pi
        turn = float(np.clip(err * 2.0, -self.TURN, self.TURN))
        self.heading += turn * dt
        speed = self.SPEED * max(0.35, np.cos(err))             # slows into sharp turns, like anything that flies
        self.pos[:2] += speed * np.array([np.cos(self.heading), np.sin(self.heading)]) * dt
        self.tilt += 0.05 * (np.array([turn * speed / G, 0.12]) - self.tilt)

    def quat(self) -> np.ndarray:
        q = np.zeros(4)
        mujoco.mju_euler2Quat(q, [self.tilt[0], self.tilt[1], self.heading], "XYZ")
        return q


def _segment_gap(a: np.ndarray, b: np.ndarray, q: np.ndarray) -> float:
    """Distance from point q to the segment a-b."""
    d = b - a
    t = float(np.clip(np.dot(q - a, d) / max(np.dot(d, d), 1e-9), 0, 1))
    return float(np.hypot(*(a + t * d - q)))


# the beacons shine with their own colour (emission), whatever the light: LEDs, not paint
BEACONS = {"leader": [0.2, 1.0, 0.6, 1], "decoy": [1.0, 0.2, 0.85, 1]}
EYE_FOVY = 73.74     # degrees: with a 4:3 picture, 90 degrees across, so four of them see all the way round


SHIRTS = {"leader": [0.15, 0.7, 0.4, 1], "decoy": [0.75, 0.15, 0.6, 1]}


def _person(spec, w, name: str) -> None:
    """A walking figure, 1.75 m tall: capsules moved each tick (DroneSim._pose). Only the shirt has any colour."""
    skin, dark = [0.72, 0.62, 0.55, 1], [0.1, 0.1, 0.12, 1]
    shirt = SHIRTS[name]
    parts = {"torso": (mujoco.mjtGeom.mjGEOM_CAPSULE, [0.15, 0.26, 0], shirt), "head": (mujoco.mjtGeom.mjGEOM_SPHERE, [0.11, 0, 0], skin),
             "arm_l": (mujoco.mjtGeom.mjGEOM_CAPSULE, [0.045, 0.27, 0], shirt), "arm_r": (mujoco.mjtGeom.mjGEOM_CAPSULE, [0.045, 0.27, 0], shirt),
             "leg_l": (mujoco.mjtGeom.mjGEOM_CAPSULE, [0.065, 0.38, 0], dark), "leg_r": (mujoco.mjtGeom.mjGEOM_CAPSULE, [0.065, 0.38, 0], dark)}
    for part, (kind, size, rgba) in parts.items():
        b = w.add_body(name=f"{name}_{part}", mocap=True, pos=[0, 0, -5])
        b.add_geom(type=kind, size=size, rgba=rgba, contype=0, conaffinity=0, group=0)


def _arena(n_fruit: int, pillars: list[tuple[float, float]], leader: bool = False, decoy: bool = False, people: bool = False) -> mujoco.MjSpec:
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
                   pos=[x, y, 1.2], rgba=[0.85, 0.85, 0.82, 0.3 if leader else 1])
    for i in range(n_fruit):
        b = w.add_body(name=f"fruit{i}", mocap=True, pos=[0, 0, -5])
        b.add_geom(type=mujoco.mjtGeom.mjGEOM_SPHERE, size=[FRUIT_RADIUS, 0, 0], rgba=[1.0, 0.45, 0.1, 1],
                   contype=0, conaffinity=0)
    if leader:
        cf2 = spec.body("cf2")
        meshes = [g for g in cf2.geoms if g.group == 2]
        for name in ["leader"] + (["decoy"] if decoy else []):   # the same drone meshes, with a beacon on top to see it by
            if people:
                _person(spec, w, name)
                continue
            mat = spec.add_material(name=f"beacon_{name}", rgba=BEACONS[name], emission=1.0)
            b = w.add_body(name=name, mocap=True, pos=[0, 0, -5])
            for g in meshes:
                b.add_geom(type=mujoco.mjtGeom.mjGEOM_MESH, meshname=g.meshname, material=g.material, group=0,
                           contype=0, conaffinity=0, pos=g.pos, quat=g.quat)
            b.add_geom(type=mujoco.mjtGeom.mjGEOM_SPHERE, size=[0.035, 0, 0], pos=[0, 0, 0.05], material=mat.name,
                       contype=0, conaffinity=0)
        cf2.add_geom(type=mujoco.mjtGeom.mjGEOM_SPHERE, size=[0.035, 0, 0], pos=[0, 0, 0.05], mass=0,
                     rgba=[1.0, 0.55, 0.15, 1], contype=0, conaffinity=0, group=2)
        for name, right in (("front", (0, -1, 0)), ("left", (1, 0, 0)), ("back", (0, 1, 0)), ("right", (-1, 0, 0))):
            cf2.add_camera(name=f"eye_{name}", pos=[0, 0, 0], xyaxes=[*right, 0, 0, 1], fovy=EYE_FOVY)
        for i, (x, y) in enumerate(pillars):         # what the eyes see; the viewer's camera hides these and sees through
            w.add_geom(name=f"pillar_solid{i}", type=mujoco.mjtGeom.mjGEOM_CYLINDER, size=[PILLAR_RADIUS, 1.2, 0],
                       pos=[x, y, 1.2], rgba=[0.85, 0.85, 0.82, 1], group=4, contype=0, conaffinity=0)
    w.add_camera(name="overview", pos=[0, -ARENA * 2.2, ARENA * 1.6], xyaxes=[1, 0, 0, 0, 0.6, 0.8])
    return spec


class DroneSim:
    def __init__(self, seed: int = 0, n_fruit: int = 3, pillars: list[tuple[float, float]] | None = None,
                 gusts: bool = True, leader: bool = False, decoy: bool = False, people: bool = False):
        self.rng = np.random.default_rng(seed)
        self.gusts = gusts
        self.pillars = pillars if pillars is not None else [(1.2, 0.8), (-1.0, -1.3), (-1.4, 1.4), (1.5, -1.6)]
        self.people = people
        self.model = _arena(n_fruit, self.pillars, leader, decoy, people).compile()
        self.data = mujoco.MjData(self.model)
        self.body = self.model.body("cf2").id
        self.fruit = [self.model.body(f"fruit{i}").mocapid[0] for i in range(n_fruit)]
        self.leader_mocap = self.model.body("leader").mocapid[0] if leader and not people else None
        self.leader = Leader(self.rng, self.pillars) if leader else None
        self.decoy_mocap = self.model.body("decoy").mocapid[0] if decoy and not people else None
        self.decoy = Leader(np.random.default_rng(seed + 5000), self.pillars) if decoy else None
        self.eye_view = mujoco.MjvOption()           # the drone's own eyes: not its own body, and solid pillars
        self.eye_view.geomgroup[2] = 0
        self.eye_view.geomgroup[4] = 1
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
        if self.leader is not None:
            self.leader.step(self.dt)
            if self.people:
                self._pose("leader", self.leader)
            else:
                self.data.mocap_pos[self.leader_mocap] = self.leader.pos
                self.data.mocap_quat[self.leader_mocap] = self.leader.quat()
        if self.decoy is not None:
            self.decoy.step(self.dt)
            if self.people:
                self._pose("decoy", self.decoy)
            else:
                self.data.mocap_pos[self.decoy_mocap] = self.decoy.pos
                self.data.mocap_quat[self.decoy_mocap] = self.decoy.quat()
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
        if self.leader is not None and self.sees_leader():
            objs.append(("leader", self.leader.pos[:2], LEADER_RADIUS))
        for kind, q, r in objs:
            d = q - p[:2]
            dist = float(np.hypot(*d))
            bearing = float((np.arctan2(d[1], d[0]) - h + np.pi) % (2 * np.pi) - np.pi)
            if abs(bearing) <= fov:
                out.append(Thing(kind, bearing, dist, 2 * float(np.arctan2(r, max(dist, 1e-3)))))
        return out

    def _pose(self, name: str, route: Leader) -> None:
        """A walking figure on this route: legs and arms swing with its steps."""
        route.stride = getattr(route, "stride", 0.0) + route.SPEED * self.dt * 6.0
        swing = 0.45 * np.sin(route.stride)
        x, y, h = route.pos[0], route.pos[1], route.heading
        fwd, side = np.array([np.cos(h), np.sin(h)]), np.array([-np.sin(h), np.cos(h)])

        def limb(part: str, top: float, across: float, angle: float, half: float) -> None:
            q = np.zeros(4)                            # a capsule along z, leaning by angle along the heading
            mujoco.mju_euler2Quat(q, [0, angle, h], "XYZ")
            at = np.array([x, y]) + across * side - half * np.sin(angle) * fwd
            m = self.model.body(f"{name}_{part}").mocapid[0]
            self.data.mocap_pos[m] = [at[0], at[1], top - half * np.cos(angle)]
            self.data.mocap_quat[m] = q

        limb("leg_l", 0.85, 0.09, swing, 0.42)
        limb("leg_r", 0.85, -0.09, -swing, 0.42)
        limb("arm_l", 1.38, 0.21, -swing * 0.8, 0.28)
        limb("arm_r", 1.38, -0.21, swing * 0.8, 0.28)
        limb("torso", 1.43, 0.0, 0.0, 0.3)
        limb("head", 1.64, 0.0, 0.0, 0.0)

    def eyes(self, width: int = 128, height: int = 96) -> dict[str, np.ndarray]:
        """What the four onboard cameras see right now, uint8 (height, width, 3) each: the only thing a camera pilot gets."""
        r = self.renderers_get(width, height)
        out = {}
        for name in ("front", "left", "back", "right"):
            r.update_scene(self.data, f"eye_{name}", scene_option=self.eye_view)
            out[name] = r.render().copy()
        return out

    def renderers_get(self, width: int, height: int) -> mujoco.Renderer:
        self.renderers = getattr(self, "renderers", {})
        if (width, height) not in self.renderers:
            self.renderers[(width, height)] = mujoco.Renderer(self.model, height, width)
        return self.renderers[(width, height)]

    def sees_leader(self) -> bool:
        """In range, and no pillar in the way."""
        a, b = self.pos[:2], self.leader.pos[:2]
        return np.hypot(*(b - a)) <= LEADER_RANGE and all(_segment_gap(a, b, np.array(q)) > PILLAR_RADIUS for q in self.pillars)

    def render(self, camera: str = "chase", width: int = 1280, height: int = 720) -> np.ndarray:
        self.renderers = getattr(self, "renderers", {})
        self.renderer = self.renderers.get((width, height))
        if self.renderer is None:                   # one per size: a renderer draws at the size it was made with
            self.renderer = self.renderers[(width, height)] = mujoco.Renderer(self.model, height, width)
        if not hasattr(self, "cam"):
            self.cam = mujoco.MjvCamera()
        if camera == "chase":                       # behind and above the drone, turning with it
            self.cam.type = mujoco.mjtCamera.mjCAMERA_FREE
            self.cam.lookat[:] = self.pos
            self.cam.distance, self.cam.elevation = 0.75, -32
            want = np.degrees(self.heading)               # look along the heading, eased so turns read smoothly
            az = getattr(self, "cam_az", want)
            self.cam_az = az + 0.15 * (((want - az) + 180) % 360 - 180)
            self.cam.azimuth = self.cam_az
            if self.leader is not None:                   # two drones: a steady high view framing both, north up
                gap = float(np.hypot(*(self.leader.pos[:2] - self.pos[:2])))
                self.cam_lookat = getattr(self, "cam_lookat", self.pos.copy())
                self.cam_lookat += 0.04 * ((self.pos + self.leader.pos) / 2 - self.cam_lookat)
                self.cam_dist = getattr(self, "cam_dist", 2.0)
                self.cam_dist += 0.02 * (max(1.6, 1.3 * gap + 1.0) - self.cam_dist)
                self.cam.lookat[:] = self.cam_lookat
                self.cam.distance, self.cam.elevation, self.cam.azimuth = self.cam_dist, -52, 90
            self.renderer.update_scene(self.data, self.cam)
        else:
            self.renderer.update_scene(self.data, camera)
        return self.renderer.render()

    def close(self) -> None:
        for r in getattr(self, "renderers", {}).values():
            r.close()
        self.renderers, self.renderer = {}, None
