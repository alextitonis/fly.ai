/**
 * How the fly plays: what it sees and what moves its paddle. Everything between those two is the real connectome
 * (MaleCNS v1.0, 166,700 neurons, lib/connectome.ts) with nothing trained and nothing scripted.
 *
 *  - IN, the eye: the fly sits on its paddle looking across the table at you. The ball is a small dark target, so
 *    it goes into LC10a, the visual neurons a male fly uses to chase a target, on the side of the eye it is on
 *    (looking left across the screen, the fly's left is down the screen). Dead ahead drives both eyes equally.
 *  - OUT, the paddle: the descending neurons that answer LC10a on the same side (measured: DNa02, DNg111, DNae002
 *    fire 4-10 Hz on the target's side within ~40 ms, ~0-2 Hz on the other). In a real fly they turn it toward
 *    the target; here "turn left" moves the paddle down the screen and "turn right" moves it up.
 *
 * Nothing here says "go to the ball": if the paddle follows it, that is the fly's wiring turning toward a target.
 */
import { flyX, type Pong } from "./pong.ts";

export const SEE = ["LC10a"];
export const STEER = ["DNa02", "DNg111", "DNae002"];

export const FLY = {
  volts: 1.0, // LC10a drive per brain step while the ball is in view
  spread: 0.35, // radians off dead ahead at which one eye gets all of it
  rateTau: 0.1, // seconds, smoothing of the steering spikes
  gain: 22, // paddle px/s per Hz of left-minus-right steering
};

/** LC10a volts for the fly's left and right eye this brain step. */
export function eyes(g: Pong): { L: number; R: number } {
  const b = g.ball;
  if (g.wait > 0 || g.over || b.x >= flyX) return { L: 0, R: 0 };
  // bearing from the fly's line of sight (pointing left across the table); positive = the fly's left = screen down
  const bearing = Math.atan2(b.y - g.fly, flyX - b.x);
  const left = Math.min(1, Math.max(0, 0.5 + bearing / FLY.spread));
  return { L: FLY.volts * left, R: FLY.volts * (1 - left) };
}

/** Smoothed steering rates, left and right, and the paddle velocity they make. */
export class Steering {
  L = 0;
  R = 0;
  /** spikes: steering-neuron spikes on each side in one brain step of dt seconds */
  update(spikesL: number, spikesR: number, dt: number): void {
    const a = Math.exp(-dt / FLY.rateTau);
    this.L = a * this.L + (1 - a) * spikesL / dt;
    this.R = a * this.R + (1 - a) * spikesR / dt;
  }
  /** px/s down the screen */
  get vy(): number {
    return FLY.gain * (this.L - this.R);
  }
}

