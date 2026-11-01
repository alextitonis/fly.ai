"""A forest with a fire in it, and a drone on patrol with no outside connection: cameras and its own dead reckoning only.

    python drone/forest.py fly --seed 9301                    # one patrol, JSON on the last line
    python drone/forest.py fly --seed 9301 --out clip.mp4     # the same flight on video
    python drone/forest.py picture --seed 9301                # a still from the chase camera and the drone's camera, no brain
    python drone/forest.py score --folder test --first-seed 9311

The world: 16 x 16 m of birch trees, pale trunks so eyes.py's obstacle step works unchanged, with a fire that flickers and throws dark smoke, somewhere at least 8 m
from the start. Each seed places everything.

What's ours and what's the connectome's:
  ours    the patrol route, walked by dead reckoning from the drone's own commands (no GPS, so it drifts), and passed to LC10a as a bearing, the way predict.py passes a guess
  ours    finding the fire: for now flame-coloured pixels in the camera, a stand-in. Colour alone can't tell fire from autumn leaves (fire.py), so --decoys stays off until the
          real step is built, and until then this flight says nothing about telling fire from not-fire
  ours    stopping at STANDOFF metres, and what counts as a sighting
  brain   every turn, through LC10a -> DNa02; the turns away from trees through avoid.py's DNg01, DNa07, DNae004 (which of those means "away" is our reading, from avoid.py's screen);
          braking through MDN; jumps through DNp01

Constants picked on seeds 9301-9304. Rules fixed before running, seeds 9311-9318, sensory_input=False, 240 s at most each, NUMBA_NUM_THREADS=2:
    FINDS     stops at the fire, truly within 4.5 m of it, on at least 6 of the 8 seeds
    WIRING    at least 4 more seeds found than on scrambled wiring
    CRASHES   at most 0.5 crashes a minute, over all 8
Limits: a pass is a patrol in a made-up forest with a colour stand-in. Trunks here are pale and all one width, which real trees aren't.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

import mujoco
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE), str(HERE.parent)]
from avoid import AVOID_GAIN, AVOID_TYPES, TurnAway  # noqa: E402
from eyes import ALL_CAMERAS, PixelEyes, use_cameras, _wrap  # noqa: E402
from events import Events  # noqa: E402
from flybrain import FlyBrain  # noqa: E402
from flytalk import rewire  # noqa: E402
from follow import TURN_GAIN, FollowPilot, FollowSenses  # noqa: E402
import pilot as pilot_module  # noqa: E402
from predict import Tracker  # noqa: E402
from sim import CRUISE, DroneSim, Thing  # noqa: E402
from sim.world import EYE_FOVY, MODEL, PILLAR_RADIUS  # noqa: E402

OUT = HERE / "runs" / "forest"
HALF = 8.0                # m: half width of the forest
START = np.array([-7.0, -7.0])
TREES, TREE_GAP = 45, 2.2
FIRE_R, FIRE_H = 0.5, 1.5
N_FLAMES, N_SMOKE = 26, 16
ROW_GAP = 4.5             # m between the patrol's rows
REACHED, LEG_S = 1.2, 45.0
STANDOFF = 3.0            # m: it stops this far from the fire, by the fire's apparent width
MEMORY_S = 8.0            # s: lost sight of the fire behind a trunk, it keeps going where it last was
TARGET_SIZE = 0.1         # rad: what LC10a is told of its goal's size: a constant, or growth reads as looming
MIN_HOT = 60              # pixels. At 6 and 20 it saw the fire from the start through the trees (seeds 9301-9303) and there was no patrol to speak of; at 100 it flew past one in plain view
FIRE_WIDTH = 1.45         # m: how wide the fire looks. Stopping at an estimated 3 m was truly 3.6-4.8 m on seeds 9302-9303 with the 1 m first assumed
TRUE_NEAR = 4.5
HOLD_S = 6.0              # s it hovers at the fire before the flight ends


def layout(seed: int, decoys: bool, fire: bool) -> dict:
    rng = np.random.default_rng(seed + 40000)
    spot = None
    while fire and spot is None:
        p = rng.uniform(-HALF + 1.5, HALF - 1.5, 2)
        if np.hypot(*(p - START)) >= 8.0:
            spot = p
    trees: list[tuple[float, float]] = []
    for _ in range(50000):
        if len(trees) == TREES:
            break
        p = rng.uniform(-HALF + 0.3, HALF - 0.3, 2)
        if np.hypot(*(p - START)) > 2.0 and (spot is None or np.hypot(*(p - spot)) > 1.6) and all(np.hypot(*(p - np.array(q))) > TREE_GAP for q in trees):
            trees.append((float(p[0]), float(p[1])))
    outer = []                                         # beyond the patrol, for looks: the forest shouldn't end at the edge of the picture
    while len(outer) < 90:
        p = rng.uniform(-HALF - 12, HALF + 12, 2)
        if np.max(np.abs(p)) > HALF + 3.5:
            outer.append((float(p[0]), float(p[1])))
    return {"trees": trees, "outer": outer, "fire": spot, "autumn": rng.random(len(trees)) < (0.25 if decoys else 0.0), "shade": rng.random((len(trees), 3)), "heights": rng.uniform(3.2, 4.4, len(trees))}


def build(plan: dict) -> mujoco.MjSpec:
    spec = mujoco.MjSpec.from_file(str(MODEL))
    spec.option.timestep = 0.002
    spec.visual.global_.offwidth, spec.visual.global_.offheight = 1280, 720
    spec.add_texture(name="sky", type=mujoco.mjtTexture.mjTEXTURE_SKYBOX, builtin=mujoco.mjtBuiltin.mjBUILTIN_GRADIENT, rgb1=[0.5, 0.72, 0.92], rgb2=[0.75, 0.85, 0.95], width=512, height=3072)
    spec.add_texture(name="moss", type=mujoco.mjtTexture.mjTEXTURE_2D, builtin=mujoco.mjtBuiltin.mjBUILTIN_CHECKER, rgb1=[0.13, 0.2, 0.09], rgb2=[0.1, 0.17, 0.08], width=300, height=300)
    spec.add_material(name="ground", textures=["", "moss"], texrepeat=[24, 24], texuniform=True)
    # birch bark keeps a little glow: in the leaves' shadow a plain trunk fell under eyes.py's brightness test close up, and the drone flew into it (seed 9303)
    spec.add_material(name="birch", rgba=[0.86, 0.85, 0.8, 1], emission=0.45)
    for name, rgba in (("flame_r", [1.0, 0.22, 0.04, 1]), ("flame_o", [1.0, 0.48, 0.05, 1]), ("flame_y", [1.0, 0.72, 0.12, 1])):
        spec.add_material(name=name, rgba=rgba, emission=1.0)
    w = spec.worldbody
    w.add_light(pos=[0, 0, 8], dir=[0.3, 0.2, -1], type=mujoco.mjtLightType.mjLIGHT_DIRECTIONAL, diffuse=[0.75, 0.75, 0.7])
    w.add_geom(name="floor", type=mujoco.mjtGeom.mjGEOM_PLANE, size=[HALF + 40, HALF + 40, 0.05], material="ground")
    none = {"contype": 0, "conaffinity": 0}
    for i, (x, y) in enumerate(plan["outer"]):
        w.add_geom(type=mujoco.mjtGeom.mjGEOM_CYLINDER, size=[PILLAR_RADIUS, 2.0, 0], pos=[x, y, 2.0], material="birch", **none)
        w.add_geom(type=mujoco.mjtGeom.mjGEOM_ELLIPSOID, size=[1.1, 1.1, 0.95], pos=[x, y, 4.0], rgba=[0.14, 0.38 + 0.002 * (i % 90), 0.12, 1], **none)
    for i, (x, y) in enumerate(plan["trees"]):
        h, s = float(plan["heights"][i]), plan["shade"][i]
        w.add_geom(name=f"trunk{i}", type=mujoco.mjtGeom.mjGEOM_CYLINDER, size=[PILLAR_RADIUS, h / 2, 0], pos=[x, y, h / 2], material="birch", **none)
        leaf = [0.72 + 0.2 * s[0], 0.2 + 0.25 * s[1], 0.06, 1] if plan["autumn"][i] else [0.12 + 0.1 * s[0], 0.36 + 0.2 * s[1], 0.12, 1]
        for j, (dx, dy, dz, r) in enumerate(((0, 0, 0, 1.0), (0.55, 0.3, -0.35, 0.72), (-0.5, 0.35, -0.3, 0.75), (0.05, -0.6, -0.4, 0.7))):
            w.add_geom(name=f"leaf{i}_{j}", type=mujoco.mjtGeom.mjGEOM_ELLIPSOID, size=[r, r, r * 0.75], pos=[x + dx, y + dy, h + dz], rgba=leaf, **none)
    if plan["fire"] is not None:
        fx, fy = plan["fire"]
        w.add_geom(name="scorch", type=mujoco.mjtGeom.mjGEOM_CYLINDER, size=[FIRE_R * 1.6, 0.01, 0], pos=[fx, fy, 0.01], rgba=[0.04, 0.03, 0.03, 1], **none)
        for i in range(N_FLAMES):
            b = w.add_body(name=f"flame{i}", mocap=True, pos=[fx, fy, 0.3])
            b.add_geom(name=f"flame_g{i}", type=mujoco.mjtGeom.mjGEOM_ELLIPSOID, size=[0.2, 0.2, 0.35], material=("flame_r", "flame_o", "flame_y")[i % 3], **none)
        for i in range(N_SMOKE):
            b = w.add_body(name=f"smoke{i}", mocap=True, pos=[fx, fy, 2.0])
            b.add_geom(name=f"smoke_g{i}", type=mujoco.mjtGeom.mjGEOM_SPHERE, size=[0.4, 0, 0], rgba=[0.15, 0.15, 0.16, 0.5], **none)
    cf2 = spec.body("cf2")
    c = np.sqrt(0.5)
    for name, right in (("front", (0, -1, 0)), ("left", (1, 0, 0)), ("back", (0, 1, 0)), ("right", (-1, 0, 0)), ("ahead_l", (c, -c, 0)), ("ahead_r", (-c, -c, 0))):
        cf2.add_camera(name=f"eye_{name}", pos=[0, 0, 0], xyaxes=[*right, 0, 0, 1], fovy=EYE_FOVY)
    # the camera's near cut scales with the size of the world: in a world this big it hid any trunk closer than about 0.5 m, so the drone flew into trees it couldn't see
    spec.visual.map.znear = 0.001
    spec.visual.headlight.ambient = [0.42, 0.42, 0.42]
    spec.visual.headlight.diffuse = [0.3, 0.3, 0.3]
    return spec


class ForestSim(DroneSim):
    arena = HALF + 2.5                                 # wandering out past the trees isn't a crash until here; three of five crashes on seed 9303 were this edge

    def __init__(self, seed: int, decoys: bool = False, fire: bool = True):
        self.plan = layout(seed, decoys, fire)
        self.fire_rng = np.random.default_rng(seed + 41000)
        self.flames = self.smoke = None
        self.fire_clock = 0.0
        super().__init__(seed=seed, n_fruit=0, pillars=self.plan["trees"], gusts=False)
        if fire:
            bid = lambda name: self.model.body(name).mocapid[0]                                          # noqa: E731
            self.flames = [(bid(f"flame{i}"), self.model.geom(f"flame_g{i}").id) for i in range(N_FLAMES)]
            self.smoke = [(bid(f"smoke{i}"), self.model.geom(f"smoke_g{i}").id) for i in range(N_SMOKE)]
            self.phase = self.fire_rng.random(N_FLAMES + N_SMOKE)
            self.spot = self.fire_rng.uniform(-1, 1, (N_FLAMES, 2))
            self.spot *= FIRE_R / np.maximum(np.linalg.norm(self.spot, axis=1, keepdims=True), 1.0)
        self.reset()

    def _build(self, n_fruit, leader, decoy, people) -> mujoco.MjSpec:
        return build(self.plan)

    def reset(self) -> None:
        super().reset()
        self.data.qpos[:2] = START
        mujoco.mj_forward(self.model, self.data)
        self.control.reset(CRUISE)
        self._burn()

    def step(self, forward: float = 0.0, climb: float = 0.0, yaw_rate: float = 0.0) -> dict:
        out = super().step(forward, climb, yaw_rate)
        if self.t - self.fire_clock >= 0.04:
            self.fire_clock = self.t
            self._burn()
        return out

    def _burn(self) -> None:
        """Flames rise and shrink at their own pace with a fast flicker on top; smoke rises and fades. Looks only: nothing here is measured."""
        if self.flames is None:
            return
        fx, fy, t = *self.plan["fire"], self.t
        flicker = self.fire_rng.normal(0, 1, N_FLAMES)
        for i, (m, g) in enumerate(self.flames):
            h = (t * (1.0 + 0.5 * self.phase[i]) + self.phase[i]) % 1.0
            sway = 0.1 * h * np.sin(9 * t + 20 * self.phase[i])
            self.data.mocap_pos[m] = [fx + self.spot[i, 0] * (1 - 0.6 * h) + sway, fy + self.spot[i, 1] * (1 - 0.6 * h) + sway, 0.15 + FIRE_H * h]
            r = max(0.04, (0.26 - 0.2 * h) * (1 + 0.25 * flicker[i]))
            self.model.geom_size[g] = [r, r, r * 1.9]
        for i, (m, g) in enumerate(self.smoke):
            h = (t * 0.09 + self.phase[N_FLAMES + i]) % 1.0
            self.data.mocap_pos[m] = [fx + 0.8 * h * np.sin(1.3 * t + 9 * i) + 1.2 * h, fy + 0.8 * h * np.cos(1.1 * t + 7 * i), 1.5 + 6.0 * h]
            self.model.geom_size[g][0] = 0.35 + 0.9 * h
            self.model.geom_rgba[g][3] = 0.55 * (1 - h)

    def render(self, camera: str = "chase", width: int = 1280, height: int = 720) -> np.ndarray:
        self.renderers = getattr(self, "renderers", {})
        r = self.renderers.get((width, height))
        if r is None:
            r = self.renderers[(width, height)] = mujoco.Renderer(self.model, height, width)
        if not hasattr(self, "cam"):
            self.cam = mujoco.MjvCamera()
            self.cam.type = mujoco.mjtCamera.mjCAMERA_FREE
            self.cam_az = np.degrees(self.heading)
            self.cam_at = self.pos.copy()
        self.cam_az += 0.05 * (((np.degrees(self.heading) - self.cam_az) + 180) % 360 - 180)
        self.cam_at += 0.1 * (self.pos - self.cam_at)
        self.cam.lookat[:] = self.cam_at
        self.cam.distance, self.cam.elevation, self.cam.azimuth = 1.5, -14, self.cam_az
        r.update_scene(self.data, self.cam)
        return r.render().copy()


class FireEyes(PixelEyes):
    """The trunks through eyes.py's own step, plus flame-coloured pixels: the stand-in described at the top."""

    def fire(self, pictures: dict[str, np.ndarray], cameras: dict[str, float]) -> Thing | None:
        best = None
        for name, centre in cameras.items():
            img = pictures[name].astype(np.float32) / 255
            hot = (img[..., 0] > 0.75) & (img[..., 2] < 0.4) & (img[..., 0] - img[..., 1] > 0.15)
            n = int(hot.sum())
            if n >= MIN_HOT and (best is None or n > best[0]):
                xs = np.nonzero(hot)[1]
                best = (n, _wrap(centre + float(self.column[xs].mean())), (xs.max() - xs.min() + 1) * self.rad_per_px)
        if best is None:
            return None
        return Thing("leader", best[1], FIRE_WIDTH / max(best[2], 1e-3), TARGET_SIZE)


