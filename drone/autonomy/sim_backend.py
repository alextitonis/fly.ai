"""The simulator's implementations of core.py's interfaces: the worked example a real drone's classes copy.

The world is forest.py's 30 x 30 m birch forest (its --big layout), with the fire, and now people and animals placed by the
seed. Home (the dock) is forest.py's START corner, and the home frame has its origin there.

Noise models (what the real parts do, roughly):
  GPS       5 Hz, 1.5 m white noise + a slowly wandering bias (~1 m), worse under the canopy, can be switched off or
            lost at a set time (jamming, a valley). Receive-only: it never transmits
  motion    optical flow + IMU over a canopy: true body speed with 0.1 m/s white noise, an 8% scale error (flow is scaled by the
            range to whatever is below, and treetops are uneven) that wanders, a 0.1 m/s bias wandering over ~30 s, gyro with a
            small bias, magnetometer heading with 3 degrees of noise and a fixed 5 degree offset, barometer height +-0.1 m.
            Kinder than this (white noise only) and dead reckoning looked as good as GPS, which it isn't
  battery   linear drain over flight_time, 30% more while climbing; charges full in charge_time on the dock
Stand-ins, labelled, sim only (they read the world's own lists, never pictures):
  SimTruthDetector   finds what lies in the down camera's footprint, with misses, position noise and false alarms
  SimPadFinder       the pad's offset when it is in the footprint, with 5 cm noise
"""
from __future__ import annotations

import sys
from pathlib import Path

import mujoco
import numpy as np

HERE = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(HERE), str(HERE.parent)]
import forest  # noqa: E402

from .core import Battery, Camera, Command, Detection, Dock, GpsFix, GpsSensor, Hardware, Motion, MotionSensor, Pose, Vehicle, wrap  # noqa: E402
from .detect import Detector  # noqa: E402
from .land import PadFinder  # noqa: E402

CANOPY = 0.6        # m above a tree's top that its crown still reaches
CROWN = 1.0         # m: crown radius
TRUNK = 0.18        # m: trunk radius + the drone


class PatrolWorld(forest.ForestSim):
    """forest.py's big forest, without its trunk-only crash test (wrong above the trees), plus people and animals."""

    def __init__(self, seed: int, people: int = 2, animals: int = 4, wind: bool = False, fire: bool = True, film: bool = False):
        forest.big_world()
        self.n_people, self.n_animals = people, animals     # film.py's looks need the counts while the model is built
        super().__init__(seed, decoys=False, fire=fire, film=film)
        self.trees = [(x, y, float(h)) for (x, y), h in zip(self.plan["trees"], self.plan["heights"])]
        self.pillars = []                                   # DroneSim's own test is trunks at any height
        self.gusts = wind
        self.control.z_max = 12.5
        self.arena = forest.HALF + 12.0                     # room for an 8 m geofence buffer round the patrol (forest.py had 2.5)
        self.home = forest.START.copy()
        rng = np.random.default_rng(seed + 47000)
        lo, hi = -forest.HALF + 1.5, forest.HALF - 1.5
        self.targets = []
        if self.plan["fire"] is not None:
            self.targets.append({"kind": "fire", "pos": np.array(self.plan["fire"], float), "v": np.zeros(2)})
        for kind, n, speed in (("person", people, 0.0), ("animal", animals, 0.3)):
            for _ in range(n):
                while True:
                    p = rng.uniform(lo, hi, 2)
                    if np.hypot(*(p - self.home)) > 6:
                        break
                a = rng.uniform(-np.pi, np.pi)
                self.targets.append({"kind": kind, "pos": p, "v": speed * np.array([np.cos(a), np.sin(a)])})
        self.target_rng = rng

    def _build(self, n_fruit, leader, decoy, people):
        spec = forest.build(self.plan)
        cam_body = spec.body("cf2")
        cam_body.add_camera(name="eye_down", pos=[0, 0, -0.01], xyaxes=[0, -1, 0, 1, 0, 0], fovy=forest.EYE_FOVY * 0.75)
        w = spec.worldbody
        hx, hy = forest.START
        w.add_geom(name="pad", type=mujoco.mjtGeom.mjGEOM_BOX, size=[0.3, 0.3, 0.01], pos=[hx, hy, 0.01], rgba=[0.95, 0.95, 0.95, 1], contype=0, conaffinity=0)
        w.add_geom(name="pad_mark", type=mujoco.mjtGeom.mjGEOM_BOX, size=[0.12, 0.12, 0.012], pos=[hx, hy, 0.012], rgba=[0.05, 0.05, 0.05, 1], contype=0, conaffinity=0)
        if self.plan["film"]:                               # looks for film.py's camera only (group FILM_ONLY), nothing the drone measures
            from .film import film_props
            film_props(spec, self.n_people, self.n_animals, forest.START)
        return spec

    def move_targets(self, dt: float) -> None:
        for t in self.targets:
            if t["v"].any():
                if self.target_rng.random() < dt / 8:      # animals change direction every ~8 s
                    a = self.target_rng.uniform(-np.pi, np.pi)
                    t["v"] = np.hypot(*t["v"]) * np.array([np.cos(a), np.sin(a)])
                t["pos"] = np.clip(t["pos"] + t["v"] * dt, -forest.HALF + 1, forest.HALF - 1)

    def hit_tree(self) -> bool:
        x, y, z = self.pos
        for tx, ty, h in self.trees:
            d = np.hypot(x - tx, y - ty)
            if (d < TRUNK and z < h) or (d < CROWN and h - 0.8 < z < h + CANOPY):
                return True
        return False


