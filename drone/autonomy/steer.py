"""Turning toward the next waypoint. Two interchangeable steerers:

  PlainSteer   a proportional controller, ours. The baseline, and the fallback
  BrainSteer   the connectome turns: the waypoint's bearing goes onto LC10a (as forest.py and predict.py pass a goal), and the
               yaw comes from DNa02 left minus right through pilot.py's mapping. Speed and height stay ours: above the trees
               there is nothing to brake for, and the brain has no height sense here

Both take the same inputs, so a mission can swap one for the other and a test can compare them on the same seeds.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

import numpy as np

from .core import Command, Pose, wrap


class Steerer(ABC):
    def __init__(self, speed: float = 1.2, height_gain: float = 0.8):
        self.speed, self.height_gain = speed, height_gain

    def climb(self, pose: Pose, height: float) -> float:
        return float(np.clip(self.height_gain * (height - pose.z), -1.0, 1.0))

    def bearing(self, pose: Pose, goal: np.ndarray) -> tuple[float, float]:
        d = goal - pose.xy
        return wrap(float(np.arctan2(d[1], d[0])) - pose.heading), float(np.hypot(*d))

    @abstractmethod
    def command(self, pose: Pose, goal: np.ndarray, height: float) -> Command: ...


class PlainSteer(Steerer):
    def __init__(self, speed: float = 1.2, turn_gain: float = 1.5, **kw):
        super().__init__(speed, **kw)
        self.turn_gain = turn_gain

    def command(self, pose, goal, height):
        b, dist = self.bearing(pose, goal)
        forward = self.speed * max(0.0, np.cos(b)) * min(1.0, dist / 2.0 + 0.3)
        return Command(forward, self.climb(pose, height), float(np.clip(self.turn_gain * b, -2.0, 2.0)))


class BrainSteer(Steerer):
    """The fly brain turns. One brain step per call, so call it once per brain step (20 ms)."""

    target_size = 0.1      # rad: what LC10a is told of the goal's size, a constant so it never reads as looming (forest.py)

    def __init__(self, seed: int, speed: float = 1.2, rewire: bool = False, sensory_input: bool = False, turn_gain: float | None = None, **kw):
        super().__init__(speed, **kw)
        import sys
        from pathlib import Path
        here = Path(__file__).resolve().parents[1]
        sys.path[:0] = [str(here), str(here.parent)]
        from flybrain import FlyBrain
        import pilot as pilot_module
        from follow import TURN_GAIN, FollowPilot, FollowSenses
        from sim import Thing
        self.Thing = Thing
        pilot_module.TURN_GAIN = TURN_GAIN if turn_gain is None else turn_gain
        self.brain = FlyBrain(seed=seed, sensory_input=sensory_input)
        if rewire:
            from flytalk import rewire as scramble
            scramble(self.brain, seed=seed + 1000)
        self.senses, self.pilot = FollowSenses(self.brain), FollowPilot(self.brain)
        for _ in range(100):
            self.pilot.observe(self.brain.step())
        self.dt = self.brain.dt

    def command(self, pose, goal, height):
        b, dist = self.bearing(pose, goal)
        target = self.Thing("leader", b, dist, self.target_size)
        self.pilot.observe(self.brain.step(None, self.senses.inject([target])))
        yaw = self.pilot.command(pose.t, pose.z)["yaw_rate"]
        forward = self.speed * max(0.0, np.cos(b)) * min(1.0, dist / 2.0 + 0.3)
        return Command(forward, self.climb(pose, height), float(np.clip(yaw, -2.0, 2.0)))

    def wake(self) -> None:
        """Before take-off: the brain isn't stepped while the drone charges (it would cost CPU for nothing), so let it settle again."""
        for _ in range(50):
            self.pilot.observe(self.brain.step())