def route() -> list[np.ndarray]:
    """Back and forth across the forest, in the drone's own frame: it starts at the corner, looking along x."""
    rows = np.arange(0.0, 2 * HALF - 2.0, ROW_GAP)
    points = []
    for i, y in enumerate(rows):
        ends = (14.0, 0.0) if i % 2 == 0 else (0.0, 14.0)
        points += [np.array([ends[0], y]), np.array([ends[1], y + ROW_GAP / 2])] if i < len(rows) - 1 else [np.array([ends[0], y])]
    return points


class Film:
    FPS = 30

    def __init__(self, sim: ForestSim, path: str):
        from PIL import ImageFont
        self.sim, self.next = sim, 0.0
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "1280x720", "-r", str(self.FPS), "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                                    "-crf", "22", "-movflags", "+faststart", path], stdin=subprocess.PIPE)
        self.big, self.small = ImageFont.truetype("arial.ttf", 30), ImageFont.truetype("arial.ttf", 20)

    def frames(self, picture: np.ndarray | None, status: str, colour: tuple) -> None:
        from PIL import Image, ImageDraw
        while self.next <= self.sim.t:
            im = Image.fromarray(self.sim.render())
            d = ImageDraw.Draw(im, "RGBA")
            d.rounded_rectangle([24, 24, 560, 112], radius=14, fill=(0, 0, 0, 170))
            d.text((42, 34), status, font=self.big, fill=colour)
            d.text((42, 76), "no GPS, no radio, no outside connection. Simulation.", font=self.small, fill=(220, 220, 220))
            if picture is not None:
                eye = Image.fromarray(picture).resize((480, 180))
                im.paste(eye, (1280 - 504, 24))
                d.rectangle([1280 - 504, 24, 1280 - 24, 204], outline=(255, 255, 255, 200), width=2)
                d.rounded_rectangle([1280 - 504, 210, 1280 - 290, 240], radius=8, fill=(0, 0, 0, 170))
                d.text((1280 - 496, 213), "the drone's two cameras", font=self.small, fill=(255, 255, 255))
            self.ff.stdin.write(np.asarray(im).tobytes())
            self.next += 1 / self.FPS

    def close(self) -> None:
        self.ff.stdin.close()
        self.ff.wait()