class SimVehicle(Vehicle):
    def __init__(self, world: PatrolWorld, period: float = 0.02):
        self.w, self.period = world, period
        self.ticks = max(1, round(period / world.dt))
        self.parked = False
        self.clock = world.t
        self.pad_error = None
        self.crash_count = 0
        self.last_cmd = Command()
        self.place(world.home, 0.3, 0.0)
        self.land_on_dock()

    @property
    def t(self) -> float:
        return self.clock

    def place(self, xy: np.ndarray, z: float, heading: float) -> None:
        w = self.w
        mujoco.mj_resetDataKeyframe(w.model, w.data, w.model.key("hover").id)
        w.data.qpos[:3] = [xy[0], xy[1], z]
        w.data.qpos[3:7] = [np.cos(heading / 2), 0, 0, np.sin(heading / 2)]
        w.data.time = self.clock
        mujoco.mj_forward(w.model, w.data)
        w.control.reset(z)
        w.crashed = False

    def tick(self, cmd: Command) -> None:
        self.last_cmd = cmd
        if self.parked:
            self.clock += self.period
            self.w.move_targets(self.period)
            return
        for _ in range(self.ticks):
            self.w.step(**cmd.as_dict())
        self.w.move_targets(self.period)
        self.clock = self.w.t
        if self.w.crashed or self.w.hit_tree():
            self.crash_count += 1
            self.w.crashed = True

    def crashed(self) -> bool:
        return bool(self.w.crashed)

    def land_on_dock(self) -> None:
        p = self.w.pos
        if p[2] < 0.6:                                     # motors off this low: it drops onto whatever is below
            self.parked = True
            self.pad_error = float(np.hypot(*(p[:2] - self.w.home)))
            self.heading = self.w.heading

    def take_off(self, height: float) -> None:
        if self.parked:
            p = self.w.pos
            self.parked = False
            self.place(p[:2], 0.3, self.w.heading)
        self.w.control.reset(max(height, float(self.w.pos[2])))


