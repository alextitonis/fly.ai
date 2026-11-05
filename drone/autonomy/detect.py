"""What is down there? Detectors turn a camera picture (plus where the drone is) into finds with a position on the ground.

All detectors here are ours, not the connectome's. Real ones:
  SmokeDetector   smoke.py's model (MobileNet V3 small + a trained readout), held-out test passed 11-02 on real aerial clips
  people/animals  not built yet: same pattern (small pretrained network + readout, or a stock detector), tested on held-out
                  aerial clips with whole shoots kept on one side, as smoke.py was
The simulator's stand-in (sim_backend.SimTruthDetector) reads the world's own list of things, so a flight shows the
behaviour around detection, never that detection works.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from collections import deque

import numpy as np

from .core import Camera, Detection, Pose


class Detector(ABC):
    kind: str = "thing"

    @abstractmethod
    def detect(self, frame: np.ndarray | None, pose: Pose, camera: Camera | None) -> list[Detection]: ...


def ground_point(pose: Pose, camera: Camera, u: float = 0.0, v: float = 0.0) -> np.ndarray:
    """Where a pixel's ray meets flat ground. u, v: -1..1 across and down the picture from its centre.
    Height is above ground, so over trees it's rough; good enough to send someone to look."""
    vfov = camera.hfov * 0.75
    down = camera.pitch + v * vfov / 2                       # radians below the horizon
    down = max(down, np.radians(5))
    ahead = pose.z / np.tan(down)                            # metres ahead along the camera's direction
    side = -u * np.hypot(ahead, pose.z) * np.tan(camera.hfov / 2)   # + u = right of picture = right of the drone
    c, s = np.cos(pose.heading), np.sin(pose.heading)
    return np.array([pose.x + c * ahead - s * side, pose.y + s * ahead + c * side])


class SmokeDetector(Detector):
    """smoke.py on the forward-tilted camera. A call needs the mean score over the last `looks` frames to reach the cutoff,
    as in smoke.py's tests. Where: the middle of the lower picture, projected to the ground."""
    kind = "fire"

    def __init__(self, looks: int = 6, cutoff: float | None = None, every: int = 25):
        import sys
        from pathlib import Path
        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
        import smoke
        self.eye = smoke.SmokeEye()
        self.cutoff = smoke.CUTOFF if cutoff is None else cutoff
        self.scores: deque = deque(maxlen=looks)
        self.every, self.n = every, 0                        # ticks between looks: the network takes ~30-60 ms a picture on a CPU

    def detect(self, frame, pose, camera):
        self.n += 1
        if frame is None or camera is None or self.n % self.every:
            return []
        self.scores.append(float(self.eye.score([frame])[0]))
        if len(self.scores) < self.scores.maxlen or np.mean(self.scores) < self.cutoff:
            return []
        p = ground_point(pose, camera, 0.0, 0.33)
        return [Detection("fire", float(p[0]), float(p[1]), float(np.mean(self.scores)), pose.t, "smoke.py")]