def fly(a) -> dict:
    brain = FlyBrain(seed=a.seed, sensory_input=a.sensory_input)
    if a.rewire:
        rewire(brain, seed=a.seed + 1000)
    pilot_module.TURN_GAIN = a.turn_gain
    senses, pilot = FollowSenses(brain), FollowPilot(brain)
    for _ in range(100):
        pilot.observe(brain.step())
    sim = ForestSim(a.seed, a.decoys, not a.no_fire)
    cameras = {"two": {"ahead_l": np.pi / 4, "ahead_r": -np.pi / 4}, "front_back": {"front": 0.0, "back": np.pi}, "one": {"front": 0.0}}[a.cameras]
    ALL_CAMERAS.update(ahead_l=np.pi / 4, ahead_r=-np.pi / 4)
    use_cameras(tuple(cameras))
    eyes = FireEyes((0, 0, 0), seed=a.seed)
    turner = TurnAway(brain, AVOID_TYPES, a.avoid_gain)
    tracker, bus, legs = Tracker(), Events(cooldown=1.0), route()
    ticks = round(brain.dt / sim.dt)
    film = Film(sim, a.out) if a.out else None
    n, leg, leg_t, trees, fire, picture = 0, 0, 0.0, [], None, None
    last_seen, fire_at, first_seen, found_at, found_true, crashes, stops, drift = None, None, None, None, None, 0, 0, []
    closest_fire, steps, crash_log, tree_seen = 99.0, 0, [], None
    while sim.t < a.seconds:
        if n % 2 == 0:
            shots = sim.eyes(names=tuple(cameras))
            picture = np.concatenate([shots["ahead_l"], shots["ahead_r"]], axis=1) if "ahead_l" in shots else shots["front"]
            trees = [t for t in eyes.things(shots) if t.kind == "pillar"]
            fire = eyes.fire(shots, cameras)
            if any(t.distance < 1.0 for t in trees):
                tree_seen = sim.t
        n += 1
        if fire is not None:
            if first_seen is None:
                first_seen = sim.t
                bus.emit("fire_seen", t=sim.t, bearing=fire.bearing, distance=fire.distance)
            last_seen = sim.t
            fire_at = tracker.pose + fire.distance * np.array([np.cos(tracker.h + fire.bearing), np.sin(tracker.h + fire.bearing)])
        chasing = last_seen is not None and sim.t - last_seen < MEMORY_S
        if chasing:
            goal = fire if fire is not None else fire_at
        else:
            goal = legs[leg]
            if np.hypot(*(goal - tracker.pose)) < REACHED or sim.t - leg_t > LEG_S:
                leg, leg_t = (leg + 1) % len(legs), sim.t
                goal = legs[leg]
        if isinstance(goal, Thing):
            target = goal
        else:
            d = goal - tracker.pose
            target = Thing("leader", _wrap(float(np.arctan2(d[1], d[0])) - tracker.h), float(np.hypot(*d)), TARGET_SIZE)
        fired = brain.step(None, senses.inject(trees + [target], match_pillars=True))
        pilot.observe(fired)
        cmd = pilot.command(sim.t, sim.pos[2])
        turner.observe(fired)
        cmd["yaw_rate"] += turner.yaw()
        holding = chasing and fire is not None and fire.distance < STANDOFF
        if holding:
            cmd["forward"] = 0.0
            if found_at is None:
                found_at = sim.t
                bus.emit("fire_found", t=sim.t, bearing=fire.bearing, distance=fire.distance)
        cmd["forward"] = min(cmd["forward"], a.speed)
        tracker.move(cmd, brain.dt)
        for _ in range(ticks):
            sim.step(**cmd)
        steps += 1
        stops += cmd["forward"] == 0.0 and not holding
        drift.append(float(np.hypot(*(sim.pos[:2] - START - tracker.pose))))
        if sim.plan["fire"] is not None:
            closest_fire = min(closest_fire, float(np.hypot(*(sim.pos[:2] - sim.plan["fire"]))))
            if found_at is not None and found_true is None:
                found_true = float(np.hypot(*(sim.pos[:2] - sim.plan["fire"])))
        if sim.crashed:
            crashes += 1
            bus.emit("crash", t=sim.t)
            near = min(sim.plan["trees"], key=lambda q: np.hypot(*(np.array(q) - sim.pos[:2])))
            off = np.array(near) - sim.pos[:2]
            crash_log.append({"t": round(sim.t, 1), "gap": round(float(np.hypot(*off)), 2), "bearing": round(float(np.degrees(_wrap(float(np.arctan2(off[1], off[0])) - sim.heading)))),
                              "z": round(float(sim.pos[2]), 2), "seen": round(sim.t - tree_seen, 2) if tree_seen is not None else None, "yaw": round(cmd["yaw_rate"], 2), "forward": round(cmd["forward"], 2)})
            t = sim.data.time
            sim.reset()
            sim.data.time = t
            senses.leader_size, senses.pillars, trees, fire = None, [], [], None
            tracker.reset()
            leg, leg_t, last_seen, found_at, found_true = 0, sim.t, None, None, None
        if film:
            text, colour = ("HOLDING AT THE FIRE", (255, 160, 60)) if holding else ("FIRE SPOTTED: GOING TO LOOK", (255, 200, 90)) if chasing else ("ON PATROL", (140, 255, 210))
            film.frames(picture, text, colour)
        if found_at is not None and sim.t - found_at > (HOLD_S if film else 0.5):
            break
    if film:
        film.close()
    sim.close()
    found = found_true is not None and found_true <= TRUE_NEAR
    return {"seed": a.seed, "rewired": a.rewire, "sensory_input": a.sensory_input, "decoys": a.decoys, "fire": not a.no_fire, "found": found, "called_at": round(found_at, 1) if found_at else None,
            "true_distance": round(found_true, 2) if found_true else None, "first_seen": round(first_seen, 1) if first_seen else None, "closest_fire": round(closest_fire, 2),
            "seconds": round(sim.t, 1), "crashes": crashes, "stopped": round(stops / max(steps, 1), 3), "legs_done": leg, "median_drift": round(float(np.median(drift)), 2), "events": dict(bus.counts), "crash_log": crash_log}


