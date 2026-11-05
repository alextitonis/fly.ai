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
| `python drone/novel.py --seed 7101` | Does it notice a colour it wasn't trained on? `--fly --train A --seed 7301` is the flight, firing events | bench several minutes, flight 1-2 min |
| `python drone/predict.py bench` / `fly --mode one_predict --seed 7601` | One camera: does the brain remember where the target went, and does a predictor on top help? `--mode one\|one_predict\|two\|two_predict\|four`, `--rewire`, `--out clip.mp4` records a video to post (drones only, no brain panel) | bench several minutes, flight 1-2 min |
| `python drone/avoid.py screen` / `run --mode turn --seed 7801` | Which neurons answer a pillar on one side; flying straight at a pillar. `--mode blind\|stop\|turn`, `--rewire` | several minutes each |
| `python drone/hear.py --seed 5051` | Sound on the bench: which ear channels drive what | about 12 min |
| `python drone/chirp.py fly --mode sound --seed 8951` / `codes --seed 9101` / `score` | Sound in flight (`--mode sound\|silent\|mirror`, `--rewire`, `--noise`), pulsed chirps on the bench, score the flight test | flight run 1-3 min, bench about 20 min |
| `python drone/fire.py clips --seed 9201` / `--dry` | Fire on real footage in `runs/clips/forest/`, with no colour step. Missed, see Results | about 10 min |
| `python drone/flame.py clips --folder forest_fresh2` | Flames or only flame-coloured, on real footage, no connectome. 2 of 3 rules, see Results | about 5 min |
| `python drone/smoke.py train` / `clips --folder smoke_test` / `heldout` | Smoke from the air on real footage, no connectome. See Results | about 5 min each |
| `python drone/chirp.py alert --seed 9411` | Recognising an alert with no known start, on the bench. 2 of 3 rules, see Results | about 15 min |
| `python drone/light.py --seed 9700 --dev` | How far a blinking light can be read by camera. **Not finished, no results yet** | slow |
| `python drone/forest.py picture --seed 9301` / `fly --seed 9301` / `score` | The 3D forest with a fire: stills, one patrol (`--out clip.mp4`, `--rewire`, `--no-fire`, `--decoys`, `--cameras`, and not yet flown `--big`, `--real-fire`), score a test (`--test first\|search\|fire`). First test passed, with limits, see Results | flight up to about 6 min, `--big --seconds 480` over 12 min |
| `python drone/readout_checks.py` | World-Sim's readout checks (after `gestures.py measure`) | about 10 min |
| `python drone/planner.py ...` | World-Sim's planner against the fly. Failed its rule, see Results | see below |

## How to train it more

The connectome's own wiring never changes. Everything that learns sits on top of it, and each has its own way to improve:

| What | How to give it more | Notes |
|---|---|---|
| **Who to follow** | `TRAIN_ROUNDS` in `choose.py` (12 per colour) | Training takes seconds and happens at the start of every run: nothing is saved yet. To teach new colours, change `SHIRTS` or `BEACONS` in `sim/world.py`, or `--train` and `--against` in `video_test.py`. Reward is `+1`, punishment `-1`, in `teach()`. |
| **Gesture readout** | `gestures.py measure --train 60` (clips per gesture); `record --takes 12`, then `measure --clips drone/runs/my_hand` | So far only trained on rendered hands. Your own recordings are the obvious next step. |
| **Reflex gestures** | Nothing to train | You can change which neurons are read (`TYPES`), the lean at rest (`OFFSET`) and the dead zone (`DEAD`) in `reflex.py`. |
| **The planner** | `collect` more flights, then `fit` again | `python drone/planner.py collect --kind fly --minutes 8 --seed 1 --out data/fly1.npz`, then `fit --kind fly --data "data/fly*.npz" --out data/fly.pt`, then `fly --policy flyplan --model data/fly.pt`. `--kind raw` and `--policy raw` is the same with no fly. For the fly with a planner stepping in: `collect --kind hybrid --route dna02 --nudge 0.6`, then `fly --policy hybrid --route dna02 --nudge 0.6 --margin 0.1 --model ...`. |

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
- **One camera, maybe two:** that's what real drones have, so it's what this is now designed for. A front camera loses the leader as soon as it
  leaves the view, so these flights need a predictor on top (`predict.py`, see Results). `eyes.use_cameras()` and `predict.py --mode` set the layout; `follow.py` and
  `choose.py` still use all four.
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
| `events.py` | Hooks: run your own code on `new_colour`, `target_lost`, `obstacle_ahead`, `crash` and others. |
| `novel.py`, `predict.py`, `avoid.py` | New colours, one camera with prediction, obstacles. |
| `hear.py`, `chirp.py` | Sound on the bench; sound in flight and pulsed chirps. |
| `fire.py` | Fire on real footage through the motion route. |
| `flame.py` | Our own camera step: flames or only flame-coloured. |
| `smoke.py` | Our own camera step from the air: is that a fire's smoke? |
| `light.py` | Reading another drone's blinking light by camera. Not finished. |
| `forest.py` | A 3D forest with a fire, and a patrol through it with no outside connection. |
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

