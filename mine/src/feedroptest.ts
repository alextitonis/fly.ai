/**
 * The fee drop (src/feedrop.ts) against a real Postgres and a fake chain: hourly samples, averages (an hour holding
 * nothing counts as 0), the 200k minimum, the excluded wallets and contracts, the pot (Pons fees in the window less
 * 10%), closing an ended drop and booking a paid share.
 *   npm run test:feedrop
 */
import type { ServerResponse } from "node:http";
import { KEEP, MIN_HOLD, SAMPLE_MS, createFeedrop, split } from "./feedrop.ts";
import { startPg } from "./pgtest.ts";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
class HttpError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
const E18 = 10n ** 18n;
const addr = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b));

// split on its own
const s = split([{ address: addr(1), avg: 600_000 }, { address: addr(2), avg: 200_000 }, { address: addr(3), avg: 199_999 }]);
check("split: only 200k+ averages, by size", s.holders === 2 && near(s.rows[0].share, 0.75) && near(s.rows[1].share, 0.25) && near(s.top10, 1));

const PG = await startPg(5559);
try {
  const { pg } = PG;
  const BIG = addr(0xb1), SMALL = addr(0xb2), LATE = addr(0xb3), POOL = addr(0xc1), FLYW = addr(0xd1);
  const DEV = "0x625862521777e19ad54ce6c7abed9ca54d6589ea";
  await pg.run(`insert into mine.gta_holders (address) values (?), (?), (?), (?), (?), (?)`, BIG, SMALL, LATE, POOL, FLYW, DEV);
  await pg.run("insert into mine.vault_wallets (id, fly_id, address, enc_key, nonce) values ('fly:9', 9, ?, 'x', 'x')", FLYW);
  const held = new Map<string, bigint>([[BIG, 1_000_000n * E18], [SMALL, 100_000n * E18], [POOL, 5_000_000n * E18],
    [FLYW, 9_000_000n * E18], [DEV, 50_000_000n * E18]]);
  const START = Date.parse("2026-11-06T00:00:00Z");
  let now = START + 60_000;
  const cfg = { drops: [{ n: 1, start: START, end: START + 4 * SAMPLE_MS }, { n: 2, start: START + 4 * SAMPLE_MS, end: START + 8 * SAMPLE_MS }], exclude: [] };
  let out: { status: number; body: any } = { status: 0, body: null };
  let body: any = null, session = "", token = false;
  const f = createFeedrop({
    pg, cfg, HttpError, now: () => now,
    chain: { holdings: async (ws) => ws.map((w) => held.get(w) ?? 0n), isContract: async (w) => w === POOL },
    send: (_r: ServerResponse, status, b) => { out = { status, body: b }; }, readJson: async () => body,
    sessionWallet: async () => session, isAdminToken: () => token, admins: [addr(0xad)],
  });
  const call = async (method: string, path: string, b?: unknown) => {
    body = b ?? null;
    try { await f.route({ method } as any, {} as any, new URL(`http://x${path}`)); } catch (e) { out = { status: (e as HttpError).status ?? 500, body: { error: (e as Error).message } }; }
    return out;
  };

  check("first sample runs", await f.sample());
  check("not twice in the hour", !(await f.sample()));
  now += SAMPLE_MS;
  held.set(LATE, 800_000n * E18);                               // buys in for the last 2 of 4 hours
  await f.sample();
  now += SAMPLE_MS; await f.sample();
  now += SAMPLE_MS; await f.sample();
  const { samples, rows } = await f.averages(1);
  const avg = Object.fromEntries(rows.map((r) => [r.address, r.avg]));
  check("4 samples", samples === 4, String(samples));
  check("held all along: its full average", near(avg[BIG], 1_000_000), JSON.stringify(avg));
  check("in for 3 of 4 hours: three quarters", near(avg[LATE], 600_000), String(avg[LATE]));
  check("under 200k on average: out", avg[SMALL] === undefined);
  check("the pool (a contract), a fly wallet and the dev wallet: out", avg[POOL] === undefined && avg[FLYW] === undefined && avg[DEV] === undefined);

  await pg.run(`insert into mine.gta_fees (id, source, at, usd) values ('pons:a', 'pons', ?, 100), ('pons:b', 'pons', ?, 50),
    ('pons:old', 'pons', ?, 999), ('desk:1', 'desk', ?, 70)`, new Date(START + 3600_000).toISOString(), new Date(START + 7200_000).toISOString(),
    new Date(START - 86_400_000).toISOString(), new Date(START + 3600_000).toISOString());
  let r = await call("GET", `/api/feedrop?wallet=${LATE}`);
  check("pot: the window's Pons fees less 10% (not older fees, not desk fees)", near(r.body.fees_usd, 150) && near(r.body.pot_usd, 150 * (1 - KEEP)), JSON.stringify(r.body));
  check("holders in and the top-10 share", r.body.holders === 2 && near(r.body.top10_pct, 100) && r.body.min_flyai === MIN_HOLD);
  check("a wallet's average, share and estimate", near(r.body.me.avg_flyai, 600_000) && near(r.body.me.share_pct, 37.5) && near(r.body.me.est_usd, 135 * 0.375), JSON.stringify(r.body.me));
  r = await call("GET", `/api/feedrop?wallet=${DEV}`);
  check("the dev wallet sees it is not in", r.body.me.excluded === true && r.body.me.eligible === false);

  r = await call("GET", "/api/admin/feedrop?drop=1&flyai=1000000");
  check("admin list: no session, no list", r.status === 403);
  token = true;
  r = await call("GET", "/api/admin/feedrop?drop=1&flyai=1000000");
  check("admin preview splits the $FLYAI", !r.body.closed && near(r.body.rows.find((x: any) => x.address === BIG).flyai, 625_000), JSON.stringify(r.body.rows));
  r = await call("POST", "/api/admin/feedrop/close", { drop: 1, flyai: 1_000_000 });
  check("can't close before the drop ends", r.status === 409);
  now = START + 4 * SAMPLE_MS + 60_000;                         // drop 2 has started
  held.set(BIG, 0n);                                            // sold after drop 1: drop 1's share stays
  r = await call("POST", "/api/admin/feedrop/close", { drop: 1, flyai: 1_000_000 });
  check("closed", r.status === 200 && r.body.holders === 2, JSON.stringify(r.body));
  r = await call("POST", "/api/admin/feedrop/close", { drop: 1, flyai: 2_000_000 });
  check("closed once", r.status === 409);
  await f.sample();                                             // drop 2's first hour
  r = await call("GET", "/api/admin/feedrop?drop=1");
  check("the frozen split", r.body.closed && r.body.rows.length === 2 && near(r.body.rows[0].flyai, 625_000), JSON.stringify(r.body.rows));
  const TX = `0x${"ab".repeat(32)}`;
  r = await call("POST", "/api/admin/feedrop/paid", { drop: 1, wallet: BIG, tx: TX });
  check("a share booked paid", r.status === 200);
  r = await call("POST", "/api/admin/feedrop/paid", { drop: 1, wallet: BIG, tx: TX });
  check("paid once", r.status === 404);
  token = false;
  r = await call("GET", `/api/feedrop?wallet=${BIG}`);
  check("drop 2 is the running one; drop 1 in the past with its payout", r.body.drop.n === 2 && r.body.past[0].closed && r.body.past[0].paid === 1
    && r.body.me.last_payout.paid && near(r.body.me.last_payout.flyai, 625_000), JSON.stringify(r.body));
  check("drop 2: what was sold counts 0", r.body.me.avg_flyai === 0);
} finally {
  await PG.stop();
}
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
