/**
 * Pong, nothing fly-specific: a field, two paddles, one ball. You are on the left, the fly on the right.
 * Units are field pixels (800 x 500), time in seconds. step() moves everything; who moves the paddles is up to the
 * caller (your mouse/keys, the fly's descending neurons in fly.ts).
 */
export const FIELD = { w: 800, h: 500 };
export const PADDLE = { w: 12, h: 96, inset: 24, maxSpeed: 620 };
export const BALL = { r: 8, speed: 380, speedUp: 1.05, maxSpeed: 760, maxAngle: 0.9 };
export const WIN_AT = 7;

export interface Pong {
  ball: { x: number; y: number; vx: number; vy: number };
  /** paddle centres (y) */
  you: number;
  fly: number;
  score: { you: number; fly: number };
  /** seconds until the next serve, after a point */
  wait: number;
  /** +1 serves toward the fly, -1 toward you */
  serveTo: 1 | -1;
  rally: number;
  hits: { you: number; fly: number };
  /** set for one step when something happens */
  event: "" | "hit-you" | "hit-fly" | "point-you" | "point-fly" | "wall";
  over: "" | "you" | "fly";
}

export const youX = PADDLE.inset;
export const flyX = FIELD.w - PADDLE.inset;

export function newGame(rand: () => number = Math.random): Pong {
  const g: Pong = {
    ball: { x: FIELD.w / 2, y: FIELD.h / 2, vx: 0, vy: 0 },
    you: FIELD.h / 2, fly: FIELD.h / 2,
    score: { you: 0, fly: 0 }, wait: 1, serveTo: 1, rally: 0, hits: { you: 0, fly: 0 }, event: "", over: "",
  };
  serve(g, rand);
  return g;
}

export function serve(g: Pong, rand: () => number = Math.random): void {
  const angle = (rand() * 2 - 1) * 0.5;
  g.ball = { x: FIELD.w / 2, y: FIELD.h * (0.25 + 0.5 * rand()), vx: g.serveTo * BALL.speed * Math.cos(angle), vy: BALL.speed * Math.sin(angle) };
  g.rally = 0;
}

const clampPaddle = (y: number) => Math.min(FIELD.h - PADDLE.h / 2, Math.max(PADDLE.h / 2, y));

/** Move a paddle toward a velocity (px/s), capped at the paddle's top speed. */
export function movePaddle(g: Pong, who: "you" | "fly", vy: number, dt: number): void {
  const v = Math.max(-PADDLE.maxSpeed, Math.min(PADDLE.maxSpeed, vy));
  g[who] = clampPaddle(g[who] + v * dt);
}

export function setPaddle(g: Pong, who: "you" | "fly", y: number, dt: number): void {
  movePaddle(g, who, (y - g[who]) / Math.max(dt, 1e-3), dt);
}

export function step(g: Pong, dt: number, rand: () => number = Math.random): void {
  g.event = "";
  if (g.over) return;
  if (g.wait > 0) {
    g.wait -= dt;
    if (g.wait <= 0) serve(g, rand);
    else return;
  }
  const b = g.ball;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  if (b.y < BALL.r) { b.y = BALL.r; b.vy = Math.abs(b.vy); g.event = "wall"; }
  if (b.y > FIELD.h - BALL.r) { b.y = FIELD.h - BALL.r; b.vy = -Math.abs(b.vy); g.event = "wall"; }

  const bounce = (who: "you" | "fly", dir: 1 | -1) => {
    const off = (b.y - g[who]) / (PADDLE.h / 2);
    const speed = Math.min(BALL.maxSpeed, Math.hypot(b.vx, b.vy) * BALL.speedUp);
    const angle = Math.max(-1, Math.min(1, off)) * BALL.maxAngle;
    b.vx = dir * speed * Math.cos(angle);
    b.vy = speed * Math.sin(angle);
    g.rally++;
    g.hits[who]++;
    g.event = who === "you" ? "hit-you" : "hit-fly";
  };
  const reach = PADDLE.h / 2 + BALL.r;
  if (b.vx < 0 && b.x - BALL.r <= youX + PADDLE.w / 2 && b.x > youX - PADDLE.w && Math.abs(b.y - g.you) <= reach) {
    b.x = youX + PADDLE.w / 2 + BALL.r;
    bounce("you", 1);
  }
  if (b.vx > 0 && b.x + BALL.r >= flyX - PADDLE.w / 2 && b.x < flyX + PADDLE.w && Math.abs(b.y - g.fly) <= reach) {
    b.x = flyX - PADDLE.w / 2 - BALL.r;
    bounce("fly", -1);
  }
  if (b.x < -BALL.r * 2 || b.x > FIELD.w + BALL.r * 2) {
    const flyScored = b.x < 0;
    if (flyScored) g.score.fly++; else g.score.you++;
    g.event = flyScored ? "point-fly" : "point-you";
    g.serveTo = flyScored ? -1 : 1; // the next ball goes to whoever lost the point
    g.wait = 0.9;
    b.vx = 0; b.vy = 0;
    if (g.score.fly >= WIN_AT) g.over = "fly";
    else if (g.score.you >= WIN_AT) g.over = "you";
  }
}
