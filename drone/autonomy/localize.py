"""Where am I? GPS when there is a fix, the drone's own motion sensing between fixes and when GPS is gone.

A small Kalman filter on horizontal position: the motion sensor (optical flow + IMU) predicts, GPS corrects. Heading comes
from the magnetometer if there is one, else from integrating the yaw rate. With no GPS at all it is dead reckoning and
the uncertainty (Pose.sigma) grows, which the mission uses to decide when to head home.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

import numpy as np

from .core import GpsFix, Motion, Pose, wrap


class Localizer(ABC):
    @abstractmethod
    def predict(self, m: Motion, dt: float) -> None: ...

    @abstractmethod
    def correct(self, fix: GpsFix) -> None: ...

    @abstractmethod
    def pose(self) -> Pose: ...

    def reset(self, x: float = 0.0, y: float = 0.0, heading: float = 0.0) -> None:
        """Known position: sitting on the dock."""


class FusedLocalizer(Localizer):
    drift = 0.5              # m per sqrt(s): how fast own-motion uncertainty grows. 0.3 was overconfident: true error 7.5 m at sigma ~4 (dev 9900, 11-05)
    gate = 5.0               # a fix more than this many sigma off the estimate is dropped (multipath, spoofing)
    heading_blend = 0.02     # how much of the magnetometer each tick, against the integrated gyro

    def __init__(self, x: float = 0.0, y: float = 0.0, heading: float = 0.0):
        self.reset(x, y, heading)
        self.fixes = self.rejected = 0

    def reset(self, x: float = 0.0, y: float = 0.0, heading: float = 0.0) -> None:
        self.p = np.array([x, y], float)
        self.P = np.eye(2) * 0.05 ** 2
        self.h = float(heading)
        self.z = 0.0
        self.t = 0.0

    def predict(self, m: Motion, dt: float) -> None:
        self.h = wrap(self.h + m.yaw_rate * dt)
        if m.heading is not None:
            self.h = wrap(self.h + self.heading_blend * wrap(m.heading - self.h))
        c, s = np.cos(self.h), np.sin(self.h)
        v = np.array([c * m.v_forward - s * m.v_left, s * m.v_forward + c * m.v_left])
        self.p = self.p + v * dt
        self.P = self.P + np.eye(2) * (self.drift ** 2 * dt) * (0.2 + min(1.0, float(np.linalg.norm(v))))   # grows with distance flown
        self.z, self.t = m.z, m.t

    def correct(self, fix: GpsFix) -> None:
        R = np.eye(2) * fix.accuracy ** 2
        r = np.array([fix.x, fix.y]) - self.p
        S = self.P + R
        if float(r @ np.linalg.solve(S, r)) > self.gate ** 2 and np.trace(self.P) < np.trace(R) * 4:
            self.rejected += 1
            return
        K = self.P @ np.linalg.inv(S)
        self.p = self.p + K @ r
        self.P = (np.eye(2) - K) @ self.P
        self.fixes += 1

    def pose(self) -> Pose:
        return Pose(float(self.p[0]), float(self.p[1]), self.z, self.h, self.t, float(np.sqrt(np.trace(self.P) / 2)))