## Results (2026-10-30 unless dated)

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

### Sound between drones: the bench, one command so far

`hear.py`, no flying, rules at the top of the file. Four ear channels, left or right antenna, three loudnesses, on seeds 5051 and 5052.
The microphone side is ours and hasn't been built.

| Rule | Result |
|---|---|
| Come here (turn toward the sound) | Passes on JO-E at 0.4 and 0.8 V on both seeds, 94-100% the right way. Yaw grows with loudness. |
| Tell channels apart (decoder, 9 classes) | Misses: 74% both seeds, but only 19 and 13 points over scrambled wiring, and the rule is 20. |
| Alarm (jump) | Misses on every channel. |
| Stop (brake) | Misses on every channel. |
| Sound reaches dopamine | Misses at 2 ms. A rise on JO-C didn't repeat with 16 flies a side on a fresh seed (-2.4 Hz, z -0.9; resting flies vary from 10 to 37 Hz). At 20 ms it can't be tested: PAM rests at the 50 Hz ceiling. |

The turn runs through the wind neurons, whose meaning as "turn" is our choice, not through DNa02. JO-E also senses wind in a real fly, so
this is closer to feeling a puff from one side than to hearing. The fly's real sound neurons, JO-A and JO-B, didn't turn it. Scrambled
wiring is a weak control for jump and stop here: it brakes in nearly every fly with no sound at all, and jumps in 13-100%. So passing
on a learned colour by sound can't rest on this wiring alone; only steady tones on these channels were tried, but for now the step from
hearing to dopamine would have to be ours.

### Sound in flight: "come here" passed all three rules (2026-11-01)

`chirp.py`. The brain gets only sound: another drone hovers 1.5-2.5 m away at any bearing and chirps, and the drone has to reach it. Rules are at the top of `chirp.py`, seeds 9001-9004, 15 trials each, constants left as they were after development (`python drone/chirp.py score`):

| Mode | Reached it | First turn the right way | Stopped |
|---|---|---|---|
| Sound | 63% | 94% | 0% |
| Speaker off | 13% | 46% | 0% |
| Mics swapped | 0% | 3% | 0% |
| Sound, scrambled wiring | 0% | 60% | 81% |

| Rule | Needed | Result (95% interval) | |
|---|---|---|---|
| Reaches | at least 60%, 40 points over silent | 63%, +50 points (+35 to +65) | Pass |
| Mirror | at least 20 points over swapped mics | +63 points (+52 to +75) | Pass |
| Wiring | first turn at least 20 points over scrambled | +34 points (+17 to +51) | Pass |

Limits: 63% only just clears its rule. The microphone is ours and is a model, and its propeller noise hasn't been measured on real hardware, so a real speaker against real propellers may do much worse. The turn runs through the wind neurons, whose meaning as "turn" is our choice, and JO-E also senses wind in a real fly, so this is closer to feeling a puff than to hearing. The other drone hovers rather than moving, and this is one command, not data. Scrambled wiring can't reach anything because it brakes 81% of the time, which is why that rule scores the first turn.

**Repeated on the bench's brain (2026-11-01).** The run above used `sensory_input=True`, while `hear.py`'s bench uses `False`. Same constants and rules on seeds 9021-9024, folder `runs/chirp/test_nosensory` (`python drone/chirp.py score --folder test_nosensory --first-seed 9021`), and all three rules pass by more: reached 92% (87-93% per seed), speaker off 5%, mics swapped 2%, first turn right 98% against 48% on scrambled wiring, which stopped 59% of the time. From behind (150-180 degrees) it reached 80% of 10 trials, against 38% on the first run. The noise levels in `runs/chirp/noise/` are sound only on the old brain, 77, 70, 50 and 40% at 0, 0.1, 0.2 and 0.4 V (seeds 9011-9012; 0.8 V never finished), and haven't been redone.

### Pulsed chirps on the bench: timing gets through, alarm and stop don't (2026-11-01)

`python drone/chirp.py codes --seed 9101`, repeated on 9102, 16 flies per condition, `NUMBA_NUM_THREADS=2`; rules at the top of `chirp.py`, decoder settings checked on seed 9100 and left alone.

