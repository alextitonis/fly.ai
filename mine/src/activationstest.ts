/**
 * Activations (src/activations.ts) against a real Postgres: the first scan only seeds, later scans find new live
 * wallets (flies and partner NFTs, not pots or other chains), PostHog gets one fly_activated each, the scorecard counts.
 *   npm run test:activations
 */
import { startPg } from "./pgtest.ts";
import { createActivations, unitOf } from "./activations.ts";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};

const A = "0x" + "a".repeat(40), B = "0x" + "b".repeat(40), C = "0x" + "c".repeat(40), D = "0x" + "d".repeat(40);
const H1 = "0x" + "1".repeat(40), H2 = "0x" + "2".repeat(40);

check("unitOf: a fly's wallet", unitOf(`vault:${A}`)?.book === "fly");
check("unitOf: a partner NFT's wallet", unitOf(`vault:p_waifus:${B}`)?.unit === `waifus:${B}`);
check("unitOf: ruyui", unitOf(`vault:ruyui:${C}`)?.book === "ruyui");
check("unitOf: pots and other chains left out",
  unitOf(`vault:p_bullas_pool:${A}`) === null && unitOf(`vault:base:${A}`) === null && unitOf("vault:agent:" + A) === null);

const { pg, stop } = await startPg(8841);
try {
  const put = (key: string, v: Record<string, unknown>) =>
    pg.run("insert into mine.vault_public (key, value) values (?, ?::text::jsonb) on conflict (key) do update set value = excluded.value", key, JSON.stringify(v));
  await pg.run("insert into mine.partners (id, name, \"on\", config) values ('waifus', 'Waifus', true, '{}'::jsonb) on conflict (id) do update set \"on\" = true");
  await pg.run("insert into mine.vault_wallets (id, fly_id, address, enc_key, nonce) values ('fly:7', 7, ?, 'x', 'x')", A);
  await put(`vault:${A}`, { active: true, value: 50, holder: H1 });
  await put(`vault:base:${A}`, { active: true, value: 50, holder: H1 });
  await put(`vault:p_bullas_pool:${D}`, { active: true, value: 500, holder: H1 });
  await put(`vault:p_waifus:${B}`, { active: true, value: 5, holder: H2 });     // a partner NFT under $10: not live

  const sent: any[] = [];
  const fake = (async (_url: string, init: any) => { sent.push(...JSON.parse(init.body).batch); return new Response("{}"); }) as typeof fetch;
  const send = () => {};
  const act = createActivations({ pg, send, posthog: { key: "phc_test", host: "https://ph.test" }, fetch: fake });

  const first = await act.scan();
  check("first scan seeds and sends nothing", first.length === 0 && sent.length === 0);
  const rows1 = await pg.all<{ unit: string; seeded: boolean; fly_id: number | null }>("select unit, seeded, fly_id from mine.activations");
  check("seeded: only the fly wallet", rows1.length === 1 && rows1[0].seeded && Number(rows1[0].fly_id) === 7, JSON.stringify(rows1));

  await pg.run("insert into mine.wallets_seen (wallet, old) values (?, false) on conflict do nothing", H2);
  await put(`vault:p_waifus:${B}`, { active: true, value: 20, holder: H2 });
  await put(`vault:ruyui:${C}`, { active: false, value: 20, holder: H2 });
  const second = await act.scan();
  check("a partner NFT going live is new", second.length === 1 && second[0].unit === `waifus:${B}`, JSON.stringify(second));
  check("PostHog got fly_activated under the holder", sent.length === 1 && sent[0].event === "fly_activated"
    && sent[0].distinct_id === H2 && sent[0].properties.partner === "waifus" && sent[0].properties.new_holder === true, JSON.stringify(sent));

  const third = await act.scan();
  check("the same unit is not new twice", third.length === 0 && sent.length === 1);

  await put(`vault:${A}`, { active: false, value: 50, holder: H1 });
  await act.scan();
  const live = await pg.one<{ live: boolean }>("select live from mine.activations where unit = ?", A);
  check("a fly that stops is marked not live", live?.live === false);

  const board = await act.scorecard();
  const fly = board.books.find((b) => b.book === "fly"), w = board.books.find((b) => b.book === "waifus");
  check("scorecard: Trader Flies first", board.books[0].book === "fly");
  check("scorecard: fly seeded, not counted as new", fly?.live === 0 && fly?.new_7d === 0, JSON.stringify(fly));
  check("scorecard: waifus live 1, new 1, new holder 1", w?.live === 1 && w?.holders === 1 && w?.new_7d === 1 && w?.new_holders_30d === 1, JSON.stringify(w));

  // the quest platforms' check: GET /api/activations/check?address=..., always 200, every platform's shape
  const ask = async (q: string) => {
    let body: any = null, status = 0;
    const res = { } as any;
    const sender = (_r: unknown, s: number, b: unknown) => { status = s; body = b; };
    const a2 = createActivations({ pg, send: sender as any });
    await a2.route({ method: "GET" } as any, res, new URL(`http://x/api/activations/check?${q}`));
    return { status, body };
  };
  const yes = await ask(`address=${H2.toUpperCase().replace("0X", "0x")}`);
  check("check: a wallet with a live partner NFT passes (any case)", yes.status === 200 && yes.body.result.isValid === true
    && yes.body.data.result === true && yes.body.live === 1, JSON.stringify(yes.body));
  const stopped = await ask(`wallet=${H1}`);
  check("check: a wallet whose fly stopped fails", stopped.body.result.isValid === false, JSON.stringify(stopped.body));
  const junk = await ask("address=nope");
  check("check: a bad address fails with 200", junk.status === 200 && junk.body.result.isValid === false);
  const young = await ask(`address=${H2}&days=7`);
  check("check: days=7 fails for one that went live just now", young.body.result.isValid === false && young.body.live === 1);
} finally {
  await stop();
}
if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log("all passed");
