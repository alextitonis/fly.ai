"""The whole job, hardware-agnostic: take off from the dock, patrol, report finds, come home before the battery runs out, land
on the pad, charge, go back out and carry on the route where it stopped.

    CHARGE -> TAKEOFF -> PATROL -> RETURN -> LAND -> CHARGE ...

Everything it touches is an interface (core.Hardware, Localizer, Route, Steerer, Detector, PadFinder), so the same class
runs the simulator (sim_backend.py, run_sim.py) and a real drone.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .core import Command, Hardware, Pose
from .detect import Detector
from .energy import EnergyPolicy
from .land import Lander, PadFinder
from .localize import Localizer
from .patrol import Route
from .report import Reporter
from .steer import Steerer


@dataclass
class MissionConfig:
    height: float = 6.5          # m: patrol height, above the canopy
    reach: float = 1.5           # m: a waypoint counts as reached
    approach: float = 1.5        # m from home by the estimate: hand over to the lander
    max_sigma: float = 4.0       # m: position this uncertain (GPS gone a while) -> go home. 8 let it drift out of the area (test 1, 11-05)
    fence: tuple | None = None   # (x0, y0, x1, y1) home frame: never leave. Waypoints are pulled inside by fence_k sigma + fence_pad
    fence_k: float = 3.0
    fence_pad: float = 1.0
    detect_above: float = 3.0    # m: detectors run only above this
    land_timeout: float = 40.0   # s: no touchdown by then -> climb and try again
    search_height: float = 12.0  # m: no pad in view -> climb straight up over where home should be: from 12 m the down camera covers ~6.7 m around.
                                 # Only then search sideways. Sideways first at 6 m took a no-GPS drone out of the fence (dev seed 9900)
    search_step: float = 4.0     # m between legs of the expanding square
    emergency: float = 0.03      # battery level: put down wherever it is, a hard landing beats falling


@dataclass
class MissionLog:
    state_time: dict = field(default_factory=dict)
    charges: int = 0
    returns: dict = field(default_factory=dict)     # why it went home: battery / lost / done
    landings_missed: int = 0
    events: list = field(default_factory=list)


class Mission:
    def __init__(self, hw: Hardware, loc: Localizer, route: Route, steer: Steerer, energy: EnergyPolicy, detectors: list[Detector],
                 pad: PadFinder, reporter: Reporter, cfg: MissionConfig | None = None, home: np.ndarray | None = None):
        self.hw, self.loc, self.route, self.steer, self.energy = hw, loc, route, steer, energy
        self.detectors, self.pad, self.reporter = detectors, pad, reporter
        self.cfg = cfg or MissionConfig()
        self.home = np.zeros(2) if home is None else np.asarray(home, float)
        self.lander = Lander()
        self.state = "CHARGE"
        self.since = hw.vehicle.t
        self.log = MissionLog()
        self.loc.reset(*self.home, 0.0)
        self.pose: Pose = self.loc.pose()
        self.searching_from: float | None = None
        self.passed_on: list[dict] = []                    # finds handed to the base on docking (or sent by radio when there is one)

    def _go(self, state: str, why: str | None = None) -> None:
        self.reporter.log("state", t=self.hw.vehicle.t, frm=self.state, to=state, why=why, x=self.pose.x, y=self.pose.y, battery=self.hw.battery.level())
        self.log.events.append((round(self.hw.vehicle.t, 1), self.state, state, why))
        self.state, self.since = state, self.hw.vehicle.t

    def _inside(self, goal: np.ndarray, sigma: float) -> np.ndarray:
        """The waypoint, moved inside the fence by how unsure the drone is of where it is."""
        if self.cfg.fence is None:
            return goal
        x0, y0, x1, y1 = self.cfg.fence
        m = self.cfg.fence_k * sigma + self.cfg.fence_pad
        lo, hi = np.array([x0 + m, y0 + m]), np.array([x1 - m, y1 - m])
        mid = (np.array([x0, y0]) + np.array([x1, y1])) / 2
        lo, hi = np.minimum(lo, mid), np.maximum(hi, mid)
        return np.clip(goal, lo, hi)

    def _home_offset(self) -> np.ndarray:
        """Home from the drone, in its own frame: (ahead, left)."""
        d = self.home - self.pose.xy
        c, s = np.cos(self.pose.heading), np.sin(self.pose.heading)
        return np.array([c * d[0] + s * d[1], -s * d[0] + c * d[1]])

    def tick(self) -> None:
        hw, v, cfg = self.hw, self.hw.vehicle, self.cfg
        dt = v.period
        m = hw.motion.read()
        if self.state != "CHARGE":
            self.loc.predict(m, dt)
            fix = hw.gps.read() if hw.gps is not None else None
            if fix is not None:
                self.loc.correct(fix)
        self.pose = self.loc.pose()
        p = self.pose
        self.log.state_time[self.state] = self.log.state_time.get(self.state, 0.0) + dt
        frame = None
        cam = hw.down_camera
        needs_frame = cam is not None and (any(getattr(d, "needs_frame", True) for d in self.detectors) or
                                           (self.state == "LAND" and getattr(self.pad, "needs_frame", True)))
        if needs_frame:
            frame = cam.frame()
        if self.state in ("PATROL", "RETURN") and p.z > cfg.detect_above:
            for d in self.detectors:
                for f in d.detect(frame, p, cam):
                    self.reporter.add(f)
        if hw.radio is not None:
            for rec in self.reporter.take_new():
                hw.radio.send({"type": "found", **rec})

        cmd = Command()
        if self.state == "CHARGE":
            if hw.battery.level() >= self.energy.resume_at:
                self.loc.reset(*self.home, p.heading)
                if hasattr(self.steer, "wake"):
                    self.steer.wake()
                v.take_off(1.0)
                self._go("TAKEOFF")
            else:
                v.tick(cmd)
                return
        elif self.state == "TAKEOFF":
            cmd = Command(0.0, self.steer.climb(p, cfg.height), 0.0)
            if p.z > cfg.height - 0.4:
                self._go("PATROL")
        elif self.state == "PATROL":
            self.route.advance(p.xy, cfg.reach)
            goal = self.route.goal()
            dist_home = float(np.hypot(*(p.xy - self.home)))
            why = ("done" if goal is None else "battery" if self.energy.must_return(hw.battery.level(), dist_home, p.z, p.sigma)
                   else "lost" if p.sigma > cfg.max_sigma else None)
            if why:
                self.log.returns[why] = self.log.returns.get(why, 0) + 1
                self._go("RETURN", why)
            else:
                goal = self._inside(goal, p.sigma)
                if float(np.hypot(*(goal - p.xy))) < cfg.reach:      # pulled in so far it's already there: count it reached
                    self.route.advance(self.route.goal(), cfg.reach)
                cmd = self.steer.command(p, goal, cfg.height)
        if self.state == "RETURN":
            cmd = self.steer.command(p, self.home, cfg.height)
            if float(np.hypot(*(p.xy - self.home))) < cfg.approach:
                self.searching_from = None
                self._go("LAND")
        if self.state in ("PATROL", "RETURN", "LAND") and hw.battery.level() <= cfg.emergency:
            self.log.returns["emergency"] = self.log.returns.get("emergency", 0) + 1
            self._go("EMERGENCY", "battery flat")
        if self.state == "EMERGENCY":
            cmd = Command(0.0, -0.4, 0.0)
            if p.z < 0.3:
                v.land_on_dock()
                self._go("DOWN", "emergency landing away from the dock")
        elif self.state == "DOWN":
            pass
        elif self.state == "LAND":
            offset = self.pad.find(frame, p, cam)
            if offset is None:
                # not in view: climb to search height and fly an expanding square around where home should be
                if p.z < cfg.search_height - 0.5 and self.searching_from is None:
                    cmd = Command(0.0, 1.0, 0.0)                     # straight up first
                else:
                    if self.searching_from is None:
                        self.searching_from = v.t
                    k = int((v.t - self.searching_from) // 8.0)
                    legs = np.array([[0, 0], [1, 0], [1, 1], [-1, 1], [-1, -1], [2, -1], [2, 2], [-2, 2], [-2, -2], [3, -2], [3, 3], [-3, 3], [-3, -3]], float)
                    goal = self._inside(self.home + cfg.search_step * legs[min(k, len(legs) - 1)], p.sigma)
                    cmd = self.steer.command(p, goal, cfg.search_height)
                touch = False
                if v.t - self.since > cfg.land_timeout * 3:
                    self.since = v.t
            else:
                self.searching_from = None
                cmd, touch = self.lander.command(offset, p, self._home_offset())
            if touch:
                v.land_on_dock()
                if hw.dock.docked():
                    self.log.charges += 1
                    self.passed_on += self.reporter.take_new()
                    self.loc.reset(*self.home, p.heading)
                    self._go("CHARGE", "docked")
                    return
                self.log.landings_missed += 1
                self.reporter.log("missed_pad", t=v.t, pad_error=getattr(v, "pad_error", None), parked=getattr(v, "parked", None))
                v.take_off(1.5)
                self._go("LAND", "missed pad")
                return
        v.tick(cmd)