| | Needed | 9101 | 9102 | |
|---|---|---|---|---|
| Names the pattern from 20 ms bins | at least 40%, 15 points over scrambled and over counts only | 71% (scrambled 27%, counts only 42%) | 73% (scrambled 30%, counts only 36%) | Pass |
| Bits per chirp, 36 messages | at least 2, 0.5 over scrambled | 3.2 (scrambled 1.6) | 3.3 (scrambled 1.6) | Pass |
| Alarm or stop | jump or brake in 75% of flies | none | none | Miss |

This goes against `flytalk.py`, which found the listener ignores timing. Limits: pulses start at the same moment in every trial, which a real listener wouldn't get, so this is the easy case. Small samples push bits up on both sides, so the 1.6 extra matters more than the 3.2. A plain microphone reads all 36 messages with no brain, so this says what the brain lets through, not that it's a better way to send data. Scrambled wiring's silence already jumps and brakes, so it isn't a clean control for those two.

### Recognising an alert with no known start: 2 of 3 rules, both seeds (2026-11-02)

`python drone/chirp.py alert --seed 9411`, repeated on 9412, 16 flies per condition, two runs each. Pulses begin at a random moment for each fly, with propeller noise on the ear neurons. The alert is 10 Hz, picked before running, against four other patterns and silence. The decoder is ours, trained on one run and scored on the other. Rules at the top of `chirp.py`, at 0.4 V:

| Rule | Needed | 9411 | 9412 | |
|---|---|---|---|---|
| HEARS | at least 75% of alerts, at most 10% false | 91%, 3% | 100%, 4% | Pass |
| WIRING | balanced score 15 points over scrambled | 94 against 50 | 98 against 53 | Pass |
| TIMING | 15 points over spike counts alone | +12 | +13 | **Miss** |

So the real wiring carries a recognisable alert and scrambled wiring doesn't, at a random start. Limits: at 0.2 V it mostly fails (28-38% caught), so range is short: on this model's 1/distance loudness, 0.4 V is 2.5 m, while the speaker's real loudness is unmeasured. Counts alone already reach 82-85%, since this alert is on 40% of the time and the others about 50% or 100%, so much of this isn't timing. A plain filter on the microphone scores 100% at every level, so the brain doesn't make this signal easier to read: it only earns its place if the drone acts on the alert through its own wiring, and no such reflex has turned up (alarm and stop both missed).

### Fire on real footage, motion through the brain: missed (2026-11-01)

`python drone/fire.py clips --seed 9201`: grey footage -> motion model -> T4/T5 -> connectome -> a ridge readout on the descending neurons, 49 clips, 34 shoots, leave one shoot out. Rules at the top of `fire.py`. The repeat on 9202 was stopped for low memory, and with these misses it can't change the result.

| Rule | Needed | Result | |
|---|---|---|---|
| Detect | area under the curve at least 0.80 | 0.47 (0.27 to 0.69), chance is 0.5 | Miss |
| Wiring | 0.10 over scrambled | +0.03, scrambled 0.44 | Miss |
| Colour | 0.05 over share of fire-coloured pixels | colour alone 0.49 | Miss |
| Movement | 0.05 over how much the picture changes | that measure scores 0.35 | Pass, but empty: 0.35 means it points the other way |
| Tricky clips | at most 3 of 8 called fire | 6 of 8 | Miss |

The same readout with no neurons in between scored 0.54, so the motion model itself carries little here. Looked at afterwards, so not a result: ground-level flames against not-fire score brain 0.72, colour 0.70, picture change 0.74, so the brain adds nothing to plain change, while smoke (0.49) and aerial fire (0.29) get nothing. Fire colour alone can't separate flames from autumn leaves: 0.35, leaves have more of it. About 50 clips, with fire and no-fire footage from different cameras and places, also limits this.

### Telling flames from flame-coloured things: 2 of 3 rules on the second try (2026-11-01)

`flame.py`, our own camera step with nothing of the connectome in it, on real footage at the drone's camera size. A patch is flame if at least 60 pixels, its brightness swings as a whole (COARSE at least 0.20, blurred over 9 pixels) and it doesn't stay put (KEEP under 0.65). Pixel-level flicker doesn't work: leaves score as high as flames.

| Test | Fire clips called | Not-fire clips called | Fewer than colour alone | Result |
|---|---|---|---|---|
| First, cutoffs from the old clips only, `forest_fresh` | 14 of 15 (rule 11) | **9 of 20 (rule 2)** | 7 (rule 3) | **Missed on false alarms**, mostly small side patches |
| Second, cutoffs retuned on all of the above, `forest_fresh2` | **5 of 10 (rule 6)** | 1 of 16 (rule 3) | 10 (rule 3) | **Missed narrowly on catching fires**, the other two pass |

