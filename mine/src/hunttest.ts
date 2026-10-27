/**
 * Fly Hunt (src/hunt.ts) against a real Postgres: the setup keeps only hashes, clues come one at a time, answers are
 * normalized, live steps (the leaderboard's top fly, a scanned token) count answers learned while the hunt runs,
 * the try limits, the ranks and the winners' notices, and the window.
 *   npm run test:hunt
 */
import { readFileSync } from "node:fs";
import { createHunt, hashOf, norm, scanNames, WRONG_PER_HOUR, TRY_GAP_MS } from "./hunt.ts";
import { startPg } from "./pgtest.ts";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
class HttpError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
const addr = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;

// --- pure parts ---
check("norm: case, spaces, # and $ don't matter", norm(" #843 ") === "843" && norm("$ZYXW") === "zyxw" && norm("K7 Q2") === "k7q2"
  && norm("48,151,623") === "48151623");
check("hash: same answer, same hash; salt matters", hashOf("s", "K7Q2") === hashOf("s", "k7q2") && hashOf("s", "x") !== hashOf("t", "x"));
check("scan title -> symbol and name", JSON.stringify(scanNames("RSTR (Robinhood Hat Strategy)")) ===
  JSON.stringify(["RSTR (Robinhood Hat Strategy)", "RSTR", "Robinhood Hat Strategy"]) && scanNames(null).length === 0);

