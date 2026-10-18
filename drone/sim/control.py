"""Velocity-mode flight controller for the Crazyflie model: (forward, climb, yaw rate) -> thrust + body moments.

The same cascade a real quadcopter runs: velocity error -> wanted acceleration -> wanted tilt and thrust -> attitude
PD -> moments. It only keeps the drone flying; where it goes is the pilot's call (pilot.py: the fly brain).
"""
from __future__ import annotations

import numpy as np

G = 9.81
MAX_TILT = np.radians(25)
MAX_SPEED = 1.5      # m/s, horizontal
MAX_CLIMB = 1.0      # m/s
MAX_YAW = 3.0        # rad/s


def euler(q) -> tuple[float, float, float]:
    """(roll, pitch, yaw) of a (w, x, y, z) quaternion, ZYX order; pitch + = nose down."""
    w, x, y, z = q
    roll = np.arctan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y))
    pitch = np.arcsin(np.clip(2 * (w * y - z * x), -1, 1))
    yaw = np.arctan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))
    return float(roll), float(pitch), float(yaw)


class Controller:
    kv, kz, kzv = 2.5, 4.0, 3.0        # horizontal velocity, height, vertical velocity gains
    katt, krate, kyaw = 0.012, 0.0016, 0.0016   # N m per rad, per rad/s, per rad/s of yaw-rate error

    def __init__(self, model):
        self.mass = float(model.body("cf2").mass[0])
        self.gear = model.actuator_gear[:, :6].copy()      # thrust on z; moments on rx, ry, rz (signed)
        self.lo, self.hi = model.actuator_ctrlrange[:, 0].copy(), model.actuator_ctrlrange[:, 1].copy()
        self.reset(1.0)

    def reset(self, height: float) -> None:
        self.z_target = height

    def __call__(self, data, body: int, forward: float, climb: float, yaw_rate: float, dt: float) -> np.ndarray:
        forward = float(np.clip(forward, -MAX_SPEED, MAX_SPEED))
        climb = float(np.clip(climb, -MAX_CLIMB, MAX_CLIMB))
        yaw_rate = float(np.clip(yaw_rate, -MAX_YAW, MAX_YAW))
        pos, vel = data.xpos[body], data.cvel[body]   # cvel = (angular, linear) in world axes at the body's CoM
        q = data.xquat[body]
        roll, pitch, yaw = euler(q)
        v_world = data.qvel[:3]
        w_body = data.qvel[3:6]                        # free joint angular velocity is in body axes
        c, s = np.cos(yaw), np.sin(yaw)
        v_head = np.array([c * v_world[0] + s * v_world[1], -s * v_world[0] + c * v_world[1]])  # in the heading frame
        a_head = self.kv * (np.array([forward, 0.0]) - v_head)
        self.z_target = float(np.clip(self.z_target + climb * dt, 0.15, 2.4))
        az = self.kz * (self.z_target - pos[2]) + self.kzv * (climb - v_world[2])
        pitch_want = float(np.clip(np.arctan2(a_head[0], G), -MAX_TILT, MAX_TILT))
        roll_want = float(np.clip(-np.arctan2(a_head[1], G), -MAX_TILT, MAX_TILT))
        thrust = self.mass * (G + az) / max(np.cos(roll) * np.cos(pitch), 0.5)
        torque = np.array([self.katt * (roll_want - roll) - self.krate * w_body[0],
                           self.katt * (pitch_want - pitch) - self.krate * w_body[1],
                           self.kyaw * (yaw_rate - w_body[2])])
        ctrl = np.array([thrust / self.gear[0, 2], torque[0] / self.gear[1, 3], torque[1] / self.gear[2, 4],
                         torque[2] / self.gear[3, 5]])
        return np.clip(ctrl, self.lo, self.hi)
