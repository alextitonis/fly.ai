# Fly-brain drone

A fruit fly's connectome (the full MaleCNS v1.0 brain from [`flybrain`](https://pypi.org/project/flybrain/)) flies a
simulated Crazyflie 2 quadcopter. Everything is pip-installable and open source.

```
pip install -r drone/requirements.txt     # mujoco, numpy, pillow, flybrain (+ ffmpeg on PATH for the video)
python drone/pilot.py                      # 30 s flight -> drone/runs/flight.mp4 (drone + live brain)
python drone/pilot.py --seconds 60 --flies 4 --device auto --no-gusts
```

The first run downloads the brain (~260 MB, once). With the brain panel, a CPU renders about 3.5x slower than real time.

## What's what

| Path | What |
|---|---|
| `sim/` | The emulator: MuJoCo physics, an arena with fruit and pillars, a velocity-mode flight controller. No brain in here: anything can fly it (`DroneSim.step(forward, climb, yaw_rate)`). |
| `sim/crazyflie/` | Bitcraze Crazyflie 2 model from [MuJoCo Menagerie](https://github.com/google-deepmind/mujoco_menagerie/tree/main/bitcraze_crazyflie_2) (MIT, see its LICENSE). One change: the moment gears are 100x larger so the attitude loop has real-drone authority. |
| `pilot.py` | The fly brain as the pilot, plus video recording with a small HUD. |
| `brainview.py` | The right half of the video: all neurons at their real positions (brain on top, nerve cord below, seen from above), lit when they spike; the neurons the drone reads are the named discs. |

## How the brain flies it

The visual front end is a model; everything after these neurons is the connectome (the same route as
`flybrain.FeatureDetectors`):

- the nearest fruit drives **LC10a** (the neurons a male uses to chase a target) on the side it is on
- a pillar growing in view drives **LPLC2** (looming), and one close ahead drives **LC4** (threat)
- a gust (a real force pushing the drone) drives the **Johnston's organ** wind sensors of the antenna it comes from

The drone reads the brain's descending neurons:

- **DNa02** left vs right sets the yaw rate: it turns toward the side that fires more
- **MDN** (backward walking) brakes
- **DNp01** (the giant fiber, escape) triggers a climb burst: the fly's take-off jump
- the **wind descending neurons** (DNg05_a, DNg06_a, DNg29, DNge016) left vs right turn it into the wind. Which side
  fires is the connectome's; reading it as "turn upwind" is our choice (flies orient upwind).

The drone cruises forward like a flying fly; DNg100 (forward walking) is silent in this model. Nothing in the code says
"fly to the fruit": the turn toward it comes from the connectome.

Measured 2026-10-18 (8 flies, 2 s each): a target on the left fires DNa02 L at ~4.4 Hz with DNa02 R silent, the mirror
on the right; looming fires DNp01 on that side at 10-25 Hz; wind on one antenna fires the wind DNs on that side at
6-12 Hz with the other side silent, half the wind about half the rate.

**No smell.** No descending neuron of this model answers food odour or vinegar (`wiz/dnscreen.py`, all 1,314 types),
so an odour sense would steer nothing.

## Following with no radio (`follow.py`, `eyes.py`)

`python drone/follow.py` records a 60 s demo to `drone/runs/follow.mp4`. The follower knows only what its four onboard
cameras show: `eyes.py` finds a beacon's colour and the pillars in the pixels, and the simulator's positions are used only
for scoring and the viewer. The leader flies a scripted route. A second, magenta drone flies around as a distraction.

Measured 2026-10-30, 8 fresh seeds, 60 s each. Rules set before running: at most 0.7x the decoy's distance, at most 0.8x
scrambled wiring's, within 1 m at least 60% of the time, at most 1 crash a minute.

| Condition | Distance | Within 1 m | Crashes/min |
|---|---|---|---|
| Sees the leader | 0.97 m | 55% | 0.25 |
| Scrambled wiring | 1.39 m | 35% | 0 |
| Tracks the other drone | 1.84 m | 17% | 0 |
| Sees nothing | 2.14 m | 18% | 2.38 |

Three rules passed; **within 1 m missed at 55%**. With exact positions instead of a camera (`--eyes exact`, no distraction)
the same test gave 0.79 m and 75%, and passed all four. Limits: the colour filter picks who to follow, not the brain;
the speed cap and the stop on DNp01 are our mapping; the leader has no physics.

## Hand gestures (`gestures.py`)

Camera -> a motion model (Reichardt correlators, nothing trained) -> the real T4/T5 motion neurons at their place in the
eye -> the connectome -> one linear readout on descending neurons. Rendered hands only so far; `record` and `live` need a
webcam and have not been run. Second design, after a first that scored 20%:

| Route | New clips | Hands never seen |
|---|---|---|
| Same motion data, no neurons | 89% | 68% |
| Pixels | 79% | 74% |
| Fly brain | 66% | 83% |
| Scrambled wiring | 68% | 77% |

**Failed** 3 of 4 rules: scrambled wiring does as well, so the fly's wiring is not what recognises the gesture.

## Real footage (`video_test.py`, 2026-10-30)

Free clips from Mixkit, one each, played as the front camera: nothing flies, since the camera can't be steered.

| Clip | Found | Result |
|---|---|---|
| Red dress, seen from behind | 100% of frames | Trained for red: picks her 100%, steers the right way 100%. Trained against red: picks her 6%. Mirrored: picks her 100%, turns flip, right 99% |
| Pale blue outfit | 0% | Too washed out to count as a colour |
| Black jacket | 0% | No colour to read. Trained on red, it picked other red and orange things in the shot instead |

Real hand on a green screen, with truth taken from the hand's own movement (windows moving at least 20% of the picture):
**failed**, 9 of 21 right against a rule of 50%. When it did name a swipe it was right 9 of 10 times; most misses read as
still, push or pull. It said "still" for 10 of 17 still windows. The readout was trained only on rendered hands.

## Not finished (2026-10-30)

- `imprint.py`, learning who to follow with dopamine. The first design failed: the smell setting silenced the visual
  Kenyon cells (0.04% active). With offset -0.2, drive 2.0 V (over the usual 0.8 V cap) and only visual Kenyon cells read,
  the bench passed all 5 rules: 100% prefer the rewarded colour, 100% flip when rewards swap, random rewards 63%,
  scrambled wiring 33%. A colour within about 40 degrees of hue reads as the same leader. **That bench resets the brain
  before every look.** Left running, the Kenyon cells go all-or-nothing, so flight needs a quiet "blink" before each look
  (`choose.py`: our addition, not in the wiring).
- `choose.py`, two leaders (drones or walking people) and the learned preference picks one. Single development flights
  picked the rewarded one 70% vs 39% for drones and 78% vs 28% for people, before a tighter colour threshold. **The fixed
  test (8 seeds, 3 trainings, drones and people) was stopped by low memory with no flight finished: no result yet.**
- `planner.py`, World-Sim's planner vs the fly: flight data collected once, three-way test not run.
- `readout_checks.py`: same neurons passes (135x chance). Refuse passes only barely: 70% of unseen gestures refused, but
  28% of known ones were too, against the 10% it was set for. Think less fails (98% of the brain time, no saving). Notice
  change catches the mirrored camera at once with no false alarms, but the short retrain reaches 54% against 66% before,
  so it misses by 2 points.

## Real drone later

`sim.DroneSim.step(forward, climb, yaw_rate)` is the same velocity-mode command a real Crazyflie (`cflib`) or DJI Tello
(`djitellopy`) takes, so `pilot.py`'s commands can be sent to hardware once the camera gives the same "things in view".