class SimMotion(MotionSensor):
    def __init__(self, v: SimVehicle, seed: int, flow_noise: float = 0.1, scale: float = 0.08, bias: float = 0.1, tau: float = 30.0,
                 gyro_bias: float = 0.003, mag_noise: float = 3.0, mag_offset: float = 5.0):
        self.v = v
        self.rng = np.random.default_rng(seed + 48000)
        self.flow_noise, self.scale_sd, self.bias_sd, self.tau = flow_noise, scale, bias, tau
        self.scale = 1 + self.rng.normal(0, scale)
        self.vbias = self.rng.normal(0, bias, 2)
        self.gyro_bias = self.rng.normal(0, gyro_bias)
        self.mag_noise, self.mag_offset = np.radians(mag_noise), np.radians(mag_offset)

    def read(self) -> Motion:
        w = self.v.w
        h = w.heading
        if self.v.parked:
            return Motion(0.0, 0.0, 0.0, wrap(h + self.mag_offset), 0.0, self.v.t)
        vel = w.data.qvel[:2]
        c, s = np.cos(h), np.sin(h)
        fwd, left = c * vel[0] + s * vel[1], -s * vel[0] + c * vel[1]
        a = np.exp(-self.v.period / self.tau)                       # slow errors wander (Gauss-Markov)
        self.vbias = a * self.vbias + np.sqrt(1 - a * a) * self.rng.normal(0, self.bias_sd, 2)
        self.scale = 1 + a * (self.scale - 1) + np.sqrt(1 - a * a) * self.rng.normal(0, self.scale_sd)
        n = self.rng.normal(0, self.flow_noise, 2) + self.vbias
        yaw_rate = float(w.data.qvel[5]) + self.gyro_bias + self.rng.normal(0, 0.01)
        heading = wrap(h + self.mag_offset + self.rng.normal(0, self.mag_noise))
        z = float(w.pos[2] + self.rng.normal(0, 0.1))
        return Motion(float(fwd * self.scale + n[0]), float(left * self.scale + n[1]), yaw_rate, heading, z, self.v.t)


class SimGps(GpsSensor):
    def __init__(self, v: SimVehicle, seed: int, rate: float = 5.0, noise: float = 1.5, bias: float = 1.0, lost_at: float | None = None, canopy_factor: float = 3.0):
        self.v, self.rate, self.noise, self.bias_size = v, rate, noise, bias
        self.rng = np.random.default_rng(seed + 49000)
        self.bias = self.rng.normal(0, bias, 2)
        self.next = 0.0
        self.lost_at = lost_at
        self.canopy_factor = canopy_factor

    def read(self) -> GpsFix | None:
        t = self.v.t
        if t < self.next or (self.lost_at is not None and t >= self.lost_at):
            return None
        self.next = t + 1 / self.rate
        # bias wanders back toward zero over ~60 s (Gauss-Markov), as a receiver's slow error does
        a = np.exp(-(1 / self.rate) / 60.0)
        self.bias = a * self.bias + np.sqrt(1 - a * a) * self.rng.normal(0, self.bias_size, 2)
        p = self.v.w.pos
        under = p[2] < 5.0
        sd = self.noise * (self.canopy_factor if under else 1.0)
        xy = p[:2] - self.v.w.home + self.bias + self.rng.normal(0, sd, 2)
        return GpsFix(float(xy[0]), float(xy[1]), float(p[2] + self.rng.normal(0, 2 * sd)), float(np.hypot(sd, self.bias_size)), t)


class SimBattery(Battery):
    def __init__(self, v: SimVehicle, flight_time: float, charge_time: float, start: float = 1.0):
        self.v, self.flight_time, self.charge_time = v, flight_time, charge_time
        self.charge = start
        self.last = v.t

    def _update(self) -> None:
        dt, self.last = self.v.t - self.last, self.v.t
        if self.v.parked:
            self.charge = min(1.0, self.charge + dt / self.charge_time)
        else:
            self.charge -= dt / self.flight_time * (1 + 0.3 * max(0.0, self.v.last_cmd.climb))

    def level(self) -> float:
        self._update()
        return self.charge

    def charging(self) -> bool:
        return self.v.parked


class SimDock(Dock):
    def __init__(self, v: SimVehicle, contacts: float = 0.2):
        self.v, self.contacts = v, contacts

    def docked(self) -> bool:
        return self.v.parked and self.v.pad_error is not None and self.v.pad_error < self.contacts


