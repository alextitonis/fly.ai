# Be My ValentFLY

**It's [The Bachelor](https://en.wikipedia.org/wiki/The_Bachelor_(American_TV_series)),
run by an actual fly brain.** 5 candidates, one lead, a hidden compatibility
score nobody gets to see, a date with each, and a single rose at the end. The
twist: every date and the final proposal are decided live by
`flybrain.FlyBrain` — the real 166,700-neuron MaleCNS connectome, spiking in
real time — not a script, not a trained model, not a coin flip. No model, no
training, no checkpoint: this is the "frozen connectome + readout" pattern
[`sshfighter/`](../sshfighter/) and
[`flyreservoir_example.py`](../flyreservoir_example.py) use, taken to its
simplest possible form. There's no fitted readout here at all — just a live
measurement, fresh every season.

## The rules (same shape as the show)

5 candidates, each with a hidden true compatibility score (0–10) — the
"lead" never gets to see this, same as no one on the real show can see a
number over anyone's head. Every candidate gets exactly one date, then a
single proposal is made. Correct (`env.score_proposal`) only if the
candidate proposed to actually had the highest true compatibility in the
pool — otherwise it's heartbreak, scored proportional to how wrong it was.

## The brain, deciding live

This is the part that isn't like the show at all: there's no lead with
feelings, just a spiking neural network standing in for one. End to end:

1. **One real neuron population per candidate.** `encode.py` picks 5 named
   olfactory receptor neuron types straight from the connectome's own
   metadata (`ORN_*`, one per antennal-lobe glomerulus — e.g. `ORN_DA1`,
   `ORN_VA1v`), size-matched across seats so no candidate wins just by
   having a bigger population to spike from.
2. **"Dating" = stimulating that population.** For 0.5 s (25 simulation
   steps), voltage is injected into that candidate's dedicated neurons at a
   strength set by their true (hidden) compatibility score — a better match
   is a stronger stimulus, via `flybrain.reservoir.run(brain, steps,
   encode=...)`.
3. **The rest of the 166,700-neuron network actually runs.** This isn't
   "read the input neurons straight back out" — `FlyBrain.step()`
   propagates the real MaleCNS synaptic weight matrix every step, so the
   stimulus passes through several real connectivity hops before it reaches
   anywhere we look.
4. **The readout is the descending-neuron population** — the connectome's
   real motor-output neurons, the same population
   [`sshfighter/reservoir.py`](../sshfighter/reservoir.py) already uses to
   drive punches and kicks, i.e. the neurons that would actually drive
   behavior if this were attached to a body. After each date's 25 steps,
   the settled mean spike trace across that population is read off as a
   plain scalar. That reading is not a prediction of anything — it's
   measured, nothing more.
5. **State carries across dates within a season.** The brain is *not*
   reset between the 5 dates — one date's activity can genuinely leave
   residual buzz into the next, exactly as it would in one continuous
   simulation. It *is* reset (fresh seed) between seasons.
6. **The seats stay fixed across seasons; the compatibility doesn't.**
   `Encoder(brain, ...)` runs once, before the season loop (`season.py`),
   so "Seat 1"–"Seat 5" map to the *same* 5 real neuron types for every
   season in that run — that's why a seat's icon/color is stable across
   the recap page's season tabs. But `env.random_problem()` draws a brand
   new, independent hidden compatibility score per seat at the top of
   *every* season, and the brain itself is reset to a fresh seed with it
   (point 5) — so each season is a fully independent problem, a new lead
   dating the same 5-seat pool with no carried-over identity or memory
   from the last one. This is deliberate: aggregating
   the season record over several independent random draws is a more
   meaningful accuracy signal than repeating one fixed draw, and it's why
   the page labels seats by number rather than by name — contrast
   [`radio/channels.py`](../radio/channels.py), where a persistent name
   *is* warranted because each cast member reuses the same fixed
   `flytalk.CONTEXTS` stimulus every time the station runs.
7. **Decision = argmax.** The proposal goes to whichever candidate produced
   the **highest reading**. That's the entire decision procedure: no value
   function, no Q-values, no cross-validated readout fit on training data —
   comparing five raw measurements *is* the decision. Deliberately dumber
   and cheaper than a trained reservoir readout — see the caveat below.

**Made up, plainly:** the assignment of candidate seats to specific neuron
types has no biological basis — it's picked deterministically so the demo
is reproducible, not because those neurons encode "attraction" in a real
fly. Same standard of honesty [`world/README.md`](../world/README.md)
already holds itself to ("not the real connectome" etc.) — here it's "not
the real thing flies use to judge a mate."

## Files

| File | What it does |
|---|---|
| `env.py` | The domain: hidden compatibility draw, proposal scoring. Self-test via `python valentfly/env.py`. |
| `encode.py` | Picks the 5 real neuron populations, one per seat. |
| `season.py` | Runs real seasons, narrates them, and writes a JSON trace and/or a standalone HTML recap page. |
| `site_template.html` | The recap page's HTML/CSS/JS, with a `__SEASONS_JSON__` placeholder — `season.py --html-out` fills it in. |

## Commands

Run from the repo root (`fly.ai/`):

```
python valentfly/env.py                                            # rules self-test, no brain needed
python valentfly/season.py --seasons 8 --seed 1 --html-out valentfly/site.html
```

The first run downloads the prebuilt connectome (~260 MB, once, into
`$FLY_DATA` / `~/fly-data`) — see [`flybrain/data.py`](../flybrain/data.py).
Needs `numpy`, `scipy`, `numba` installed (`pip install -r
../requirements.txt` from this folder, or `pip install numpy scipy numba`).

Add `--json-out valentfly/seasons.json` too if you want the raw trace data
on its own. `--seasons`/`--seed` control how many seasons run and which
compatibility draws they use (same seed → same draws, not the same
readings — the brain's own noise means readings still vary run to run).

## Opening the recap

`season.py --html-out` writes a single, fully self-contained HTML file (the
season data is baked directly into it) — no server, no build step. Open it
by its full path:

- **PowerShell:** `start D:\Projects\Alex\fly.ai\valentfly\site.html`
- **Git Bash:** `explorer.exe D:\\Projects\\Alex\\fly.ai\\valentfly\\site.html`
- **Any shell:** open File Explorer and double-click it.
