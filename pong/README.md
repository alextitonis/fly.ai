# Pong vs a fly brain

Play Pong against the real fruit fly connectome (MaleCNS v1.0, 166,700 neurons, 25.1 M synapses), running in your
browser. Nothing is trained and nothing tells the fly to go to the ball.

```bash
cd pong
npm install
npm run dev        # http://localhost:3210 (copies the brain from world/public/connectome first)
```

Controls: mouse, or W/S / arrow keys. First to 7.

## How the fly plays

- **Eyes (in):** the fly sits on its paddle looking across the table. The ball goes into LC10a, the visual neurons a
  male fly uses to chase a target, in the eye it's on (looking left, the fly's left eye covers the bottom of the
  screen). Dead ahead drives both eyes equally. See `lib/fly.ts`.
- **Paddle (out):** DNa02, DNg111 and DNae002, the descending neurons that answer LC10a on the same side (measured:
  4–10 Hz on the target's side within ~40 ms, ~0–2 Hz on the other side). In a real fly they turn it toward a target.
  Here left minus right sets the paddle speed (22 px/s per Hz).
- Everything in between is the connectome, stepped every 20 ms in a Web Worker (`app/brain.worker.ts`, engine in
  `lib/connectome.ts`, copied from `world/src`).

## Does it really play?

`npm run selfplay -- 50` puts the fly against a perfect wall (your paddle always under the ball) with no browser,
and compares it with two controls on the same balls:

| | balls returned |
|---|---|
| fly brain | **49 / 50 (98%)** |
| same brain, left/right steering swapped | 9 / 50 (18%) |
| paddle that never moves | 26 / 50 (52%) |

Takes a few minutes of CPU.
