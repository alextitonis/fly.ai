"""How far can one drone read another's blinking light, with no radio? Camera and arithmetic only: nothing here is the connectome.

    python drone/light.py --seed 9700 --dev      # development: picks the cutoff
    python drone/light.py --seed 9701            # the test, then 9702 to repeat

Sound only got tested at 1.5-2.5 m with a modelled microphone, and patrol drones would be tens of metres apart. Blinking LEDs read by a camera are already used between drones with no radio (UVDAR).
One drone hovers at 6.5 m over forest.py's big forest, another hovers at some distance with a 7 cm LED. Its place in the picture and when its blink starts are unknown, and its clock is up to 1% off. The camera shakes a little. 3.2 s of 25 frames a second.
Each pixel's brightness over time goes through a Fourier transform after taking out the shake. The strongest pixel at any of the four rhythms says the message, or "nothing" under CUTOFF. Four messages (2, 4, 6, 8 Hz) and silence: 2 bits a look.

Rules fixed before running, seed 9701, a pass only counts if it repeats on 9702, 8 looks per message and distance, cutoff from seed 9700:
    NEAR      at 640 x 480, at least 90% of messages right at 10 m, at most 10% of silent looks called anything
    SMALL     at 128 x 96, the drone's usual picture, at least 90% right at 5 m, at most 10% of silent looks called anything
Reported, no rule: the whole curve out to 40 m.
Limits: the simulator's LED can't be brighter than white and doesn't bloom on the sensor, while a real one does both, so real range could be longer. But real sensors add rolling shutter, blur, sun and stronger shake, which could make it shorter. No real camera has been tried. Sight lines only: trees or haze in the way aren't tested. The other drone hovers.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import mujoco
import numpy as np

import forest as fo

HERE = Path(__file__).resolve().parent
OUT = HERE / "runs" / "light"
FPS, FRAMES = 25, 80
HEIGHT = 6.5
RHYTHMS = (2.0, 4.0, 6.0, 8.0)
DISTANCES = (2.5, 5.0, 10.0, 15.0, 20.0, 30.0, 40.0)
LOOKS = 8
SHAKE_DEG = 0.15
NOISE = 2.0                   # camera noise, out of 255
LED_RADIUS = 0.035
FOVY = 73.74                  # as the drone's own cameras: 90 degrees across
SIZES = {"large": (640, 480), "small": (128, 96)}
CUTOFF = {"large": 8.0, "small": 8.0}   # replaced from the dev run: strongest peak over the picture's typical peak


class Sky(fo.ForestSim):
    def _build(self, n_fruit, leader, decoy, people):
        spec = fo.build(self.plan)
        spec.visual.global_.fovy = FOVY
        spec.visual.global_.offwidth, spec.visual.global_.offheight = 1280, 960
        mat = spec.add_material(name="led", rgba=[0.2, 1.0, 0.6, 1], emission=1.0)
        body = spec.worldbody.add_body(name="led", mocap=True, pos=[0, 0, -5])
        body.add_geom(name="led_g", type=mujoco.mjtGeom.mjGEOM_SPHERE, size=[LED_RADIUS, 0, 0], material=mat.name, contype=0, conaffinity=0)
        return spec


def look(sim, renderer, rng, distance: float, rhythm: float | None, size: tuple[int, int]) -> np.ndarray:
    """(frames, H, W) grey from one look."""
    az, el = rng.uniform(0, 360), -rng.uniform(5, 25)
    off_az, off_el = rng.uniform(-30, 30), rng.uniform(-22, 22)           # where the LED lands in the picture
    here = np.array([rng.uniform(-8, 8), rng.uniform(-8, 8), HEIGHT])
    a, e = np.radians(az), np.radians(el)
    centre = np.array([np.cos(e) * np.cos(a), np.cos(e) * np.sin(a), np.sin(e)])
    a2, e2 = np.radians(az + off_az), np.radians(el + off_el)
    led = here + distance * np.array([np.cos(e2) * np.cos(a2), np.cos(e2) * np.sin(a2), np.sin(e2)])
    sim.data.mocap_pos[sim.model.body("led").mocapid[0]] = led
    mujoco.mj_forward(sim.model, sim.data)
    mat = sim.model.material("led").id
    start, clock = rng.uniform(0, 1), rng.uniform(0.99, 1.01)
    cam = mujoco.MjvCamera()
    cam.type = mujoco.mjtCamera.mjCAMERA_FREE
    cam.distance = 3.0
    out = []
    for t in range(FRAMES):
        on = rhythm is not None and ((t / FPS * rhythm * clock + start) % 1.0) < 0.5
        sim.model.mat_emission[mat] = 1.0 if on else 0.0
        sim.model.mat_rgba[mat] = [0.2, 1.0, 0.6, 1] if on else [0.05, 0.05, 0.05, 1]
        cam.azimuth, cam.elevation = az + rng.normal(0, SHAKE_DEG), el + rng.normal(0, SHAKE_DEG)
        d = np.array([np.cos(np.radians(cam.elevation)) * np.cos(np.radians(cam.azimuth)), np.cos(np.radians(cam.elevation)) * np.sin(np.radians(cam.azimuth)), np.sin(np.radians(cam.elevation))])
        cam.lookat[:] = here + 3.0 * d
        renderer.update_scene(sim.data, cam, scene_option=sim.eye_view)
        grey = cv2.cvtColor(renderer.render(), cv2.COLOR_RGB2GRAY).astype(np.float32)
        out.append(grey + rng.normal(0, NOISE, grey.shape).astype(np.float32))
    return np.stack(out)


def read(frames: np.ndarray) -> tuple[int, float]:
    """(which rhythm, how far its strongest pixel stands out)."""
    steady, x, y = [frames[0]], 0.0, 0.0
    size = (frames.shape[2], frames.shape[1])
    win = cv2.createHanningWindow(size, cv2.CV_32F)
    for a, b in zip(frames, frames[1:]):
        (dx, dy), _ = cv2.phaseCorrelate(a, b, win)
        x, y = x + dx, y + dy
        steady.append(cv2.warpAffine(b, np.array([[1, 0, -x], [0, 1, -y]], np.float32), size, flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE))
    arr = np.stack([cv2.blur(f, (3, 3)) for f in steady])
    spec = np.abs(np.fft.rfft(arr - arr.mean(0), axis=0))
    bins = [int(round(r * FRAMES / FPS)) for r in RHYTHMS]
    power = np.stack([spec[b - 1:b + 2].max(0) for b in bins])                 # a clock 1% off stays within a bin of it
    peak = power.reshape(len(bins), -1).max(1)
    typical = float(np.median(power)) + 1e-3
    best = int(peak.argmax())
    return best, float(peak[best] / typical)


def run_size(sim, name: str, seed: int) -> dict:
    size = SIZES[name]
    renderer = mujoco.Renderer(sim.model, size[1], size[0])
    rng = np.random.default_rng(seed + (0 if name == "large" else 1))
    silent = [read(look(sim, renderer, rng, 10.0, None, size))[1] for _ in range(LOOKS * 2)]
    curve = {}
    for d in DISTANCES:
        got = [(i, *read(look(sim, renderer, rng, d, r, size))) for i, r in enumerate(RHYTHMS) for _ in range(LOOKS)]
        curve[str(d)] = {"strength": [round(g[2], 1) for g in got], "picked": [g[1] == g[0] for g in got]}
        print(name, d, "picked", round(float(np.mean(curve[str(d)]["picked"])), 3), "strength median", round(float(np.median(curve[str(d)]["strength"])), 1), flush=True)
    renderer.close()
    return {"silent": [round(s, 1) for s in silent], "curve": curve}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--seed", type=int, default=9700)
    ap.add_argument("--dev", action="store_true")
    a = ap.parse_args()
    fo.big_world()
    sim = Sky(a.seed, fire=False)
    res = {"seed": a.seed}
    cut = dict(CUTOFF)
    for name in SIZES:
        res[name] = run_size(sim, name, a.seed)
        print(name, "silent strength", sorted(res[name]["silent"]), flush=True)
        if a.dev:
            continue
        right = {d: float(np.mean([p and s >= cut[name] for p, s in zip(c["picked"], c["strength"])])) for d, c in res[name]["curve"].items()}
        res[name]["right"] = {d: round(v, 3) for d, v in right.items()}
        res[name]["silent_called"] = round(float(np.mean(np.array(res[name]["silent"]) >= cut[name])), 3)
        print(name, "right", res[name]["right"], "silent called", res[name]["silent_called"], flush=True)
    sim.close()
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{a.seed}.json").write_text(json.dumps(res, indent=1))
    if not a.dev:
        print(f"NEAR  {res['large']['right']['10.0']:.0%} at 10 m, silent {res['large']['silent_called']:.0%}: {'PASS' if res['large']['right']['10.0'] >= 0.9 and res['large']['silent_called'] <= 0.1 else 'MISS'}")
        print(f"SMALL {res['small']['right']['5.0']:.0%} at 5 m, silent {res['small']['silent_called']:.0%}: {'PASS' if res['small']['right']['5.0'] >= 0.9 and res['small']['silent_called'] <= 0.1 else 'MISS'}")


if __name__ == "__main__":
    main()
