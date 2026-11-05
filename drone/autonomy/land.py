"""The last metres onto the charging pad. GPS gets it within a few metres; the downward camera finds the pad's marker."""
from __future__ import annotations

from abc import ABC, abstractmethod

import numpy as np

from .core import Camera, Command, Pose, wrap


class PadFinder(ABC):
    @abstractmethod
    def find(self, frame: np.ndarray | None, pose: Pose, camera: Camera | None) -> np.ndarray | None:
        """Where the pad is from the drone, (ahead, left) in metres, or None if not in view."""


class ArucoPadFinder(PadFinder):
    """A printed ArUco marker on the pad, seen by a camera looking straight down. For real hardware; OpenCV only."""

    def __init__(self, marker_id: int = 0, dictionary: int | None = None):
        import cv2
        self.cv2 = cv2
        d = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50 if dictionary is None else dictionary)
        self.det = cv2.aruco.ArucoDetector(d, cv2.aruco.DetectorParameters())
        self.marker_id = marker_id

    def find(self, frame, pose, camera):
        if frame is None or camera is None:
            return None
        gray = self.cv2.cvtColor(frame, self.cv2.COLOR_RGB2GRAY)
        corners, ids, _ = self.det.detectMarkers(gray)
        if ids is None or self.marker_id not in ids.ravel():
            return None
        c = corners[list(ids.ravel()).index(self.marker_id)][0].mean(0)
        h, w = gray.shape
        u, v = (c[0] - w / 2) / (w / 2), (c[1] - h / 2) / (h / 2)   # -1..1, + = right, + = down the picture
        half = pose.z * np.tan(camera.hfov / 2)                   # metres from the picture's centre to its side edge
        return np.array([-v * half * 0.75, -u * half])           # top of the picture = ahead of the drone


class Lander:
    """Centre over the pad, then come down while staying centred. Ours."""

    def __init__(self, descend: float = 0.5, centred: float = 0.25, touch: float = 0.25, gain: float = 0.8):
        self.descend, self.centred, self.touch, self.gain = descend, centred, touch, gain

    def command(self, offset: np.ndarray | None, pose: Pose, fallback: np.ndarray) -> tuple[Command, bool]:
        """offset: the pad from the camera, or None; fallback: (ahead, left) to home from the position estimate.
        Returns the command and whether it's low and centred enough to touch down."""
        o = offset if offset is not None else fallback
        dist = float(np.hypot(*o))
        bearing = float(np.arctan2(o[1], o[0]))
        yaw = 0.0 if dist < 0.08 else float(np.clip(2.0 * wrap(bearing), -1.5, 1.5))
        forward = float(np.clip(self.gain * dist * max(0.0, np.cos(bearing)), 0.0, 1.0))
        rate = self.descend if pose.z > 1.2 else self.descend * 0.4          # slow for the last metre, or it drifts off the pad on the way down
        ok = dist < (self.centred if pose.z > 1.2 else self.centred / 2)
        climb = -rate if (offset is not None and ok) else 0.0                # off centre: hold height and close in
        return Command(forward, climb, yaw), offset is not None and dist < 0.08 and pose.z < self.touch