So on a single look it is rarely fooled and finds about half of real fires. It misses big saturated fires, whose brightness hardly changes once blurred, and glowing coals; one fire clip shows smoke with no flames in view. No third set was run, since retuning until a set passes wouldn't mean much.

It reads flames from close up only: in the simulated forest COARSE passes at about 3 m and falls away beyond it, so the patrol stops and looks from afar only to rule out still things (KEEP), then flies up for the look that decides. It doesn't handle smoke, and it finds nothing from the air: only 1 of 15 aerial fire clips even has flame colours. A real patrol would need a heat camera or a smoke step.

### Smoke from the air: 2 of 3 rules (2026-11-02)

`smoke.py`, our own camera step with nothing of the connectome in it, for a patrol above the forest. MobileNet V3 small with ImageNet weights, and a logistic regression on top trained on aerial footage. Test on 44 clips picked by title and not looked at, 16 fire and 28 not-fire, many of those fog, mist, cloud or snow. Rules are at the top of `smoke.py`.

| Rule | Needed | Result, without overlapping shoots | |
|---|---|---|---|
| CATCH | at least 12 of 16 fires | 10 | **Miss** |
| FALSE | at most 3 of 28 not-fire | 0 | Pass |
| BEATS | area under the curve 0.10 over pale-and-soft | 0.91 against 0.45 | Pass |

As first run it scored 13 of 16, 2 of 28, and passed all three, but 14 of the 16 test fires sat next to a shoot in training. The table is the same settings retrained without the 18 nearby clips. Those shoots are matched by id, so some overlap may remain. It takes about 12 ms a frame on this CPU. At the drone's 128 x 96 pictures, on the first model only, it called 10 of 16 and 0 of 28, area 0.92.

Limits of that test: only 16 fire clips were left to train on, and it missed about a third of fires.

**Second test, more footage: both rules passed.** `python drone/smoke.py heldout`, rules fixed before its clips were downloaded, settings unchanged. 140 new clips, 60 fire and 80 not-fire. Each shoot is held out in turn, with shoots matched across every folder, and the model trains on all the others.

| Rule | Needed | Result (95% interval over shoots) | |
|---|---|---|---|
| CATCH | at least 75% of fire clips | 82% (61 to 94%) | Pass |
| FALSE | at most 10% of not-fire clips | 6% (1 to 12%) | Pass |

Area under the curve 0.96 (0.92 to 0.99). The fire clips come from only 16 shoots, and counting each shoot once the catch rate is 67%, so a new fire is closer to two in three than the headline suggests. A cutoff of 0.4 gives 90% caught and 10% false, but that was read off this same test.

Limits: stock footage, mostly daylight, labelled by title and not checked frame by frame. Its fires are well framed, and it has never seen a real drone's camera. It doesn't read the simulator's smoke at all: 0 of 24 views with a fire called from patrol height.

### 3D forest patrol: all three rules passed, but barely any searching (2026-11-01)

`forest.py`: 16 x 16 m of birch trees and a flickering fire with smoke, placed by the seed. The drone walks a route by dead reckoning from its own commands, with no GPS, and has two forward cameras angled 45 degrees out. Rules are at the top of `forest.py`. Test on seeds 9311-9318, `sensory_input=False`, `NUMBA_NUM_THREADS=2`, results in `runs/forest/test/`, score with `python drone/forest.py score`.

| Rule | Needed | Real wiring | Scrambled wiring |
|---|---|---|---|
| FINDS: stops truly within 4.5 m of the fire | at least 6 of 8 | **8 of 8**, 2.4-3.1 m away, after 25-70 s | 0 of 8 |
| WIRING: seeds found beyond scrambled | at least 4 | **8** | |
| CRASHES | at most 0.5 a minute | **0**, over all 8 | 1, over 32 minutes |

What this doesn't show:
- **It hardly searched.** On all 8 real flights the drone sighted the fire before it finished its first patrol leg (first sighting at 0.1-21.7 s, 4 of them within 1.5 s), so this is steering to a fire and missing trees, not finding one by searching a forest. The forest is small for how far the fire shows. A real search test needs a bigger forest or a fire out of sight of the start, with a new rule and fresh seeds.
- **It says nothing about telling fire from not-fire.** The fire is found by a colour step of ours, in a world with nothing else that colour.
- Scrambled wiring saw the fire on all 8 seeds and never came within 8.6 m of it, so the control is about steering. It also spent 16-81% of its time stopped.
- **It doesn't really hold at the fire.** A test flight ends 0.5 s after it stops. Filmed with a 6 s hold, seed 9318 drifted from 2.88 m to 1.72 m of the fire.

The film shows more than the drone sees: bark, leaves, undergrowth and its own flames are drawn only for the film camera, and real shadows are off there. The drone's cameras are unchanged: with and without the scenery their pixels match exactly, and `real9318` re-flown gives the same JSON as the test. The panel in the film shows what the cameras really see, plain white trunks and all.