const PG = await startPg(5562);
try {
  const { pg } = PG;
  for (const fname of ["20261022120000_mine_notices.sql", "20261027160000_mine_hunt.sql"]) {
    const sql = readFileSync(new URL(`../../flybook/supabase/migrations/${fname}`, import.meta.url), "utf8");
    for (const s of sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").split(";").map((x) => x.trim()).filter(Boolean)) await pg.run(s);
  }
  await pg.run("delete from mine.notices");
  const board = (fly: number) => pg.run(`insert into mine.vault_public (key, value) values ('leaderboard', ?::text::jsonb)
    on conflict (key) do update set value = excluded.value`, JSON.stringify({ all: [{ flies: [fly] }], d7: [{ flies: [fly + 1] }], h24: [] }));
  await board(168);

  const START = Date.parse("2026-10-28T12:00:00Z");
  let t = START - 3_600_000;
  let me = "";
  const hunt = createHunt({
    pg, HttpError, send: () => {}, readJson: async () => ({}), sessionWallet: async () => me, adminOnly: () => {}, now: () => t,
  });
  await pg.run(`insert into mine.scan_jobs (id, kind, target, chain, status, paid_by, done_at, verdict, title)
    values ('aaaaaaaaaaaa', 'contract', '0x1', 'robinhood', 'done', 'free', ?, 'caution', 'RSTR (Robinhood Hat Strategy)')`,
    new Date(START - 7_200_000).toISOString());

  const setup: any = await hunt.setup({
    id: "hunt-1", start: new Date(START).toISOString(), end: new Date(START + 7 * 86_400_000).toISOString(), winners: 2,
    steps: [
      { clue: { en: "press kit", es: "kit de prensa" }, answers: ["K7Q2"] },
      { clue: { en: "connections" }, answers: ["48151623"] },
      { clue: { en: "leader" }, live: "leader" },
      { clue: { en: "scan" }, live: "scan" },
      { clue: { en: "desk" }, answers: ["ZYXW"] },
    ],
  });
  const stored = (await pg.one<{ value: any }>("select value from mine.hunt_state where key = 'hunt'"))!.value;
  check("setup stores hashes, never the answers", !JSON.stringify(stored).toLowerCase().includes("k7q2") && stored.steps[0].hashes.length === 1);
  check("admin view shows no hashes or salt", !JSON.stringify(setup).includes(stored.salt) && setup.steps[0].answers === 1);
  check("live answers learned at setup", setup.steps[2].live_answers === 2 && setup.steps[3].live_answers === 3,
    JSON.stringify(setup.steps.map((s: any) => s.live_answers)));

  const A = addr(0xa1), B = addr(0xb2), C = addr(0xc3);
  let pub = await hunt.publicView();
  check("before the start: no clue in public", pub.on === true && pub.started === false && pub.clue === null);
  me = A;
  await hunt.answer(A, { answer: "k7q2" }).then(() => check("answering before the start refused", false), (e) => check("answering before the start refused", e.status === 409));

  t = START + 1000;
  pub = await hunt.publicView();
  check("after the start: clue 1 is public (all its languages)", pub.clue?.en === "press kit" && pub.clue?.es === "kit de prensa");
  let v: any = await hunt.me(A);
  check("a new wallet sees clue 1 only", v.solved === 0 && v.clue.en === "press kit" && v.tries.left === WRONG_PER_HOUR);

  v = await hunt.answer(A, { answer: "nope" });
  check("a wrong answer", v.ok === false && v.tries.left === WRONG_PER_HOUR - 1);
  v = await hunt.answer(A, { answer: "K7Q2" });
  check("too soon after a try: wait", v.ok === false && v.wait_s > 0 && v.wait_s <= TRY_GAP_MS / 1000);
  t += TRY_GAP_MS;
  v = await hunt.answer(A, { answer: " k7 Q2 " });
  check("right (normalized) -> clue 2", v.ok === true && v.solved === 1 && v.clue.en === "connections");

  for (let i = 0; i < WRONG_PER_HOUR; i++) { t += TRY_GAP_MS; await hunt.answer(A, { answer: `x${i}` }); }
  t += TRY_GAP_MS;
  v = await hunt.answer(A, { answer: "48151623" });
  check(`${WRONG_PER_HOUR} wrong in an hour: locked out of that step`, v.ok === false && v.wait_s > 60);
  t += 3_600_000;
  v = await hunt.answer(A, { answer: "48,151,623" });
  check("an hour later: open again", v.ok === true && v.clue.en === "leader");

  // the leader changes after the setup: the old one still counts, and a new one is learned on a miss
  await board(500);
  t += TRY_GAP_MS;
  v = await hunt.answer(A, { answer: "#500" });
  check("live step: a new leader learned on a miss", v.ok === true && v.clue.en === "scan");
  t += TRY_GAP_MS;
  v = await hunt.answer(A, { answer: "robinhood hat strategy" });
  check("live step: a scanned token's name", v.ok === true && v.clue.en === "desk");
  t += TRY_GAP_MS;
  v = await hunt.answer(A, { answer: "$zyxw" });
  check("last step: done, rank 1", v.ok === true && v.done === true && v.rank === 1 && v.clue === null);
  v = await hunt.answer(A, { answer: "anything" });
  check("answering when done just returns the state", v.done === true && v.rank === 1);

  // B: an old leader (168, from setup) still counts
  const run = async (w: string, answers: string[]) => {
    me = w;
    let r: any;
    for (const a of answers) { t += TRY_GAP_MS; r = await hunt.answer(w, { answer: a }); }
    return r;
  };
  v = await run(B, ["k7q2", "48151623", "168", "RSTR", "ZYXW"]);
  check("second finisher, with an earlier leader", v.done === true && v.rank === 2);
  v = await run(C, ["k7q2", "48151623", "169", "RSTR", "ZYXW"]);
  check("third finisher (d7 leader counts too), past the winners", v.done === true && v.rank === 3);

  const notes = await pg.all<{ wallet: string; text: string }>("select wallet, text from mine.notices order by at");
  check("notices for the winners only", notes.length === 2 && notes[0].wallet === A && notes[1].wallet === B && /#1/.test(notes[0].text), JSON.stringify(notes));
  pub = await hunt.publicView();
  check("public: found 3, the 2 winners shortened", pub.found === 3 && pub.finishers.length === 2 && pub.finishers[0].wallet.includes("…"));
  const adm: any = await hunt.adminView();
  check("admin: every player's steps and tries", adm.players.length === 3 && adm.players[0].wallet === A && adm.players[0].wrong === WRONG_PER_HOUR + 1
    && Object.keys(adm.players[0].steps).length === 5);

  // re-saving the same hunt keeps the salt (live answers stay valid); the window closes
  await hunt.setup({ id: "hunt-1", start: new Date(START).toISOString(), end: new Date(START + 7 * 86_400_000).toISOString(), winners: 5,
    steps: stored.steps.map((s: any, i: number) => ({ clue: s.clue, ...(s.live ? { live: s.live } : { answers: [["k7q2", "48151623", "", "", "zyxw"][i]] }) })) });
  const again = (await pg.one<{ value: any }>("select value from mine.hunt_state where key = 'hunt'"))!.value;
  check("same id: same salt", again.salt === stored.salt && again.winners === 5);
  t = START + 8 * 86_400_000;
  me = addr(0xd4);
  await hunt.answer(me, { answer: "k7q2" }).then(() => check("after the end: refused", false), (e) => check("after the end: refused", e.status === 409));
  await hunt.setup({ id: "bad id!", start: "x", end: "y", winners: 1, steps: [] })
    .then(() => check("a bad setup refused", false), (e) => check("a bad setup refused", e.status === 400));
} finally {
  await PG.stop();
}
console.log(failed ? `\n${failed} FAILED` : "\nall ok");
process.exit(failed ? 1 : 0);
