import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";
import { entryGate, exitRule, type Position } from "../src/strategy.js";
import { parseLog, TOPICS } from "../src/discover.js";

const cfg = { ...loadConfig(), tpX: 2, tpPart: 0.5, trailPct: 25, trailArmX: 1.3, stopPct: 40, maxHoldMin: 30 };
const E = 10n ** 18n;
const trip = (got: bigint, back: bigint, quoted = back) => ({ ok: back > 0n, got, back, quoted });

test("entry gate passes a normal pool", () => {
  const g = entryGate(cfg, E, trip(1000n * E, (96n * E) / 100n), trip(50n * E, E / 21n));
  assert.equal(g.ok, true, g.why);
});

test("entry gate refuses a honeypot, a sell tax, a costly trip and a thin pool", () => {
  assert.equal(entryGate(cfg, E, { ok: false, got: 0n, back: 0n, quoted: 0n, reason: "x" }, null).ok, false);
  assert.match(entryGate(cfg, E, trip(1000n * E, E / 2n, E), trip(50n * E, E / 21n)).why, /sell tax/);
  assert.match(entryGate(cfg, E, trip(1000n * E, (80n * E) / 100n), trip(50n * E, E / 21n)).why, /round trip/);
  // our buy got 1000 tokens, the 1/20 probe got 100 (would be 2000 at our size): impact 50%
  assert.match(entryGate(cfg, E, trip(1000n * E, (96n * E) / 100n), trip(100n * E, E / 21n)).why, /thin pool/);
});

const pos = (o: Partial<Position> = {}): Position => ({
  id: "x", symbol: "X", costHype: 1, spentHype: 1, receivedHype: 0, tokens: "1", taxRatio: 1,
  peakValue: 1, lastValue: 1, openedAt: 0, tookProfit: false, sellFails: 0, ...o,
});

test("exits: take profit, trail, stop, max hold, honeypot", () => {
  assert.deepEqual(exitRule(cfg, pos(), 2.1, 1), { part: 0.5, why: "take profit 2x" });
  assert.equal(exitRule(cfg, pos({ peakValue: 1.5 }), 1.1, 1)?.part, 1); // 26% under a 1.5x top
  assert.equal(exitRule(cfg, pos({ peakValue: 1.2 }), 0.95, 1), null); // trail not armed below 1.3x, no stop yet
  assert.match(exitRule(cfg, pos(), 0.59, 1)?.why ?? "", /stop/);
  assert.match(exitRule(cfg, pos(), 1, 31 * 60_000)?.why ?? "", /max hold/);
  assert.match(exitRule(cfg, pos(), 1, 1, false)?.why ?? "", /sell check/);
  // after taking profit the stop is off (principal is back) but the trail still runs
  assert.equal(exitRule(cfg, pos({ tookProfit: true, receivedHype: 1.05, peakValue: 1.05 }), 0.5, 1)?.part, 1);
});

test("discovery parses a v4 native-HYPE pool and ignores non-HYPE pairs", () => {
  const pad = (a: string) => "0x" + a.slice(2).padStart(64, "0");
  const data = ("0x" + [0n, 1n, BigInt("0xd492b95e2ecf74db6c5493e7c32f6816248484cc"), 1n, 1n]
    .map((n) => n.toString(16).padStart(64, "0")).join("")) as `0x${string}`;
  const f = parseLog({
    address: "0x0088bea218c283a939c93d7db8353cd87cdcf647",
    topics: [TOPICS.v4, pad("0x01"), pad("0x0000000000000000000000000000000000000000"), pad("0xe0f924527794f9c4133f68bfb28a76bc0abc6e53")] as any,
    data, blockNumber: 1n,
  });
  assert.equal(f?.route.kind, 4);
  assert.equal(f?.route.quote, "0x0000000000000000000000000000000000000000");
  assert.equal(f?.route.key.tickSpacing, 1);
  const v2 = parseLog({
    address: "0x0088bea218c283a939c93d7db8353cd87cdcf647",
    topics: [TOPICS.v2, pad("0x1111111111111111111111111111111111111111"), pad("0x2222222222222222222222222222222222222222")] as any,
    data: ("0x" + "00".repeat(64)) as `0x${string}`, blockNumber: 1n,
  }, "0xCD57F65c2B0e5881CFC2E609F7CD53b746E1F234");
  assert.equal(v2, null);
});