**Built after this test, not flown yet, so there are no results:** the stop that stays stopped, a 30 x 30 m forest that forces a search, and the stop-and-look step using `flame.py` with autumn trees as decoys. Draft rules are at the top of `forest.py`. That code has only been checked to parse. `runs/forest/preview9318.mp4` is from before all of it, so it still shows the drift.

Development flights, seeds 9301-9304: an earlier setup found the fire on all 4 but crashed about 1.25 times a minute against a limit of 0.5, and the first two-camera runs about 1.6. Most head-on hits came from a bug in the world, now fixed: the camera's near cut grows with the size of the world, which hid any trunk closer than about 0.5 m. Re-flown after the fix, seed 9304 went from 5 crashes to 0, and 9301 had 0.

What's ours: the route, stopping at the fire, and finding the fire, which for now is only flame-coloured pixels. Autumn-leaf decoys stay off until a real detection step exists, so this flight says nothing about telling fire from not-fire. The turns are the connectome's. Trunks are pale, glow slightly and are all one width, which real trees aren't.

### Autonomous patrol with GPS, dock and charging: works end to end in the sim, dev seed only (2026-11-05)

`autonomy/` is a package of modules behind interfaces (`autonomy/__init__.py` lists them). The mission takes off from the dock, flies a lawnmower route 6.5 m above the trees, reports what it finds, heads home when the battery says so, finds the pad, lands, charges, and picks the route up where it stopped. GPS is the main position source; the drone's own motion sensing (optical flow + IMU + magnetometer) fills the gaps and takes over when GPS is gone.

    python -m autonomy.run_sim --seed 9900 --minutes 10                  # from drone/: plain steering, GPS on
    python -m autonomy.run_sim --seed 9900 --minutes 5 --steer brain     # the connectome turns
    python -m autonomy.run_sim --seed 9900 --minutes 10 --no-gps         # or --gps-lost-at 120

Dev seed 9900 only, no rules fixed yet. 10 min, battery shortened to 4 min of flight and 2 min of charging so a run goes through two charges:

| | GPS | no GPS |
|---|---|---|
| position error, median / max | 1.0 / 3.1 m | 2.2 / 4.9 m |
| finds' position error | 1.3 m | 2.3 m |
| found (fire, people, animals) | 1/1, 2/2, 4/4 | 1/1, 2/2, 3/4 |
| charges, touchdowns retried | 2, 1 | 2, 3 |
| lowest battery | 10% | 7% |

Brain steering, 5 min with GPS: same route, everything found, 0.9 m median error, docked first time. Plain steering runs 13x real time, brain steering 3.6x (2 threads). The table above is from before the fixes below; dev-seed numbers with GPS barely changed.

What's ours and what's the connectome's: the brain turns toward the waypoint (bearing on LC10a, yaw from DNa02), as in forest.py. Everything else is ours: the route, the Kalman filter, the energy rule, the pad search and landing, the reporter. **Detection and pad-finding in the sim are stand-ins** that read the world's own lists (`SimTruthDetector`, `SimPadFinder`), so a run shows the behaviour around detection, not that detection works; `SmokeDetector` (smoke.py) and `ArucoPadFinder` are the real ones and haven't flown. Bugs found on the way: two people 5.9 m apart merged into one find (merge distance now per kind); with a white-noise-only motion sensor no-GPS looked as good as GPS (now an 8% wandering scale error and a wandering bias, as flow over uneven treetops has); without GPS it came down at the wrong spot and could never see the pad (now it searches from height and descends only with the pad in view); the battery could run below empty (now an emergency landing, and an empty battery counts as a failure).

**Tests on fresh seeds (2026-11-05), rules in `autonomy/run_sim.py`:**
- **Test 1, seeds 9911-9918: 2 of 5 rules.** With GPS everything passed: 8 of 8 runs did both charges, 96% of targets found, 0 false finds, 1.27 m median error. Without GPS, and with GPS lost at 120 s, 14 of 16 runs drifted 4 m or more past the patrol edge and out of the sim world, so SAFE and CYCLE missed. GPS_HELPS missed only because those runs ended early.
- **Fixes, on dev seed 9900:** a geofence (waypoints pulled in by 3 sigma + 1 m), home at 4 m of position uncertainty, uncertainty that grows faster (it had claimed about 4 m while really 7.5 m off), the pad search climbs to 12 m before searching sideways (a 0.6 m marker reads to about 12.8 m), and an 8 m fence buffer. A real geofence needs a buffer bigger than the worst position error.
- **Test 3, seeds 9931-9938: not complete** (g9938 not run). SAFE has already missed. With GPS, 7 of 7 runs were clean: two charges each, 1.1-1.4 m error, 0 false finds. With GPS lost at 120 s, 7 of 8 were clean, covering 93-100%. Without GPS, 4 of 8 failed: twice it landed in the trees when the battery went flat, one of those counted as a crash, and once the battery ran out. Each time its home estimate was further off than the camera sees from 12 m, so it searched for the pad until the battery was nearly flat (n9932 searched for 146 s, from 65% to 3%). Next: cap the pad search by battery, and give the dock something seen from far off (a light), then new seeds.
- **Takeaway:** GPS makes this patrol work. GPS lost mid-patrol is mostly survivable. No GPS at all isn't yet: own-motion over a canopy drifts 4-12 m within a few minutes.

