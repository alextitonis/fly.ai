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

## Real drone later

`sim.DroneSim.step(forward, climb, yaw_rate)` is the same velocity-mode command a real Crazyflie (`cflib`) or DJI Tello
(`djitellopy`) takes, so `pilot.py`'s commands can be sent to hardware once the camera gives the same "things in view".
