"""Shared types and the hardware interfaces.

Everything in autonomy/ talks to the drone only through the abstract classes here. The simulator implements them in
sim_backend.py; a real drone implements the same classes (PX4/ArduPilot over MAVLink, a Crazyflie over cflib, ...) and the
mission, localizer, patrol, steering, detectors and reporter run unchanged.

Frames: a local east-north-up frame in metres with its origin at home (the dock). Heading is radians, counter-clockwise from
east (+x), the same as the simulator. Real GPS gives latitude/longitude: geo.py turns them into this frame.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

import numpy as np


def wrap(a: float) -> float:
    """An angle in radians, into -pi..pi."""
    return float((a + np.pi) % (2 * np.pi) - np.pi)


@dataclass
class Command:
    forward: float = 0.0     # m/s along the heading
    climb: float = 0.0       # m/s up
    yaw_rate: float = 0.0    # rad/s, + = left (counter-clockwise)

    def as_dict(self) -> dict:
        return {"forward": self.forward, "climb": self.climb, "yaw_rate": self.yaw_rate}


@dataclass
class Pose:
    x: float
    y: float
    z: float
    heading: float
    t: float
    sigma: float = 0.0       # m, 1-sigma horizontal uncertainty of the estimate

    @property
    def xy(self) -> np.ndarray:
        return np.array([self.x, self.y])


@dataclass
class GpsFix:
    x: float                 # m east of home
    y: float                 # m north of home
    z: float                 # m up
    accuracy: float          # m, the receiver's own 1-sigma horizontal estimate (hAcc / HDOP x UERE)
    t: float


@dataclass
class Motion:
    """What the drone's own sensors say about its motion: optical flow + IMU on real hardware."""
    v_forward: float         # m/s, body frame
    v_left: float            # m/s, body frame
    yaw_rate: float          # rad/s
    heading: float | None    # rad from a magnetometer, None if there isn't one
    z: float                 # m above ground: barometer, rangefinder or GPS
    t: float


@dataclass
class Detection:
    kind: str                # "fire", "smoke", "person", "animal", ...
    x: float                 # where it is, home frame, m
    y: float
    confidence: float        # 0..1
    t: float
    source: str              # which detector made it
    extra: dict = field(default_factory=dict)


# ---------------------------------------------------------------- hardware interfaces


class Vehicle(ABC):
    """Takes velocity commands and moves time on by one control period."""

    period: float = 0.02     # s per tick

    @property
    @abstractmethod
    def t(self) -> float: ...

    @abstractmethod
    def tick(self, cmd: Command) -> None:
        """Send `cmd` and return after one period (sim: steps physics; hardware: sends and waits)."""

    @abstractmethod
    def land_on_dock(self) -> None:
        """Motors off: the drone is sitting on the dock."""

    @abstractmethod
    def take_off(self, height: float) -> None:
        """Motors on, lift to `height` metres."""

    def crashed(self) -> bool:
        return False


class GpsSensor(ABC):
    @abstractmethod
    def read(self) -> GpsFix | None:
        """The newest fix, or None if there isn't a new one or there is no lock."""


class MotionSensor(ABC):
    @abstractmethod
    def read(self) -> Motion: ...


class Camera(ABC):
    """A camera fixed to the drone. pitch: radians below the horizon (pi/2 = straight down); hfov: radians across."""

    pitch: float = np.pi / 2
    hfov: float = np.radians(70)

    @abstractmethod
    def frame(self) -> np.ndarray | None:
        """An RGB uint8 picture, or None if there isn't one this tick."""


class Battery(ABC):
    @abstractmethod
    def level(self) -> float:
        """0..1 of usable charge."""

    @abstractmethod
    def charging(self) -> bool: ...


class Dock(ABC):
    """The charging pad at home."""

    @abstractmethod
    def docked(self) -> bool:
        """The drone is sitting on the contacts."""


class Radio(ABC):
    """Optional and deliberately separate: the patrol never needs it. A base station link, a chirp, a blinking light."""

    @abstractmethod
    def send(self, message: dict) -> None: ...


@dataclass
class Hardware:
    """One drone's parts, handed to the mission as a bundle."""
    vehicle: Vehicle
    motion: MotionSensor
    battery: Battery
    dock: Dock
    gps: GpsSensor | None = None
    down_camera: Camera | None = None
    radio: Radio | None = None