class SimDownCamera(Camera):
    """The down camera's real picture (MuJoCo render). Only made when a detector asks for frames: rendering costs CPU."""

    def __init__(self, v: SimVehicle, width: int = 320, height: int = 240):
        self.v, self.width, self.height = v, width, height
        self.hfov = np.radians(forest.EYE_FOVY * 0.75 * width / height)

    def frame(self) -> np.ndarray | None:
        return self.v.w.eyes(self.width, self.height, names=("down",))["down"]


def _footprint(pose_true: np.ndarray, camera: Camera) -> float:
    return float(pose_true[2] * np.tan(camera.hfov / 2) * 0.75)    # radius of the circle inside the picture


class SimTruthDetector(Detector):
    """STAND-IN, sim only: reads the world's list of targets. A target inside the footprint is found with probability
    `hit` a second; its reported position = estimated pose + true offset + noise, so localisation error carries through."""
    needs_frame = False

    def __init__(self, world: PatrolWorld, v: SimVehicle, camera: Camera, seed: int, hit: float = 1.5, noise: float = 0.8, false_per_min: float = 0.3):
        self.w, self.v, self.cam = world, v, camera
        self.rng = np.random.default_rng(seed + 50000)
        self.hit, self.noise, self.false_rate = hit, noise, false_per_min / 60

    def detect(self, frame, pose: Pose, camera) -> list[Detection]:
        dt = self.v.period
        p = self.w.pos
        r = _footprint(p, self.cam)
        out = []
        for t in self.w.targets:
            off = t["pos"] - p[:2]
            if np.hypot(*off) < r and self.rng.random() < self.hit * dt:
                est = pose.xy + off + self.rng.normal(0, self.noise, 2)
                out.append(Detection(t["kind"], float(est[0]), float(est[1]), 0.9, pose.t, "sim-truth"))
        if self.rng.random() < self.false_rate * dt:
            a, d = self.rng.uniform(-np.pi, np.pi), self.rng.uniform(0, r)
            est = pose.xy + d * np.array([np.cos(a), np.sin(a)])
            out.append(Detection(self.rng.choice(["fire", "person", "animal"]), float(est[0]), float(est[1]), 0.5, pose.t, "sim-truth-false"))
        return out


class SimPadFinder(PadFinder):
    """STAND-IN, sim only: the pad's true offset when it's in the down camera's footprint and its marker is big enough in the
    picture to read (at least min_px across on a `pixels`-wide camera; a 0.6 m marker on 640 px reads to ~12.8 m up), 5 cm noise.
    ArucoPadFinder is the real one."""
    needs_frame = False

    def __init__(self, world: PatrolWorld, camera: Camera, seed: int, marker: float = 0.6, pixels: int = 640, min_px: float = 20.0):
        self.w, self.cam = world, camera
        self.rng = np.random.default_rng(seed + 51000)
        self.marker, self.pixels, self.min_px = marker, pixels, min_px

    def find(self, frame, pose, camera):
        p = self.w.pos
        off = self.w.home - p[:2]
        px = self.marker / (2 * max(p[2], 0.05) * np.tan(self.cam.hfov / 2)) * self.pixels
        if np.hypot(*off) > _footprint(p, self.cam) or px < self.min_px:
            return None
        h = self.w.heading
        c, s = np.cos(h), np.sin(h)
        return np.array([c * off[0] + s * off[1], -s * off[0] + c * off[1]]) + self.rng.normal(0, 0.05, 2)


def sim_hardware(seed: int, flight_time: float, charge_time: float, gps: bool = True, gps_lost_at: float | None = None,
                 camera_frames: bool = False, wind: bool = False, film: bool = False) -> tuple[Hardware, PatrolWorld, SimVehicle]:
    world = PatrolWorld(seed, wind=wind, film=film)
    v = SimVehicle(world)
    cam = SimDownCamera(v)
    hw = Hardware(vehicle=v, motion=SimMotion(v, seed), battery=SimBattery(v, flight_time, charge_time),
                  dock=SimDock(v), gps=SimGps(v, seed, lost_at=gps_lost_at) if gps else None, down_camera=cam)
    return hw, world, v