def picture(a) -> None:
    from PIL import Image
    OUT.mkdir(parents=True, exist_ok=True)
    sim = ForestSim(a.seed, a.decoys)
    for _ in range(30):
        sim.step()
    fire = sim.plan["fire"]
    d = fire - sim.pos[:2]
    print("fire at", fire.round(1), "distance", round(float(np.hypot(*d)), 1))
    Image.fromarray(sim.render()).save(OUT / f"chase{a.seed}.png")
    # the drone's own camera, moved to 5 m from the fire and facing it
    sim.data.qpos[:2] = fire - 5 * d / np.hypot(*d)
    a_ = float(np.arctan2(d[1], d[0]))
    sim.data.qpos[3:7] = [np.cos(a_ / 2), 0, 0, np.sin(a_ / 2)]
    mujoco.mj_forward(sim.model, sim.data)
    Image.fromarray(sim.eyes(names=("front",))["front"]).resize((512, 384)).save(OUT / f"eye{a.seed}.png")
    sim.close()


def score(a) -> None:
    folder = OUT / a.folder
    seeds = range(a.first_seed, a.first_seed + 8)
    real = [json.loads((folder / f"real{s}.json").read_text()) for s in seeds]
    scr = [json.loads((folder / f"scrambled{s}.json").read_text()) for s in seeds]
    found, found_scr = sum(r["found"] for r in real), sum(r["found"] for r in scr)
    per_min = sum(r["crashes"] for r in real) / (sum(r["seconds"] for r in real) / 60)
    print("real", [(r["seed"], r["found"], r["called_at"], r["true_distance"], r["crashes"], r["stopped"]) for r in real])
    print("scrambled", [(r["seed"], r["found"], r["crashes"], r["stopped"]) for r in scr])
    print(f"FINDS   {found} of 8: {'PASS' if found >= 6 else 'MISS'}")
    print(f"WIRING  {found - found_scr} more than scrambled ({found_scr}): {'PASS' if found - found_scr >= 4 else 'MISS'}")
    print(f"CRASHES {per_min:.2f} a minute: {'PASS' if per_min <= 0.5 else 'MISS'}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="what", required=True)
    f = sub.add_parser("fly")
    f.add_argument("--seed", type=int, default=9301)
    f.add_argument("--seconds", type=float, default=240.0)
    f.add_argument("--rewire", action="store_true")
    f.add_argument("--decoys", action="store_true", help="autumn trees: not until the real fire step exists")
    f.add_argument("--no-fire", action="store_true")
    f.add_argument("--cameras", choices=("one", "two", "front_back"), default="two", help="two = both forward, angled 45 degrees out: on front_back it hit trees it couldn't see at its sides (seed 9303)")
    f.add_argument("--sensory-input", action="store_true", help="the original brain; the default is the bench's")
    f.add_argument("--turn-gain", type=float, default=TURN_GAIN)
    f.add_argument("--avoid-gain", type=float, default=0.7, help=f"avoid.py's was {AVOID_GAIN}; 0.7 from seeds 9302-9303")
    f.add_argument("--speed", type=float, default=0.55)
    f.add_argument("--out", default="")
    p = sub.add_parser("picture")
    p.add_argument("--seed", type=int, default=9301)
    p.add_argument("--decoys", action="store_true")
    s = sub.add_parser("score")
    s.add_argument("--folder", default="test")
    s.add_argument("--first-seed", type=int, default=9311)
    a = ap.parse_args()
    if a.what == "fly":
        print(json.dumps(fly(a)))
    elif a.what == "picture":
        picture(a)
    else:
        score(a)


if __name__ == "__main__":
    main()
