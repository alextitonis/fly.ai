# Fly-brain drone

A fruit fly's connectome (the full MaleCNS v1.0 brain from [`flybrain`](https://pypi.org/project/flybrain/)) flies a
simulated Crazyflie 2 quadcopter. It follows a leader using only its cameras, learns who to follow with dopamine, and turns
when it sees a hand swipe. Everything is pip-installable and open source. **All of this is simulation and recorded video:
it has never flown on a real drone** ([what that would take](#using-it-in-the-real-world)).

```
pip install -r drone/requirements.txt     # + ffmpeg on PATH for videos
python drone/pilot.py                      # 30 s flight -> drone/runs/flight.mp4 (drone + live brain)
```

The first run downloads the brain (~260 MB, once). The gesture scripts also need one table of the eye's layout:

```
curl -L -o "$HOME/fly-data/raw/optic-columns.xlsx" --create-dirs https://raw.githubusercontent.com/flyconnectome/2025malecns/67767d2233657983993ff6c2be48e836a935863c/supplemental_data/optic-column-type-assignments-v1.0.xlsx
```

Each brain uses about 0.7 GB of memory. Run a few at a time and set `NUMBA_NUM_THREADS` and `OMP_NUM_THREADS` to 2-4, or
the machine gets slow.

## What you can run

| Command | What it does | Time and output |
|---|---|---|
| `python drone/pilot.py` | The fly eats fruit among pillars, in gusts of wind | 30 s flight, about 2 min, `runs/flight.mp4` |
| `python drone/follow.py` | Follows a leader using only its four cameras, with a second drone as a distraction | 60 s flight, about 4 min, `runs/follow.mp4` |
| `python drone/follow.py --eyes exact` | The same, told exact positions: the best case, without a camera | |
| `python drone/follow.py --no-video --condition decoy --seed 301` | One measured flight. `--condition real\|decoy\|blind`, `--rewire` scrambles the wiring | 1-2 min, JSON result |
| `python drone/choose.py --people --train A --out drone/runs/person.mp4` | Learns who to follow, then follows them. `A` is green, `B` is pink, `none` is untrained; without `--people` it's drones | 60 s flight, about 5 min |
| `python drone/imprint.py` | The learning test on the bench, no flying | about 10 min |
| `python drone/video_test.py clip.mp4 --train 0 --against 120 --person-hue 0 --out drone/runs/real.mp4` | Real footage through vision, learned choice and steering. Hues in degrees: 0 red, 120 green, 240 blue. `--mirror` is the control | about 1 min |
| `python drone/reflex.py` | Swipes turn the fly, nothing trained: real wiring vs scrambled | about 10 min |
| `python drone/reflex.py --clip hand.mp4` | The same on a real hand on a green screen. `--mirror` is the control | about 2 min |
| `python drone/swipe.py --swipes 6 --out drone/runs/swipe.mp4` | A hand swipe turns the drone in the 3D world, nothing trained. `--clip hand.mp4` uses a recorded hand; `--no-video` measures, `--rewire` scrambles | 30 s flight, about 3 min |
| `python drone/gestures.py measure` | 7 gestures through a trained readout, against scrambled wiring and no brain | about 15 min |
| `python drone/gestures.py record` / `live` | Records your hands on a webcam; reads them live. **Neither has been run on a real camera yet** | about 5 min to record |
| `python drone/readout_checks.py` | World-Sim's readout checks (after `gestures.py measure`) | about 10 min |
| `python drone/planner.py ...` | World-Sim's planner against the fly. **The comparison hasn't been run** | see below |

## How to train it more

The connectome's own wiring never changes. Everything that learns sits on top of it, and each has its own way to improve:

| What | How to give it more | Notes |
|---|---|---|
| **Who to follow** | `TRAIN_ROUNDS` in `choose.py` (12 per colour) | Training takes seconds and happens at the start of every run: nothing is saved yet. To teach new colours, change `SHIRTS` or `BEACONS` in `sim/world.py`, or `--train` and `--against` in `video_test.py`. Reward is `+1`, punishment `-1`, in `teach()`. |
| **Gesture readout** | `gestures.py measure --train 60` (clips per gesture); `record --takes 12`, then `measure --clips drone/runs/my_hand` | So far only trained on rendered hands. Your own recordings are the obvious next step. |
| **Reflex gestures** | Nothing to train | You can change which neurons are read (`TYPES`), the lean at rest (`OFFSET`) and the dead zone (`DEAD`) in `reflex.py`. |
| **The planner** | `collect` more flights, then `fit` again | `python drone/planner.py collect --kind fly --minutes 8 --seed 1 --out data/fly1.npz`, then `fit --kind fly --data "data/fly*.npz" --out data/fly.pt`, then `fly --policy flyplan --model data/fly.pt`. `--kind raw` and `--policy raw` is the same with no fly. |

When you change anything, test on **fresh seeds** with the pass rule written down first, and compare with `--rewire`. If
scrambled wiring does just as well, the fly isn't what's doing the work.

## Using it in the real world

Nothing below has been tried. It's what the results so far suggest.

**What would carry over:** `DroneSim.step(forward, climb, yaw_rate)` is the same velocity command a real Crazyflie (`cflib`)
or DJI Tello (`djitellopy`) takes, and `eyes.py` works on any pictures. An adapter would replace `sim.eyes()` with real
camera frames and `sim.step()` with the drone's command. That adapter isn't written.

**What you'd need:**
- **A drone with a camera and a laptop:** a Tello is the cheap way in, streaming video to a laptop that runs the brain and sends
  commands back. One fly needs a step every 20 ms, and a desktop CPU takes about 9 ms.
- **The brain won't fit on a small drone:** so "no radio" would only be true between the drones, each still linked to its
  computer. Truly no radio needs an onboard computer, so a bigger drone.
- **One camera, not four:** the simulation sees all round. A real front camera loses the leader as soon as it leaves the
  view, and has no way to find them again.
- **Something colourful to follow:** a saturated shirt or a bright LED. Pale or black clothes aren't seen at all (see below).

**What's likely to go wrong first:** auto white balance and changing light shift colours; the colour thresholds in `eyes.py`
were tuned on clean pictures; motion blur and video delay aren't simulated; and it stops often near people, so it would look
hesitant. Real wind is modelled only as the simple gusts in `pilot.py`.

**A safe order to try it:**
1. Your own footage through `video_test.py`, no drone.
2. A camera in your hand, walking after someone, watching which way the steering neurons say to turn.
3. The drone on the ground or tethered, with props off, checking commands and delay.
4. Slow indoor flight in a clear or netted space, with prop guards, a kill switch in someone's hand, and a speed cap.

Keep it away from people's faces while it's unproven, and check your local drone rules. This is a research toy, not a
safety system: it can lose its target, or pick the wrong one, at any time.

## What's what

| Path | What |
|---|---|
| `sim/` | The emulator: MuJoCo physics, an arena with fruit and pillars, a velocity-mode flight controller, a scripted leader (a drone or a walking figure) and onboard cameras. No brain in here: anything can fly it. |
| `sim/crazyflie/` | Bitcraze Crazyflie 2 model from [MuJoCo Menagerie](https://github.com/google-deepmind/mujoco_menagerie/tree/main/bitcraze_crazyflie_2) (MIT, see its LICENSE). One change: the moment gears are 100x larger so the attitude loop has real-drone authority. |
| `pilot.py` | The fly brain as the pilot, plus video recording with a small HUD. |
| `brainview.py` | The right half of the videos: all neurons at their real positions, lit when they spike. |
| `eyes.py` | From pixels to things in view. Hand-written, nothing learned, no simulator positions. |
| `follow.py` | Follows a leader by sight. |
| `learning.py`, `imprint.py`, `choose.py` | The dopamine rule, its bench test, and flying by what was learned. |
| `video_test.py` | Real footage through the follower's chain. |
| `gestures.py`, `reflex.py`, `swipe.py` | Hand gestures: with a trained readout, with none, and flying the drone. |
| `planner.py`, `readout_checks.py` | The ideas from [World-Sim](https://github.com/alextitonis/ai-model). |

## How the brain flies it

The visual front end is a model; everything after these neurons is the connectome (the same route as
`flybrain.FeatureDetectors`):

- the nearest fruit or the leader drives **LC10a** (the neurons a male uses to chase a target) on the side it is on
- something growing in view drives **LPLC2** (looming), and a pillar close ahead drives **LC4** (threat)
- a gust (a real force pushing the drone) drives the **Johnston's organ** wind sensors of the antenna it comes from
- hand motion drives **T4 and T5**, the fly's real motion neurons, at their place in the eye (worked out from the wiring)

The drone reads the brain's descending neurons:

- **DNa02** left vs right sets the yaw rate: it turns toward the side that fires more
- **MDN** (backward walking) brakes
- **DNp01** (the giant fiber, escape) triggers a climb burst: the fly's take-off jump. When following, it also stops moving forward.
- the **wind descending neurons** (DNg05_a, DNg06_a, DNg29, DNge016) left vs right turn it into the wind. Which side
  fires is the connectome's; reading it as "turn upwind" is our choice (flies orient upwind).

The drone cruises forward like a flying fly; DNg100 (forward walking) is silent in this model. Nothing in the code says
"fly to the fruit": the turn toward it comes from the connectome.

Measured 2026-10-18 (8 flies, 2 s each): a target on the left fires DNa02 L at ~4.4 Hz with DNa02 R silent, the mirror
on the right; looming fires DNp01 on that side at 10-25 Hz; wind on one antenna fires the wind DNs on that side at
6-12 Hz with the other side silent, half the wind about half the rate.

**No smell.** No descending neuron of this model answers food odour or vinegar (`wiz/dnscreen.py`, all 1,314 types).
A 2026-10-30 test on a listener brain confirmed it: no smell moved the drone's controls or changed a turn, and a decoder told
smells apart only 40% of the time. Only cVA, the fly's social scent, is detectable, and only through a trained decoder.

## Results (all 2026-10-30)

Pass rules were written down before each test, on fresh seeds.

### Following with no radio: 3 of 4 rules

The leader flies a scripted route with no physics. 8 seeds, 60 s each.

| Condition | Distance | Within 1 m | Crashes/min |
|---|---|---|---|
| Sees the leader | 0.97 m | 55% | 0.25 |
| Scrambled wiring | 1.39 m | 35% | 0 |
| Tracks the other drone | 1.84 m | 17% | 0 |
| Sees nothing | 2.14 m | 18% | 2.38 |

**Missed: within 1 m at least 60% of the time.** With exact positions instead of a camera (no distraction), the same test gave
0.79 m and 75%, and passed all four. The speed cap and the stop on DNp01 are our mapping.

### Learning who to follow: all rules passed

On the bench (`imprint.py`), all 5 rules passed: 100% of flies prefer the rewarded colour, 100% flip when the rewards swap,
random rewards give 63%, scrambled wiring 33%. A colour within about 40 degrees of hue reads as the same leader. That bench
resets the brain before every look. Left running, the Kenyon cells go all-or-nothing, so flight needs a quiet "blink" before
each look.

In flight (`choose.py`): 8 seeds, 60 s each, trained on A, on B, or not at all, 48 flights.

| | Rewarded picks | Flip in picks (95% interval) | Distance shift (95% interval) | Untrained picks A |
|---|---|---|---|---|
| Drones | 73% / 82% | 54 pts (43 to 65) | 0.57 m (0.35 to 0.79) | 52% |
| People | 91% / 93% | 84 pts (78 to 90) | 0.86 m (0.55 to 1.16) | 39% |

Rules: picks flip by 30+ points, distance shifts by 0.2+ m, at least 70% rewarded picks. Limits: following is loose (people,
trained on A: 1.23 m to A, 1.59 m to B); it stops about 47% of the time near people; drones crash about 0.4 times a minute;
each visual neuron's colour preference, the blink, the 2 V colour drive and the step from learned value to LC10a are ours, not the
wiring. No scrambled-wiring flights were run: the wiring comparison is the bench's.

### Real footage: works on a saturated colour only

One free clip from [Mixkit](https://mixkit.co/) each, played as the front camera, so nothing flies.

| Clip | Found | Result |
|---|---|---|
| Red dress, seen from behind | 100% of frames | Trained for red: picks her 100%, steers the right way 100%. Trained against red: picks her 6%. Mirrored: turns flip, right 99% |
| Pale blue outfit | 0% | Too washed out to count as a colour |
| Black jacket | 0% | No colour to read. Trained on red, it picked other red and orange things in the shot instead |

### Reflex gestures: all rules passed

Nothing trained: `DNg41` + `DNb03` on the right minus on the left. These neurons were picked from a screen of clean motion and
checked on earlier clips, so this test ran on fresh ones.

| Rendered hands | Left and right swipes turn the right way | Still hand turns anyway |
|---|---|---|
| Real wiring, new clips | **100%** | 20% |
| Real wiring, hands never seen | **100%** | 50% |
| Scrambled wiring, new clips | 45% | 65% |
| Scrambled wiring, hands never seen | 35% | 70% |

Scrambled wiring gives the same signal for every gesture, so the fly's wiring is what's doing this. On a real hand (one clip,
truth from the hand's own movement): 8 of 9 sideways moves right, 1 straight, none the wrong way. Mirrored: 7 of 9, 2 straight,
none wrong. **Limits:** it only tells left from right. Other gestures leak into it (swipe up reads as left 75% of the time, pull
50-65%), and on the real hand it turned in 15 of 31 windows with no sideways move, many of them up or down. Only the "new clips"
still-hand figure was in the rule.

In flight (`swipe.py`), the same signal sets the yaw of the drone in the 3D world. Rule: across 12 left and 12 right swipes, at
least 75% change the heading the right way, and at least 20 points better than scrambled wiring. **Passed:** all 23 scored swipes
turned the right way, 81 degrees on average, against 30% and -3 degrees on scrambled wiring (the last swipe ended the run before
it could be scored). The hand is rendered in that test; `swipe_real_hand.mp4` flies from a real clip, which isn't scored. The
signal is read over 0.6 s, so a turn carries on briefly after a swipe ends.

### Gestures through a trained readout: failed 3 of 4 rules

| Route | New clips | Hands never seen |
|---|---|---|
| Same motion data, no neurons | 89% | 68% |
| Pixels | 79% | 74% |
| Fly brain | 66% | 83% |
| Scrambled wiring | 68% | 77% |

Scrambled wiring does as well, so a trained readout can decode the signal through any tangle of neurons. A first design scored
20%. On a real hand it got 9 of 21 moving windows right (rule: 50%), trained only on rendered hands. It only sees motion: a still
pose like a fist is invisible to it.

### World-Sim's ideas

- **Planner vs fly:** not run yet.
- **Same neurons:** passes. Two readouts share 135x more top neurons than chance, so they aren't memorising.
- **Refuse the unfamiliar:** barely. It refuses 70% of unseen gestures, but also 28% of known ones, against the 10% it was set for.
- **Think less:** fails. It used 98% of the brain time, with no saving.
- **Notice a change:** catches a mirrored camera at once with no false alarms, but the short retrain reaches 54% against 66% before, missing by 2 points.