**Real hardware:** implement `core.py`'s classes for the drone (for PX4/ArduPilot over MAVLink: velocity setpoints in the body frame for `Vehicle`, `GPS_RAW_INT` through `geo.HomeFrame` for `GpsSensor`, `OPTICAL_FLOW` + `ATTITUDE` for `MotionSensor`, `SYS_STATUS` for `Battery`, the charger's contact signal for `Dock`) and hand them to `Mission` with the same localizer, route, steerer and detectors. A Crazyflie is too small and short-lived (about 7 min) for a forest; a 5-inch or larger frame with GPS is the realistic target.

**Speed and Rust:** a brain step is 5.7 ms, 4 ms of it spreading spikes (about 7,500 neurons fire per step, about 150 synapses each). That loop is already compiled (numba), parallel and 32-bit, and it's limited by memory, so Rust would gain little here at the same thread count. Rust is worth it for running on the drone itself (no Python on a small onboard computer), porting the same interfaces.

### Noticing a colour it wasn't trained on: all rules passed (2026-10-31)

`novel.py`. A second set of weights at the Kenyon-cell output stores each trained look with no reward attached, and a look that overlaps
little reads as new. Those weights are ours, like `learning.py`; which Kenyon cells a colour reaches is the connectome's. Each finished
look sends a hook event (`events.py`): `new_colour`, `trained_colour` or `avoid_colour`.

| Test | Colours 60+ degrees off read as new | Trained colour reads as new |
|---|---|---|
| Bench, real wiring, seed 7101, one or two trained colours | 100% | 0% |
| Bench, scrambled wiring | 57-69% | 50-54% |
| Flight, seeds 7301-7304, 60 s, trained on A or B | 100% (41 looks) | 2% (1 of 47) |

Rules: at least 90% and at most 10%; on the bench it also names trained colours right 100% of the time (rule 90%), and beats scrambled wiring. **Limits:** 30 degrees off
is close to a coin flip on the bench (65-68% new), so close shades aren't separate. The flight data is nearly all the green beacon: only 5 of 88 finished looks were
pink, and the one miss was one of just 2 looks at pink when trained on pink. Finished looks are few, 5-18 a minute, and the bench and flight cutoffs differ (0.8 and 0.55). Only those two colours
were met in the air, and the eyes only find saturated colours.

### One camera: the brain doesn't remember, a predictor on top helps (2026-10-31)

`predict.py`. On the bench, after a target vanishes, a decoder on all neurons names its side 99% of the time in the first 0.1 s, 60% by 0.25 s and 53-66% after that
(scrambled 52-59%). DNa02 leans the right way 51% at 0.5-1 s. **Both bench rules missed:** the connectome holds it for about 0.25 s.

`Tracker` is ours, not the fly's. It works out its own movement from the commands the brain just gave, and keeps driving LC10a with the predicted bearing, or a steady scan
to one side, so the turn still comes through the connectome. Seeds 7601-7608, 60 s each:

| Mode | Distance | Within 1 m | Target in view | Crashes per flight |
|---|---|---|---|---|
| Four cameras | 1.02 m | 55% | 90% | 0.4 |
| One camera | 1.86 m | 32% | 31% | 2.5 |
| One camera + prediction | 1.31 m | 49% | 58% | 0.9 |
| The same, scrambled wiring | 1.38 m | 33% | 18% | 0 |

| Rule | Result |
|---|---|
| In view at least 1.25x | **Passed:** 1.85x, gain 0.19 to 0.35 |
| Distance at least 20% lower | **Passed:** 30% lower, 0.28 to 0.87 m |
| Bearing error in the first second at most 0.7x holding the last bearing | **Missed:** 0.717x |
| At least 0.2 m closer than scrambled wiring | **Missed:** 0.08 m, -0.14 to 0.29. Scrambled wiring is stopped 71% of the time, so it doesn't drift far |

