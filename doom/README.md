# Doom on a fruit fly brain

The fruit fly connectome (MaleCNS v1.0, 166,700 neurons, from `flybrain`) is both the screen and the player for
[Freedoom](https://freedoom.github.io/), the free Doom-engine game, running headless in
[ViZDoom](https://github.com/Farama-Foundation/ViZDoom). Nothing is trained.

```bash
pip install vizdoom                                  # once; ships Freedoom 1 + 2
python doom/play.py run  --seeds 1-5                 # play, print kills per game
python doom/play.py clip --seed 1 --max 20           # film one game -> doom/videos/center-seed1.mp4
python doom/play.py run  --seeds 1-5 --mode blind    # control: no monster input
```

Headless and silent: no window, no sound. Levels: `--level center` (ViZDoom's arena: turn and shoot, monsters
come from all sides, the default), `corridor`, `map01` (Freedoom: Phase 2), `e1m1` (Freedoom: Phase 1).

## The brain is the screen

Like "Doom on gut bacteria", the game is computed on a normal PC and living-style cells are the pixels. Here the
pixels are the fly's own photoreceptors, and nothing in the clip is Doom's own picture:

- Every frame goes in through the fly's 6,006 photoreceptors (R1-6, R7, R8). Each sits at its real hex column in
  its eye, from the MaleCNS optic-column table (`eye.py`); the left eye sees the left half of the screen, the
  right eye the right half. Each column sees the brightness of the patch it looks at (about 4x4 Doom pixels),
  contrast-equalised per frame like an eye adapting to the light.
- The top of the clip is drawn only from those photoreceptors firing: one hex tile per column (about 1,430),
  lit by its spike rate. The rate is divided by what the column fires on a plain grey screen, because the fly's
  own wiring makes the eye's rim fire more (a flat-field correction, `eye.flat_field`).
- The bottom is the brain in 3D, every neuron with a position glowing when it fires, with the same columns
  painted on the lamina, the first layer behind the eye. Only 294 of the 1,764 column L1 neurons have a position
  in the data; every other column takes the distance-weighted mean of its 6 nearest (`eye.lamina_xyz`).

It is the resolution a fly really has: you see the sky, the walls, the floor and movement, not crisp sprites.

## The brain is also the player (`fly.py`)

- **Turning:** monsters go to LC10a, the visual neurons a male fly uses to chase a target, on the side they are
  on. LC10a drives the steering descending neurons DNa02, DNg111, DNae002 on the same side; left minus right turns
  the player. A fly sees nearly all the way round (about 330 degrees), so monsters off the side of Doom's
  90-degree screen count too, except in the blind spot straight behind.
- **Shooting:** monsters that grow (coming at you) drive LPLC2, close ones LC4, fireballs LPLC1. Those drive the
  escape neurons DNp01 (the giant fiber), DNp02, DNp04, DNp11, which in a real fly launch the escape jump. A burst
  on them pulls the trigger. Every shot is the fly trying to jump away.

What we checked by stimulating each input on one side (8 flies, 1 s): LC10a raises only the same-side steering
neurons (1.5 to 8 Hz); LPLC2 and LC4 raise only the same-side escape neurons (DNp01 up to 35 Hz, DNp04 up to
69 Hz); forward (DNg100), backward (MDN) and DNg11 don't answer any of them.

| center arena, seeds 1-3, panic threshold 90 Hz | kills | seconds alive |
|---|---|---|
| fly brain | 5, 3, 2 | 13.3, 9.5, 8.5 |
| blind (screen only, no monster input; seeds 1-2) | 0, 0 | 7.5, 7.1 |

It is a terrible Doom player and fires far too often; it runs out of its 26 bullets. That's the escape reflex.

Interface knobs (`DEFAULT` in `fly.py`) were set by hand on these same seeds; nothing was tested held out.
A game runs about 3-4x slower than real time on an RTX 4060 laptop (8 flies voting); rendering a clip about 13x.
