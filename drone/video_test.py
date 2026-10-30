"""Real footage through the follower's whole chain: vision, the learned choice, and the connectome's steering neurons.

    python drone/video_test.py clip.mp4 --train 0 --against 120 --out drone/runs/real.mp4

The footage plays as the front camera, so nothing flies: the camera isn't ours to steer. It answers: on a real picture,
does it find the person, does what it learned pick them, and do the steering neurons turn toward them?
--train and --against are the hues the trainer rewards and punishes (degrees: 0 red, 120 green, 240 blue).
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
from sim import Thing  # noqa: E402
from eyes import ColourEyes  # noqa: E402
from follow import FollowSenses  # noqa: E402
from pilot import Pilot  # noqa: E402
from choose import BLINK_STEPS, LOOK_STEPS, Chooser, PERSON_SIZE, hue_gap, teach  # noqa: E402
from imprint import KC_OFFSET, Colours  # noqa: E402
from flybrain import FlyBrain  # noqa: E402
import learning  # noqa: E402

W, H = 128, 72
TOWARD = 8.0      # degrees: off-centre by more than this, a turn has a right answer


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("clip")
    ap.add_argument("--train", type=float, required=True, help="hue rewarded")
    ap.add_argument("--against", type=float, required=True, help="hue punished")
    ap.add_argument("--person-hue", type=float, default=None, help="for scoring: the person's clothes")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--mirror", action="store_true", help="the control: flip the picture, and the turns must flip")
    ap.add_argument("--out", default="")
    a = ap.parse_args()

    learning.reset()
    brain = FlyBrain(device="cpu", batch=1, seed=a.seed, sensory_input=False)
    colours = Colours(brain)
    colours.quiet = np.r_[colours.all_kc, np.flatnonzero(brain.cell_type.astype(str) == "APL")]
    offset = [(colours.all_kc, KC_OFFSET)]
    for _ in range(60):
        brain.step(inject=offset)
    teach(colours, {"A": a.train, "B": a.against}, "A", a.seed + 7)
    senses, pilot = FollowSenses(brain), Pilot(brain)
    for _ in range(100):
        pilot.observe(brain.step(inject=offset))
    eyes = ColourEyes(PERSON_SIZE, width=W, height=H, seed=a.seed)
    chooser = Chooser(colours)

    cap = cv2.VideoCapture(a.clip)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    blank = np.zeros((H, W, 3), np.uint8)
    ff = None
    frames = seen = person = picked_person = right = judged = 0
    sides = {"left": 0, "right": 0}
    turns = {"left": 0, "right": 0, "straight": 0}
    hues: dict[int, int] = {}
    font = ImageFont.truetype("arial.ttf", 22)
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if a.mirror:
            frame = frame[:, ::-1].copy()
        small = cv2.cvtColor(cv2.resize(frame, (W, H), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2RGB)
        _, shapes = eyes.shapes({"front": small, "left": blank, "right": blank, "back": blank})
        frames += 1
        seen += bool(shapes)
        choice, yaw = None, 0.0
        for _ in range(2):                             # a 25 fps camera: two 20 ms brain steps a frame
            chooser.before(shapes)
            choice = chooser.pick(shapes)
            things = [Thing("leader", choice["bearing"], 1.0, choice["size"])] if choice else []
            fired = brain.step(None, senses.inject(things, match_pillars=True) + offset)
            pilot.observe(fired)
            chooser.after(fired)
        yaw = pilot.count("steer_L") - pilot.count("steer_R")
        turns["left" if yaw > 0 else "right" if yaw < 0 else "straight"] += 1
        if choice is not None:
            k = Chooser.key(choice["hue"])
            hues[k * 40] = hues.get(k * 40, 0) + 1
            if a.person_hue is not None and hue_gap(choice["hue"], a.person_hue) < 30:
                picked_person += 1
            if abs(np.degrees(choice["bearing"])) > TOWARD and yaw != 0:
                judged += 1
                sides["left" if choice["bearing"] > 0 else "right"] += 1
                right += np.sign(yaw) == np.sign(choice["bearing"])
        if a.person_hue is not None and any(hue_gap(s["hue"], a.person_hue) < 30 for s in shapes):
            person += 1
        if a.out:
            if ff is None:
                Path(a.out).parent.mkdir(parents=True, exist_ok=True)
                h, w = frame.shape[:2]
                ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}", "-r", str(fps), "-i", "-",
                                       "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23", "-movflags", "+faststart", a.out], stdin=subprocess.PIPE)
            im = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            d = ImageDraw.Draw(im, "RGBA")
            w = im.width
            if choice is not None:                     # where it thinks its pick is: a bearing, so a column
                x = w / 2 * (1 - np.tan(choice["bearing"]))
                d.line([x, 0, x, im.height], fill=(140, 255, 210, 220), width=4)
            d.rounded_rectangle([20, 20, 640, 120], radius=14, fill=(0, 0, 0, 170))
            what = "nothing" if choice is None else f"hue {choice['hue']:.0f}, {np.degrees(choice['bearing']):+.0f} deg"
            d.text((36, 30), f"fly's pick: {what}", font=font, fill=(140, 255, 210))
            turn = "left" if yaw > 0 else "right" if yaw < 0 else "straight"
            d.text((36, 74), f"its steering neurons: {turn} ({yaw:+.0f})", font=font, fill=(255, 255, 255))
            ff.stdin.write(np.ascontiguousarray(np.asarray(im)).tobytes())
    if ff is not None:
        ff.stdin.close()
        ff.wait()
    cap.release()
    print(json.dumps({"clip": Path(a.clip).parent.name, "train": a.train, "against": a.against, "frames": frames, "found_any": round(seen / max(frames, 1), 3),
                      "found_person": round(person / max(frames, 1), 3), "picks_person": round(picked_person / max(frames, 1), 3),
                      "turn_right_way": round(right / max(judged, 1), 3), "judged": judged, "person_side": sides, "turns": turns, "picks_by_hue": hues,
                      "learned": {str(k * 40): round(v, 2) for k, v in chooser.value.items()}, "look": BLINK_STEPS + LOOK_STEPS}))


if __name__ == "__main__":
    main()