Predicting the target's own motion adds almost nothing over tracking only the drone's own (error 0.206 against 0.219 rad): the gain comes from knowing how it turned, then
scanning. Past 1 s the guess is poor (median 2.3 rad): at 0.45 m/s the target has really gone. The tracker's distance comes from the beacon's known size, and all of this is the simulator's clean pictures.

### One or two cameras as the real setup: all four rules passed (2026-10-31)

Two cameras are front and back. Rules are in `predict.py`, fixed before running, on seeds 8001-8008, 60 s each, 40 flights at `NUMBA_NUM_THREADS=2`:

| Setup | Within 1 m | Target in view | Distance | Crashes per flight |
|---|---|---|---|---|
| Two cameras + prediction | 56% | 78% | 0.99 m | 0.1 |
| One camera + prediction | 52% | 61% | 1.45 m | 0.9 |
| Four cameras, no prediction | 49% | 89% | 1.01 m | 0.4 |
| Two cameras, no prediction | 29% | 42% | 1.81 m | 2.5 |
| One camera + prediction, scrambled wiring | 27% | 17% | 1.49 m | 0.1 |

| Rule | Needed | Result (95% interval) | |
|---|---|---|---|
| One camera close to four, within 1 m | at most 10 points below | +2.6 points (-5.1 to +11.5) | Pass |
| Two cameras close to four, within 1 m | at most 10 points below | +6.8 points (-0.5 to +13.3) | Pass |
| Two cameras add over one, in view | at least 15 points, interval above 0 | +17.3 points (+3.9 to +29.2) | Pass |
| One camera over scrambled wiring, in view | at least 20 points, interval above 0 | +44.2 points (+32.4 to +56.8) | Pass |

Limits: the comparison passes partly because four cameras are only at 49% themselves, and none of these setups reach the 60% follower rule. Four cameras still keep the target in view most. Two
cameras without prediction do worst of the real-wiring setups and crash most, so the prediction is doing the work, and it's ours, not the connectome's. Scrambled wiring is stopped 81% of the time.
The same seed repeats exactly at the same thread count and flies differently at another (one camera on seed 8001: 38% in view at 2 threads, 70% at 3), so a single flight says little. These flights
have a leader and a distraction but only this one job: learned choice and obstacle avoidance haven't been tried on one or two cameras. Score with `python drone/runs/predict/cams/score.py`.

**The bench's brain doesn't help following (2026-11-02).** Sound did far better on `sensory_input=False`, so the same one- and two-camera flights ran on both brains, nothing retuned, seeds 9501-9508, 60 s each (`runs/predict/sensory/`). Rules at the top of `predict.py`.

| Setup | Within 1 m | In view | Distance | Stopped | Crashes per flight |
|---|---|---|---|---|---|
| One camera, default brain | 50% | 55% | 1.41 m | 16% | 1.5 |
| One camera, bench's brain | 51% | 57% | 1.43 m | 21% | 1.1 |
| Two cameras, default brain | 61% | 80% | 0.94 m | 22% | 0.1 |
| Two cameras, bench's brain | 50% | 74% | 1.10 m | 25% | 0 |

CLOSER misses (+0.6 points, -6.1 to +7.7), STOPS misses (5 points more stopping, not less), CRASHES passes (9 against 12). So following stays on the default brain. Two cameras on it reached 61% within 1 m here, reported only, on these fresh seeds.

### Avoiding obstacles: hits nearly gone, but it stalls (2026-11-01, 2 of 3 rules)

`avoid.py`. Without this, nothing turns it from a pillar: a close one fires DNp01, which stops it. The screen (nothing trained, seeds 7401-7402) found DNg01, DNa07 and DNae004 fire
more on the side away from a pillar, on both seeds, which would turn it away if read like DNa02. Reading them that way is ours.

Rules are in `avoid.py`, seeds 7801-7804, 15 trials each, aimed at a pillar 1.5 m ahead (`runs/avoid/test/score.py`):

| Mode | Hit | Passed | Stalled | Closest (median) |
|---|---|---|---|---|
| Blind to pillars | 30% | 58% | 12% | 0.15 m |
| Stop (DNp01 only) | 17% | 38% | 45% | 0.23 m |
| Turn | 2% | 45% | 53% | 0.43 m |
| Turn, scrambled wiring | 0% | 0% | 100% | 1.24 m |

| Rule | Needed | Result (95% interval) | |
|---|---|---|---|
| Avoids | hits at most 0.5x blind, interval above 0 | 0.06x, 28 points fewer (+17 to +42) | Pass |
| Beats stop | passes at least 20 points over stop | +7 points (-12 to +23) | Miss |
| Wiring | passes at least 20 points over scrambled | +45 points (+33 to +58) | Pass |

Turning almost ends the hits, but it doesn't get past the pillar more often than plain stopping. **Corrected 2026-11-02:** this originally said over half the trials hold still for the full 8 s. Logged on dev seeds, a "stalled" trial is stopped only about 12% of the time: it dodges, turns about 3.8 rad, and wanders near the pillar without crossing the line, since nothing gives it a reason to go on. Blind still passes most because it just flies on.
So this is a safe drone, not yet one that goes around things. The wiring rule is a weak control: scrambled wiring never moves in these trials, so it can't hit or pass.

**With a destination: 1 of 3 rules (2026-11-02).** A goal 2.5 m past the pillar, through LC10a, dropped while a pillar is within 0.8 m ahead, and 2 s after a jump before DNp01 can stop it again, all ours. Settings from dev seeds, where it passed 73% and hit 17%. On fresh seeds 9601-9604, 15 trials each (`runs/avoid/test2/`):

| Mode, all with the goal | Hit | Passed | Neither |
|---|---|---|---|
| Turn | 37% | 48% | 15% |
| Same, turning neurons not read | 62% | 37% | 2% |
| Blind to pillars | 52% | 48% | 0% |
| Turn, scrambled wiring | 3% | 3% | 93% |

GETS_PAST misses (48%, rule 60; +12 points over not turning, -5 to +28). SAFE misses (37%, rule 25; 15 fewer than blind, -3 to +32). WIRING passes (+45). A goal does end the wandering, but on a head-on approach these neurons make at best a small difference. Hits in this test are head-on by design, and it's the same test as above, so forest flights with few trees dead ahead aren't contradicted.

Free flights among pillars can't answer this: on development seeds it rarely hits one even blind, since it trails a leader who keeps clear. Those runs hint that the stop has a
cost: with 16 pillars it's stopped 45-52% of the time when it sees them and 17-20% blind, and within 1 m 32-46% against 62-78%. That's two seeds, not a tested result. Pillars are found
only because they're pale and upright with a known width, so other obstacles would go unseen.

### World-Sim's ideas

- **Planner vs fly:** fails, and the fly adds nothing to the planner. Eight fresh seeds, 60 s each, eating fruit among pillars (rule: `flyplan` at least 1.15x `fly`, paired by seed, 95% bootstrap interval above 0). `flyplan` got 0.86x with an interval of -2.25 to +1.38 fruit a minute, 3 seeds won and 5 lost, so no sign it helps or harms. The planner with no fly beat it 7 seeds to 1. It got stuck turning left on seed 304, and the early 8-12 fruit a minute dropped to 6.9 over all the seeds. The fly model was trained once on 48 minutes of flight, with nothing held out to check it, and its loss rose late in training, so this tests this planner, not every possible one.

  | Pilot | Fruit a minute | Crashes a minute |
  |---|---|---|
  | `fly` | 4.4 | 2.0 |
  | `flyplan` | 3.8 | 1.8 |
  | `raw` | 6.9 | 0.6 |

- **Fly plus planner stepping in (`hybrid`):** misses its rule, but crashes fell a lot. The fly flies, and a planner reading exact positions nudges DNa02 only when a move looks better than doing nothing by the margin. Route and margin (DNa02, 0.1) were picked on spare seeds 902-905, then tested once on fresh seeds 401-408 (rule: at least 1.15x `fly`'s fruit, interval above 0, crashes no more than `fly`). Fruit reached 1.16x, but the interval was -0.88 to +2.0, so it isn't shown. Crashes fell from 1.9 to 0.25 a minute, better or equal on every seed (7 better, 1 tied), stepping in 7% of the time. The rule didn't ask about crashes alone, though the spare seeds showed the same drop (1.0 to 0.25). `raw` still ate more (7.25, 7 seeds to 0, 1 tied), so the second rule, beating `raw`, misses too. Exact positions aren't available on a real drone, so this is a best case. Pushing on DNa02 is also close to the motor output: LC10a, through the wiring, saturates near 0.35 rad/s and at this margin never stepped in.

  | Pilot | Fruit a minute | Crashes a minute | Planner steps in |
  |---|---|---|---|
  | `fly` | 3.9 | 1.9 | never |
  | `hybrid` | 4.5 | 0.25 | 7% |
  | `raw` | 7.25 | 0.6 | 80% (flies itself) |
- **Same neurons:** passes. Two readouts share 135x more top neurons than chance, so they aren't memorising.
- **Refuse the unfamiliar:** barely. It refuses 70% of unseen gestures, but also 28% of known ones, against the 10% it was set for.
- **Think less:** fails. It used 98% of the brain time, with no saving.
- **Notice a change:** catches a mirrored camera at once with no false alarms, but the short retrain reaches 54% against 66% before, missing by 2 points.
