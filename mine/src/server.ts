/**
 * fly.ai mining server, v1. Hands out connectome jobs, re-runs a sample of the answers, and keeps each
 * day's credit, which payouts will be computed from. No payouts, stake or wallet signatures yet.
 *
 * How cheating is caught, without the server re-running a fixed share of a fast GPU's work:
 *  - canaries: CANARY_RATE of every miner's jobs are ones whose answer the server already knows, handed
 *    out as if new. They cost the server nothing and scale with the miner: faking 100 jobs at 15% meets
 *    a canary with probability 1 - 0.85^100, which is certain for any practical purpose.
 *  - audits: an answer is re-run here with chance AUDITS / (the miner's jobs today + AUDITS), so the
 *    first answers of a day are usually checked and later ones less often, never predictably. That is
 *    about AUDITS * ln(jobs / AUDITS + 1) re-runs per miner per day: ~24 for 10,000 jobs.
 *  - the canary pool: every re-run answer joins it, and verifiers with nothing to check work open jobs
 *    themselves to grow it (up to CANARY_POOL), so fast miners don't run out of canaries they haven't had.
 * Every submit gets the same reply. One wrong answer zeroes the miner's day and marks the miner, so its
 * unchecked answers stop counting and those jobs go back out. Answers (hashes) are never published.
 *
 * When open jobs run low the next round of the screen is added (same grid, new seeds), so work never runs out.
 * Paid orders (src/orders.ts) go ahead of the screen, picked with odds by bid; a paid job counts once ORDER_REDUNDANCY
 * miners agree, and is charged to its order then.
 *
 *   node src/server.ts
 *   env: PORT 8787 · MINE_DB data/mine.db · CONNECTOME_DIR ../world/public/connectome · VERIFIERS (cores-1, max 4)
 *        AUDITS 3 · CANARY_RATE 0.15 · CANARY_POOL 100000 · MIN_CHECKED 2 · AUDIT_QUEUE_MAX 500 · OPEN_TARGET 3000
 *        MAX_JOBS 64 · JOB_TTL_MIN 20 · TRUST_PROXY (set behind a proxy)
 */
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { stripTypeScriptTypes } from "node:module";
import { availableParallelism } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { CHANNELS } from "./model.ts";
import type { TaskParams, TaskResult } from "./runner.ts";
import { screenKey, screenRates } from "./screensum.ts";
import { ADDRESS, checksumAddress, recoverAddress, siweMessage } from "./wallet.ts";
import { createRoulette } from "./roulette.ts";
import { allocate, claimCalldata, fromWei, hasClaimedCalldata, leafHash, merkleTree, monthCalldata, monthId, toWei } from "./payouts.ts";
import { parseTiers, readStake, STAKE_SELECTORS, tierFor } from "./staking.ts";
import {
  cachedCharge, expandSpec, intentMessage, orderConfig, orderTerms, poolPart, SpecError, sweepCost, TAG_MAX, TRANSFER_SELECTOR, transfersIn,
} from "./orders.ts";
import { backoffMs, checkWebhook, sign, WEBHOOK_BATCH, WEBHOOK_MAX_FAILS } from "./webhooks.ts";
import {
  cosineAgree, EMBED_LIMITS, EMBED_MODELS, embedTexts, f32Agree, HASH as BLOB_HASH, houseJob, houseSpec, houseUnits, INDEX_INPUT, isOpenKind, isProgramKind, MAX_OUTPUT_BYTES, openMinBid, openSpec, type OpenSpec,
} from "./orders.ts";
import { inspectWasm, inspectWgsl, WasmError } from "./wasmcheck.ts";
import {
  encodingSummary, learningSummary, piSummary, tilesSummary, tspSummary, tuningSummary, worldSummary,
  type ProbeRun, type Summary, type SweepRow, type WorldRun,
} from "./experiments.ts";
import { Relayer, tokenDomain, transferWithAuthorizationData } from "./relay.ts";
import { Cdp } from "./cdp.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const WORLD_SRC = fileURLToPath(new URL("../../world/src/", import.meta.url));
const env = (k: string, d: string) => process.env[k] ?? d;
const PORT = Number(env("PORT", "8787"));
const DB_PATH = env("MINE_DB", join(ROOT, "data", "mine.db"));
const CONNECTOME_DIR = env("CONNECTOME_DIR", fileURLToPath(new URL("../../world/public/connectome/", import.meta.url)));
const VERIFIERS = Number(env("VERIFIERS", String(Math.max(1, Math.min(4, availableParallelism() - 1)))));
const AUDITS = Number(env("AUDITS", "3"));
const CANARY_RATE = Number(env("CANARY_RATE", "0.15"));
const MIN_CHECKED = Number(env("MIN_CHECKED", "2"));
const AUDIT_QUEUE_MAX = Number(env("AUDIT_QUEUE_MAX", "500"));
const OPEN_TARGET = Number(env("OPEN_TARGET", "3000"));
const CANARY_POOL = Number(env("CANARY_POOL", "100000")); // idle verifiers stop adding known answers here
/** idle verifiers also work open paid brain jobs (a second answer can be slow with few miners); 0 leaves them to miners */
const SEED_PAID = env("SEED_PAID", "1") !== "0";
/** finished screen jobs untouched this long are summed into screen_sums and deleted (canaries and paid jobs stay) */
const PRUNE_AFTER_MS = Number(env("PRUNE_AFTER_HOURS", "24")) * 3_600_000;
/**
 * Points multiplier for jobs miners opt into with "also run programs" (world runs, probes, WASM, shaders).
 *
 * Until 2026-09-20 this was 1.25, and the job units were set low so that units x 1.25 landed on a brain job's rate:
 * the multiplier was compensation baked into the pricing, not a bonus, but the UI advertised it as "1.25x points" —
 * the same number as the Operator stake tier, so miners read it as the stake reward being given away free (reported
 * by a miner that day). The units now carry the parity rate themselves (bridge/fly.toml) and this is what it says it
 * is: 1% on top, for needing a second agreeing miner and holding a lane longer.
 *
 * Changing it re-values credit that is already earned, because day_credit.program_units is stored raw and multiplied
 * at read time (DAY_SUMS). Any change needs a migration scaling the stored rows the other way — see schema 15.
 */
const PROGRAM_BONUS = Number(env("PROGRAM_BONUS", "1.01"));
const MAX_JOBS = Number(env("MAX_JOBS", "64")); // a GPU miner holds a whole batch (up to 32) at once
const JOB_TTL_MS = Number(env("JOB_TTL_MIN", "20")) * 60_000;
const TRUST_PROXY = !!process.env.TRUST_PROXY;
/** the origin wallets see in sign-in messages; defaults to the request's own host */
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN;
const CHAIN_ID = 4663; // Robinhood Chain, where $FLYAI lives
/** Monthly claims: the operator's snapshot key, and where MonthlyClaims lives (contracts/). */
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "";
const CLAIMS = {
  contract: process.env.CLAIMS_CONTRACT ?? null,
  chain_id: Number(env("CLAIM_CHAIN_ID", String(CHAIN_ID))),
  chain_name: env("CLAIM_CHAIN_NAME", "Robinhood Chain"),
  rpc: env("CLAIM_RPC", "https://rpc.mainnet.chain.robinhood.com"),
  explorer: env("CLAIM_EXPLORER", "https://robin.etherscan.io"), // Blockscout's API sits behind a Cloudflare check
  token_symbol: "FLYAI",
};
/** Stake tiers (src/staking.ts): off until STAKING_CONTRACT is set. */
const STAKING = {
  contract: process.env.STAKING_CONTRACT ?? null,
  token: env("TOKEN_ADDRESS", "0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C"),
  rpc: env("STAKE_RPC", CLAIMS.rpc),
  tiers: parseTiers(process.env.STAKE_TIERS),
  sampleMs: Number(env("STAKE_SAMPLE_MIN", "10")) * 60_000,
};
/** Buyers' uploads (programs, inputs) and miners' outputs, by sha256, next to the database. */
const BLOBS_DIR = env("BLOBS_DIR", join(dirname(DB_PATH), "blobs"));
const BLOB_MAX_BYTES = Number(env("BLOB_MAX_MB", "8")) * 1024 * 1024;
const STORE_MAX_BYTES = Number(env("STORE_MAX_MB", "600")) * 1024 * 1024;
/** uploads and outputs no live order uses are deleted after this */
const BLOB_TTL_MS = Number(env("BLOB_TTL_DAYS", "14")) * 86_400_000;
/** Webhooks may reach http and internal hosts: for tests only. */
const WEBHOOK_ALLOW_INTERNAL = !!process.env.WEBHOOK_ALLOW_INTERNAL;
/** Paid orders (src/orders.ts): off until PAY_TO is set. */
const ORDERS = orderConfig(process.env, STAKING.token);
/**
 * Paying for orders in USDC on Base, for buyers who start from a card (an onramp sells them USDC). The USDC goes to
 * PAY_TO on Base; the order is credited the $FLYAI it buys at the live price (the lower of GeckoTerminal and
 * DexScreener, no margin), so charges, the pool and miners' pay stay in $FLYAI. The operator funds the pool by hand.
 */
const USDC = {
  enabled: env("USDC_PAYMENTS", "1") !== "0",
  chain_id: Number(env("USDC_CHAIN_ID", "8453")),
  chain_name: env("USDC_CHAIN_NAME", "Base"),
  rpc: env("USDC_RPC", "https://mainnet.base.org"),
  explorer: env("USDC_EXPLORER", "https://basescan.org"),
  token: env("USDC_TOKEN", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"),
  quoteMs: Number(env("USDC_QUOTE_MIN", "30")) * 60_000,
  /** tests: a fixed $FLYAI price in USD instead of the live feeds */
  fixedPrice: process.env.FLYAI_USD_PRICE ?? null,
  /**
   * A link where a card buyer gets USDC on this chain ({wallet} and {amount} are filled in), from an onramp provider's
   * dashboard. Without it the page explains where to buy USDC and which address to send it to.
   */
  onrampUrl: process.env.USDC_ONRAMP_URL ?? null,
};
/** Gasless USDC (src/relay.ts): with RELAYER_KEY set, buyers sign and this wallet sends the transfer and pays gas. */
const relayer = process.env.RELAYER_KEY ? new Relayer(process.env.RELAYER_KEY, USDC.rpc) : null;
/** Card checkout (src/cdp.ts): Coinbase Onramp sells the buyer the order's USDC on Base, into their own wallet. */
const cdp = process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET ? new Cdp(process.env.CDP_API_KEY_ID, process.env.CDP_API_KEY_SECRET) : null;
/** CDP_SANDBOX=1: checkouts are marked as tests (partnerUserRef "sandbox-…") */
const CDP_SANDBOX = process.env.CDP_SANDBOX === "1";
/** the smallest card purchase, in USD: card checkouts have a minimum, and what's bought beyond the order stays in the buyer's wallet */
const CARD_MIN_CENTS = BigInt(Math.round(Number(env("CARD_MIN_USD", "2")) * 100));

// ---- the job grid ------------------------------------------------------------------------------------
// A sensory -> motor screen: each visual/touch channel on each side at four strengths, across global gain
// and tonic, plus undriven controls. 15 simulated seconds: 5 at rest, 10 driven. Round r of the screen
// uses seeds 3r+1..3r+3, so every round adds three more samples of every cell.
const STEPS = 750;
const WARM = 250;
const UNITS = STEPS / 100;
const PER_ROUND = 1107;

function round(r: number): TaskParams[] {
  const out: TaskParams[] = [];
  for (const gain of [2, 3, 4]) {
    for (const tonic of [0.1, 0.14, 0.18]) {
      for (const seed of [3 * r + 1, 3 * r + 2, 3 * r + 3]) {
        out.push({ channel: "none", side: "L", amount: 0, gain, tonic, seed, steps: STEPS, warm: WARM });
        for (const channel of CHANNELS) {
          for (const side of ["L", "R"] as const) {
            for (const amount of [0.1, 0.2, 0.4, 0.8]) out.push({ channel, side, amount, gain, tonic, seed, steps: STEPS, warm: WARM });
          }
        }
      }
    }
  }
  return out;
}

// ---- storage -----------------------------------------------------------------------------------------
const SCHEMA = 16; // 4 adds snapshots and snapshot_claims, 5 stake_samples, 6 orders, 7 result delivery, 8 buyers' programs, 9 house orders, 10 wallet sessions, 11 USDC payments, 12 guest card orders, 13 day_credit, 14 Fly Roulette bets (ledger kinds bet/payout, roulette_* tables, withdraw requests), 15 program units re-priced for PROGRAM_BONUS 1.25 -> 1.01, 16 screen_sums + counters (finished screen jobs pruned); created below for new and old databases alike
/** PROGRAM_BONUS before schema 15, and the factor stored program units are scaled by so credit keeps its value. */
const OLD_PROGRAM_BONUS = 1.25;
mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
const version = (db.prepare("pragma user_version").get() as { user_version: number }).user_version;
const hasTables = !!db.prepare("select 1 from sqlite_master where name = 'tasks'").get();
const hadDayCredit = !!db.prepare("select 1 from sqlite_master where name = 'day_credit'").get();
if (hasTables && version < 2) {
  throw new Error(`${DB_PATH} is from an older version of the mining server; move it aside to start fresh`);
}
if (hasTables && version === 2) {
  // 3: miners prove a wallet (Sign-In with Ethereum)
  db.exec(`
    alter table miners add column wallet text;
    alter table miners add column wallet_at integer;
  `);
  console.log("database upgraded to schema 3 (miner wallets)");
}
if (hasTables && version < 6) {
  // 6: paid jobs are handed out first
  db.exec("alter table tasks add column priority integer not null default 0");
  console.log("database upgraded to schema 6 (paid orders)");
}
if (hasTables && version === 6) {
  // 7: results fed to buyers in settle order, by stream or webhook
  db.exec(`
    alter table order_tasks add column seq integer;
    alter table orders add column webhook text;
    alter table orders add column webhook_secret text;
    alter table orders add column webhook_seq integer not null default 0;
    alter table orders add column webhook_final integer not null default 0;
    alter table orders add column webhook_fails integer not null default 0;
    alter table orders add column webhook_next_at integer;
    alter table orders add column webhook_error text;
  `);
  console.log("database upgraded to schema 7 (result delivery)");
}
if (hasTables && version < 8) {
  // 8: buyers' own programs (wasm, wgsl) alongside the brain
  db.exec(`
    alter table tasks add column kind text not null default 'connectome';
    alter table tasks add column settled_by text;
  `);
  if (version >= 6) db.exec("alter table orders add column order_key_hash text");
  console.log("database upgraded to schema 8 (buyers' programs)");
}
if (hasTables && version >= 6 && version < 12) {
  // 12: orders paid by card with no wallet (the dev wallet holds them)
  db.exec("alter table orders add column guest integer not null default 0");
  console.log("database upgraded to schema 12 (guest card orders)");
}
if (hasTables && version < 9) {
  // 9: house orders (our own work, unpaid) and results kept for good
  if (version >= 6) db.exec("alter table orders add column house integer not null default 0; alter table orders add column label text; alter table orders add column house_units real");
  if (version >= 8) db.exec("alter table blobs add column keep integer not null default 0");
  console.log("database upgraded to schema 9 (house orders)");
}
if (hasTables && version < 14 && db.prepare("select 1 from sqlite_master where name = 'ledger'").get()) {
  // 14: the ledger's kinds gain bet and payout (Fly Roulette). SQLite can't alter a check, so copy the table
  // into one with the new check; its indexes are made again below.
  const rows = (db.prepare("select count(*) as n from ledger").get() as { n: number }).n;
  db.exec("begin");
  try {
    db.exec(`
      create table ledger_v14 (
        id integer primary key,
        wallet text not null,
        order_id text,
        kind text not null check (kind in ('deposit', 'fund', 'release', 'withdraw', 'charge', 'bet', 'payout')),
        amount_wei text not null,
        pool_wei text,
        month text,
        tx text,
        at integer not null
      );
      insert into ledger_v14 (id, wallet, order_id, kind, amount_wei, pool_wei, month, tx, at)
        select id, wallet, order_id, kind, amount_wei, pool_wei, month, tx, at from ledger;
      drop table ledger;
      alter table ledger_v14 rename to ledger;
    `);
    const after = (db.prepare("select count(*) as n from ledger").get() as { n: number }).n;
    if (after !== rows) throw new Error(`ledger copy has ${after} rows, not ${rows}`);
    db.exec("commit");
  } catch (err) {
    db.exec("rollback");
    throw err;
  }
  console.log(`database upgraded to schema 14 (ledger kinds for roulette, ${rows} rows kept)`);
}
if (hasTables && version < 15 && hadDayCredit) {
  // 15: PROGRAM_BONUS drops 1.25 -> 1.01 and the job units rise to carry the parity rate themselves. Program units
  // are stored raw and multiplied at read time, so without this every point already earned on the toggle would lose
  // 19% the moment the new constant shipped. Scaling the stored rows by the same factor keeps each one worth what it
  // was worth when it was earned. Closed months are already frozen in snapshots/snapshot_claims and are untouched;
  // tasks.units moves with it so the day_credit triggers keep subtracting what they added.
  const factor = OLD_PROGRAM_BONUS / Number(env("PROGRAM_BONUS", "1.01"));
  transaction(() => {
    db.prepare("update day_credit set program_units = program_units * ?").run(factor);
    db.prepare("update tasks set units = units * ? where kind is not null and kind != 'connectome'").run(factor);
  });
  console.log(`database upgraded to schema 15 (program units x${factor.toFixed(4)}, credit value unchanged)`);
}
db.exec(`
  pragma journal_mode = wal;
  pragma user_version = ${SCHEMA};
  create table if not exists tasks (
    id integer primary key,
    params text not null unique,
    units real not null,
    round integer not null,
    r real not null,                  -- random sort key: picking a job is an index seek, not a shuffle
    state text not null default 'open' check (state in ('open', 'out', 'done')),
    truth text,                       -- the server's own result, once re-run here
    checked_at integer,
    priority integer not null default 0, -- 1 while a paid order still needs it settled
    kind text not null default 'connectome', -- or a buyer's program: 'wasm', 'wgsl' (never canaries, never re-run here)
    settled_by text                   -- programs: 'single', 'agreement' or 'disputed'
  );
  create index if not exists tasks_open on tasks (state, r);
  create index if not exists tasks_paid on tasks (r) where state = 'open' and priority > 0;
  create index if not exists tasks_canary on tasks (r) where truth is not null;
  create table if not exists miners (
    id text primary key,
    token_hash text not null unique,
    label text,                       -- what the miner typed (e.g. a wallet); not proven
    created_at integer not null,
    last_seen integer,
    strikes integer not null default 0, -- wrong answers ever; any strike makes its unchecked answers untrusted
    wallet text,                      -- checksummed address proven by a signature; one wallet may have many miners
    wallet_at integer
  );
  create index if not exists miners_by_wallet on miners (wallet) where wallet is not null;
  create table if not exists assignments (
    id text primary key,
    miner text not null references miners(id),
    task integer not null references tasks(id),
    issued_at integer not null,
    expires_at integer not null,
    submitted_at integer,
    day text,                         -- UTC date of submission: the credit epoch
    result text,
    status text not null check (status in ('issued', 'pending', 'accepted', 'rejected', 'expired'))
  );
  create index if not exists assignments_by_miner on assignments (miner, status);
  create index if not exists assignments_by_task on assignments (task, status);
  create index if not exists assignments_by_day on assignments (day, miner);
  create index if not exists assignments_issued on assignments (expires_at) where status = 'issued';
  -- 13: each miner-day's credit kept as it happens, so pages and month points never scan the assignments
  create table if not exists day_credit (
    day text not null,
    miner text not null,
    units real not null default 0,         -- brain jobs accepted or pending
    program_units real not null default 0, -- everything else accepted or pending, before PROGRAM_BONUS
    accepted integer not null default 0,
    pending integer not null default 0,
    rejected integer not null default 0,
    primary key (day, miner)
  ) without rowid;
  create index if not exists day_credit_by_miner on day_credit (miner);
  create trigger if not exists day_credit_insert after insert on assignments when new.day is not null begin
    insert into day_credit (day, miner, units, program_units, accepted, pending, rejected)
      select new.day, new.miner, (case when new.status in ('accepted', 'pending') then coalesce((select units from tasks where id = new.task and kind = 'connectome'), 0) else 0 end), (case when new.status in ('accepted', 'pending') then coalesce((select units from tasks where id = new.task and kind != 'connectome'), 0) else 0 end), new.status = 'accepted', new.status = 'pending', new.status = 'rejected' where new.day is not null
      on conflict (day, miner) do update set units = units + excluded.units, program_units = program_units + excluded.program_units,
        accepted = accepted + excluded.accepted, pending = pending + excluded.pending, rejected = rejected + excluded.rejected;
  end;
  create trigger if not exists day_credit_update after update of status, day on assignments
    when old.status is not new.status or old.day is not new.day begin
    update day_credit set units = units - (case when old.status in ('accepted', 'pending') then coalesce((select units from tasks where id = old.task and kind = 'connectome'), 0) else 0 end), program_units = program_units - (case when old.status in ('accepted', 'pending') then coalesce((select units from tasks where id = old.task and kind != 'connectome'), 0) else 0 end),
      accepted = accepted - (old.status = 'accepted'), pending = pending - (old.status = 'pending'), rejected = rejected - (old.status = 'rejected')
      where old.day is not null and day = old.day and miner = old.miner;
    insert into day_credit (day, miner, units, program_units, accepted, pending, rejected)
      select new.day, new.miner, (case when new.status in ('accepted', 'pending') then coalesce((select units from tasks where id = new.task and kind = 'connectome'), 0) else 0 end), (case when new.status in ('accepted', 'pending') then coalesce((select units from tasks where id = new.task and kind != 'connectome'), 0) else 0 end), new.status = 'accepted', new.status = 'pending', new.status = 'rejected' where new.day is not null
      on conflict (day, miner) do update set units = units + excluded.units, program_units = program_units + excluded.program_units,
        accepted = accepted + excluded.accepted, pending = pending + excluded.pending, rejected = rejected + excluded.rejected;
  end;
  -- 16: no delete trigger. Assignments are only ever deleted by pruning, and a pruned job's credit must stay earned.
  drop trigger if exists day_credit_delete;
  -- a wallet signed in once on the site: links miners, spends its balance and stops its orders without signing again
  create table if not exists sessions (
    token_hash text primary key,
    wallet text not null,
    created_at integer not null,
    expires_at integer not null
  );
  -- USDC on Base: an order's price in USDC, fixed for USDC_QUOTE_MIN; units end in a tag so a transfer matches one quote
  create table if not exists usdc_quotes (
    order_id text primary key,
    units text not null,              -- micro-USDC (6 decimals)
    price_e18 text not null,          -- USD per $FLYAI, times 1e18
    created_at integer not null,
    expires_at integer not null
  );
  create table if not exists usdc_payments (
    tx text primary key,              -- on Base
    order_id text not null,
    wallet text not null,
    units text not null,
    price_e18 text not null,          -- the price the $FLYAI credit used
    flyai_wei text not null,          -- credited to the wallet's balance, then (usually) the order
    month text not null,
    at integer not null
  );
  create index if not exists usdc_payments_by_month on usdc_payments (month);
  -- a card checkout opened for an order (Coinbase Onramp, paying PAY_TO); checked until Coinbase reports it done
  create table if not exists card_checkouts (
    order_id text primary key,
    ref text not null,                -- the partnerUserRef Coinbase files its transactions under
    usdc text not null,               -- what the checkout sells, in dollars
    created_at integer not null,
    state text not null default 'open', -- open, paid, failed
    reason text
  );
  -- a closed month's payout: the pool the operator chose, split by points, committed to by a Merkle root
  create table if not exists snapshots (
    month text primary key,           -- YYYY-MM
    pool_wei text not null,
    root text not null,
    total_points real not null,
    wallets integer not null,
    created_at integer not null
  );
  create table if not exists snapshot_claims (
    month text not null references snapshots(month),
    wallet text not null,
    points real not null,
    amount_wei text not null,
    proof text not null,              -- JSON array of bytes32 hex
    primary key (month, wallet)
  );
  create index if not exists snapshot_claims_by_wallet on snapshot_claims (wallet);
  -- a wallet's FlyStaking balance on a UTC day: the lowest sample sets that day's multiplier, so stake only
  -- counts for a day it was in place all day; the latest is what the wallet has now
  -- a pool announced ahead of a month's end, shown to miners as an estimate; the snapshot can still differ
  create table if not exists announcements (
    month text primary key,
    pool_wei text not null,
    created_at integer not null
  );
  create table if not exists stake_samples (
    wallet text not null,
    day text not null,
    staked_wei text not null,         -- lowest sample of the day
    last_wei text not null,
    sampled_at integer not null,
    primary key (wallet, day)
  );
  -- a buyer's sweep with a bid per job and a budget (src/orders.ts)
  create table if not exists orders (
    id text primary key,
    wallet text not null,             -- checksummed; pays, and signs to spend its balance or stop the order
    spec text not null,               -- normalized; expanded again as the order runs
    jobs integer not null,            -- in the sweep
    bid_wei text not null,            -- charged per job settled
    budget_wei text not null,         -- a transfer's budget ends in the order's tag
    tag integer not null,
    max_parallel integer not null,    -- jobs out at once
    hours real,                       -- time limit once funded; null for none
    status text not null check (status in ('unpaid', 'expired', 'live', 'done', 'ended')),
    end_reason text,                  -- done: 'sweep'; ended: 'budget', 'time' or 'stopped'
    cursor integer not null default 0, -- sweep jobs taken on so far
    spent_wei text not null default '0',
    tx text,                          -- the funding transfer, if paid that way
    created_at integer not null,
    expires_at integer not null,      -- an unpaid order's deadline
    funded_at integer,
    ends_at integer,
    closed_at integer,
    webhook text,                     -- https URL the settled rows are POSTed to (src/webhooks.ts)
    webhook_secret text,              -- signs those POSTs; shown to the buyer once
    webhook_seq integer not null default 0, -- last row seq the webhook accepted
    webhook_final integer not null default 0, -- 1 once the closing status was delivered
    webhook_fails integer not null default 0,
    webhook_next_at integer,
    webhook_error text,
    order_key_hash text,              -- programs: sha256 of the key that adds jobs or stops the order from code
    house integer not null default 0, -- 1: our own work, created by the operator, unpaid; runs after paid orders, before the screen
    label text,                       -- house: what it is, e.g. "tuning/sshfighter"
    house_units real,                 -- house programs: points per settled job (brain sweeps earn their usual units)
    guest integer not null default 0  -- 1: paid by card with no wallet; its wallet is PAY_TO and its key is the buyer's
  );
  create index if not exists orders_by_wallet on orders (wallet, created_at);
  create index if not exists orders_live on orders (status) where status = 'live';
  create unique index if not exists orders_unpaid_tag on orders (tag) where status = 'unpaid';
  create table if not exists order_tasks (
    order_id text not null references orders(id),
    task integer not null references tasks(id),
    state integer not null,           -- 1 out to miners, 2 settled and charged, 3 dropped when the order closed
    charged_wei text,
    seq integer,                      -- settle order across all orders: results are fed to buyers by it
    primary key (order_id, task)
  );
  create index if not exists order_tasks_by_seq on order_tasks (order_id, seq) where state = 2;
  create index if not exists order_tasks_active on order_tasks (task) where state = 1;
  -- every token movement of a wallet's balance: deposit (a transfer in), fund (to an order), release (an order's
  -- unspent budget back), withdraw (the operator sent it back on-chain); charge rows record spending and the pool
  create table if not exists ledger (
    id integer primary key,
    wallet text not null,
    order_id text,
    kind text not null check (kind in ('deposit', 'fund', 'release', 'withdraw', 'charge', 'bet', 'payout')),
    amount_wei text not null,
    pool_wei text,                    -- charge: the miners' part
    month text,                       -- charge: the pool month
    tx text,
    at integer not null
  );
  create index if not exists ledger_by_wallet on ledger (wallet, at);
  create index if not exists ledger_charges on ledger (month) where kind = 'charge';
  create unique index if not exists ledger_tx on ledger (tx) where tx is not null;
  -- a program order's jobs, in order: each is one input
  create table if not exists order_inputs (
    order_id text not null references orders(id),
    idx integer not null,
    input text not null,              -- blob sha256
    primary key (order_id, idx)
  );
  create table if not exists blobs (
    hash text primary key,            -- sha256 of the bytes in BLOBS_DIR/<hash>
    size integer not null,
    created_at integer not null,
    used_at integer not null,         -- last time an order or a result referred to it; old unused blobs are deleted
    keep integer not null default 0   -- 1: a house order's program, input or output, never deleted
  );
  -- program jobs pay the miners who settled them directly: the pool part of the charge, split by wallet
  create table if not exists earnings (
    month text not null,
    wallet text not null,
    order_id text not null,
    task integer not null,
    amount_wei text not null,
    at integer not null
  );
  create index if not exists earnings_by_month on earnings (month, wallet);
  -- 14: Fly Roulette. A commit is a server seed shown only as its hash until the game it seeds is over.
  create table if not exists roulette_commits (
    id text primary key,
    wallet text not null,
    server_seed text not null,
    hash text not null,
    created_at integer not null,
    used integer not null default 0
  );
  create index if not exists roulette_commits_by_wallet on roulette_commits (wallet, created_at);
  create table if not exists roulette_games (
    id text primary key,
    wallet text not null,
    flies integer not null,
    pick integer not null,
    stake_wei text not null,
    payout_wei text not null,          -- what a win pays (stake x flies x (1 - edge))
    edge real not null,
    commit_hash text not null,
    server_seed text not null,         -- secret until the game is done
    client_seed text not null,
    names text not null,               -- JSON: who sat at the table
    status text not null check (status in ('live', 'done', 'void')),
    winner integer,
    events integer not null default 0,
    created_at integer not null,
    done_at integer
  );
  create index if not exists roulette_games_by_wallet on roulette_games (wallet, created_at);
  create index if not exists roulette_games_live on roulette_games (status) where status = 'live';
  create index if not exists roulette_games_done on roulette_games (done_at) where status = 'done';
  create table if not exists roulette_events (
    game text not null,
    seq integer not null,
    event text not null,
    primary key (game, seq)
  ) without rowid;
  create table if not exists roulette_terms (
    wallet text primary key,
    version integer not null,
    accepted_at integer not null
  );
  -- players ask for their balance back; the operator sends it and records it with POST /api/admin/withdraw
  create table if not exists withdraw_requests (
    id integer primary key,
    wallet text not null,
    amount_wei text not null,
    status text not null check (status in ('open', 'paid', 'cancelled')),
    created_at integer not null,
    done_at integer,
    tx text
  );
  create index if not exists withdraw_requests_open on withdraw_requests (wallet) where status = 'open';
  -- 16: finished screen jobs are deleted after PRUNE_AFTER_HOURS (their rows filled /data twice). Their answers live
  -- on here, summed per stimulus in the unit /api/results reports; counters keeps the job totals the stats show.
  create table if not exists screen_sums (
    key text primary key,             -- the job's params without the seed (src/screensum.ts)
    seeds integer not null,
    base text not null,               -- JSON: per output group, spikes per neuron per second summed over seeds
    stim text not null
  ) without rowid;
  create table if not exists counters (name text primary key, n integer not null) without rowid;
  create index if not exists order_tasks_by_task on order_tasks (task);
`);
if (hasTables && !hadDayCredit) {
  // 13: one pass over every assignment so far; from here on the triggers keep it
  const t = Date.now();
  db.exec(`insert into day_credit (day, miner, units, program_units, accepted, pending, rejected)
    select a.day, a.miner,
      coalesce(sum(case when a.status in ('accepted', 'pending') and t.kind = 'connectome' then t.units end), 0),
      coalesce(sum(case when a.status in ('accepted', 'pending') and t.kind != 'connectome' then t.units end), 0),
      coalesce(sum(a.status = 'accepted'), 0), coalesce(sum(a.status = 'pending'), 0), coalesce(sum(a.status = 'rejected'), 0)
    from assignments a join tasks t on t.id = a.task where a.day is not null group by a.day, a.miner`);
  console.log(`database upgraded to schema 13 (day_credit, ${Date.now() - t} ms)`);
}

type TaskRow = { id: number; params: string; kind?: string };
const one = <T>(sql: string, ...args: (string | number | null)[]) => db.prepare(sql).get(...args) as T;
const count = (sql: string, ...args: (string | number | null)[]) => one<{ n: number }>(sql, ...args).n;

function transaction<T>(fn: () => T): T {
  db.exec("begin");
  try {
    const out = fn();
    db.exec("commit");
    return out;
  } catch (err) {
    db.exec("rollback");
    throw err;
  }
}

/** Keep at least OPEN_TARGET jobs open by adding rounds of the screen. */
function topUp(): void {
  let open = count("select count(*) as n from tasks where state = 'open' and kind = 'connectome'");
  if (open >= OPEN_TARGET) return;
  const insert = db.prepare("insert into tasks (params, units, round, r) values (?, ?, ?, ?)");
  let next = (one<{ r: number | null }>("select max(round) as r from tasks").r ?? -1) + 1;
  const first = next;
  transaction(() => {
    for (; open < OPEN_TARGET; next++, open += PER_ROUND) {
      for (const p of round(next)) insert.run(JSON.stringify(p), UNITS, next, Math.random());
    }
  });
  console.log(`added screen round${next - first > 1 ? `s ${first}-${next - 1}` : ` ${first}`} (${(next - first) * PER_ROUND} jobs)`);
}

/** Jobs not returned in time go back out. */
function expire(): void {
  reopen(db.prepare("update assignments set status = 'expired' where status = 'issued' and expires_at < ? returning task")
    .all(Date.now()) as { task: number }[]);
}

function reopen(gone: { task: number }[]): void {
  const stmt = db.prepare(`update tasks set state = 'open' where id = ? and state = 'out'
    and not exists (select 1 from assignments where task = ? and status = 'issued')`);
  for (const { task } of gone) stmt.run(task, task);
}

/**
 * Jobs a miner gives back unrun: all it holds (a page that reloaded lost track of them), or the listed ones (a
 * program this machine can't run). Without this they'd fill its MAX_JOBS until they time out.
 */
function release(miner: string, jobs: unknown): { released: number } {
  if (jobs !== undefined && (!Array.isArray(jobs) || jobs.length > MAX_JOBS || jobs.some((j) => typeof j !== "string"))) {
    throw new HttpError(400, `jobs is a list of up to ${MAX_JOBS} job ids`);
  }
  return transaction(() => {
    const gone = (jobs === undefined
      ? db.prepare("update assignments set status = 'expired' where miner = ? and status = 'issued' returning task").all(miner)
      : (jobs as string[]).flatMap((id) => db.prepare("update assignments set status = 'expired' where id = ? and miner = ? and status = 'issued' returning task").all(id, miner))
    ) as { task: number }[];
    reopen(gone);
    return { released: gone.length };
  });
}

// ---- verifiers ---------------------------------------------------------------------------------------
interface Reference {
  /** GET /api/model: the integer engine's constants, the same for every miner */
  model: { w20: string; decay: number; noise_thresh: number; noise_amp: number; outputs: string[] };
  outputs: string[];
  outputSizes: number[];
  dt: number;
  /** neurons in each probe record set (src/probe.ts), to read probe outputs */
  recordSizes: Record<string, number>;
}
let reference: Reference | null = null;

interface Verifier { worker: Worker; ready: boolean; task: number | null }
const auditQueue: number[] = [];
const queued = new Set<number>();
let auditsSkipped = 0;

const pool: Verifier[] = Array.from({ length: VERIFIERS }, () => {
  const v: Verifier = { worker: new Worker(new URL("./verifier.ts", import.meta.url), { workerData: { dir: CONNECTOME_DIR } }), ready: false, task: null };
  v.worker.on("message", (msg: any) => {
    if (msg.type === "ready") {
      v.ready = true;
      if (!reference) {
        const w20: Int32Array = msg.fixed.w20;
        reference = {
          model: {
            w20: Buffer.from(w20.buffer, w20.byteOffset, w20.byteLength).toString("base64"),
            decay: msg.fixed.decay, noise_thresh: msg.fixed.noiseThresh, noise_amp: msg.fixed.noiseAmp, outputs: msg.outputs,
          },
          outputs: msg.outputs, outputSizes: msg.outputSizes, dt: msg.dt, recordSizes: msg.recordSizes,
        };
        console.log(`connectome loaded, ${reference.outputs.length} motor groups; serving on http://localhost:${PORT}`);
      }
    } else {
      if (msg.type === "done") settleTask(msg.task, canonical(msg.result));
      else console.error(`audit of task ${msg.task} failed: ${msg.text}`);
      queued.delete(msg.task);
      v.task = null;
    }
    pump();
  });
  v.worker.on("error", (err) => {
    console.error("verifier crashed:", err);
    process.exit(1);
  });
  return v;
});

/** `urgent`: miners disagree on a paid job, so it goes first and is never skipped. */
function audit(task: number, urgent = false): void {
  if (queued.has(task)) return;
  if (!urgent && auditQueue.length >= AUDIT_QUEUE_MAX) {
    auditsSkipped++;
    return;
  }
  queued.add(task);
  if (urgent) auditQueue.unshift(task);
  else auditQueue.push(task);
  pump();
}

function pump(): void {
  for (const v of pool) {
    while (v.ready && v.task === null && auditQueue.length) {
      const task = auditQueue.shift()!;
      const row = one<{ params: string; truth: string | null }>("select params, truth from tasks where id = ?", task);
      if (row.truth) {
        queued.delete(task);
        continue;
      }
      v.task = task;
      v.worker.postMessage({ type: "run", task, params: JSON.parse(row.params) });
    }
    if (v.ready && v.task === null) seed(v);
  }
}

/**
 * With nothing to check, a verifier works an open job itself. The answer is research like any other, and
 * it joins the canary pool: without a big pool a fast miner soon runs out of canaries it hasn't had.
 */
function seed(v: Verifier): void {
  // paid jobs first, whatever the pool's size: with few miners about, a second answer may be slow to come
  // (only the brain: buyers' programs are never run here)
  const row = (SEED_PAID ? one<TaskRow | undefined>("select id, params from tasks where state = 'open' and priority > 0 and kind = 'connectome' order by r limit 1") : undefined)
    ?? (count("select count(*) as n from tasks where truth is not null and kind = 'connectome'") >= CANARY_POOL ? undefined
      : one<TaskRow | undefined>("select id, params from tasks where state = 'open' and kind = 'connectome' and r >= ? order by r limit 1", Math.random())
        ?? one<TaskRow | undefined>("select id, params from tasks where state = 'open' and kind = 'connectome' order by r limit 1"));
  if (!row) return;
  db.prepare("update tasks set state = 'out' where id = ?").run(row.id); // not handed to a miner meanwhile
  queued.add(row.id);
  v.task = row.id;
  v.worker.postMessage({ type: "run", task: row.id, params: JSON.parse(row.params) });
}

/** A wrong answer: the miner's day is zeroed and its unchecked answers stop counting, so those jobs reopen. */
function strike(miner: string): void {
  db.prepare("update miners set strikes = strikes + 1 where id = ?").run(miner);
  db.prepare(`update tasks set state = 'open' where truth is null and state = 'done'
    and id in (select task from assignments where miner = ? and status = 'pending')`).run(miner);
  // paid jobs it answered need another answer, ahead of the screen again (they aren't charged twice), and the server
  // re-runs them itself right away rather than leave a buyer waiting on more miners
  const paid = db.prepare(`update tasks set priority = 1 where truth is null and kind = 'connectome' and id in (select task from order_tasks where state in (1, 2))
    and id in (select task from assignments where miner = ? and status = 'pending') returning id`).all(miner) as { id: number }[];
  if (paid.length) setImmediate(() => { for (const { id } of paid) audit(id, true); });
}

/** The server now knows the answer: record it and judge every answer still waiting on it. */
function settleTask(task: number, truth: string): void {
  transaction(() => {
    db.prepare("update tasks set truth = ?, checked_at = ?, state = 'done' where id = ?").run(truth, Date.now(), task);
    db.prepare("update assignments set status = 'accepted' where task = ? and status = 'pending' and result = ?").run(task, truth);
    const wrong = db.prepare("update assignments set status = 'rejected' where task = ? and status = 'pending' and result != ? returning miner")
      .all(task, truth) as { miner: string }[];
    for (const { miner } of wrong) strike(miner);
    if (wrong.length) console.log(`task ${task}: ${wrong.length} wrong answer(s) rejected`);
    db.prepare("update tasks set priority = 0 where id = ?").run(task);
    onSettled(task);
  });
}

/**
 * A job's settled answer: the server's own, or one that ORDER_REDUNDANCY different miners with no wrong answers
 * returned (miners of one wallet count once). Null while neither holds.
 */
function settled(task: number): { result: string; by: string } | null {
  const { truth, kind, settled_by } = one<{ truth: string | null; kind: string; settled_by: string | null }>("select truth, kind, settled_by from tasks where id = ?", task);
  if (kind !== "connectome") return truth ? { result: truth, by: settled_by ?? "agreement" } : null;
  if (truth) return { result: truth, by: "server" };
  const top = one<{ result: string; n: number } | undefined>(`select a.result, count(distinct coalesce(m.wallet, m.id)) as n
    from assignments a join miners m on m.id = a.miner
    where a.task = ? and a.status = 'pending' and m.strikes = 0 group by a.result order by n desc limit 1`, task);
  return top && top.n >= ORDERS.redundancy ? { result: top.result, by: "miners" } : null;
}

/** Clean miners gave a paid job different answers: at least one is wrong, so the server re-runs it first. */
const disputed = (task: number) => count(`select count(distinct a.result) as n from assignments a join miners m on m.id = a.miner
  where a.task = ? and a.status = 'pending' and m.strikes = 0`, task) > 1;

// ---- results -----------------------------------------------------------------------------------------
const HASH = /^[0-9a-f]{16}$/;

/** The one string form a result is compared in; "" for anything malformed. */
function canonical(r: unknown): string {
  const x = r as TaskResult;
  const groups = reference?.outputs.length ?? 0;
  const counts = (a: unknown) => Array.isArray(a) && a.length === groups && a.every((c) => Number.isSafeInteger(c) && c >= 0);
  if (!x || typeof x.hash !== "string" || !HASH.test(x.hash) || !Number.isSafeInteger(x.spikes) || x.spikes < 0
    || !counts(x.base) || !counts(x.stim)) return "";
  return JSON.stringify({ hash: x.hash, spikes: x.spikes, base: x.base, stim: x.stim });
}

// ---- http --------------------------------------------------------------------------------------------
class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const today = () => new Date().toISOString().slice(0, 10);
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** A value recomputed at most every `ms`, for numbers every page polls. */
function cached<K, T>(ms: number, compute: (key: K) => T): (key: K) => T {
  const hits = new Map<K, { at: number; value: T }>();
  return (key) => {
    const hit = hits.get(key);
    if (hit && Date.now() - hit.at < ms) return hit.value;
    const value = compute(key);
    hits.set(key, { at: Date.now(), value });
    return value;
  };
}

/**
 * Any origin may call the API (the browser extension runs on its own). Safe because miners authenticate
 * with a bearer token, never cookies, so another site gains nothing a script calling the API directly wouldn't.
 */
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type, x-flyai-session", "access-control-max-age": "86400" };

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...CORS });
  res.end(status === 204 ? undefined : JSON.stringify(body));
}

async function readJson(req: IncomingMessage, limit = 64_000): Promise<any> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, "body too large");
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "body is not JSON");
  }
}

function minerOf(req: IncomingMessage): string {
  const token = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.authorization ?? "")?.[1];
  const row = token ? one<{ id: string } | undefined>("select id from miners where token_hash = ?", sha256(token)) : undefined;
  if (!row) throw new HttpError(401, "unknown miner, register again");
  db.prepare("update miners set last_seen = ? where id = ?").run(Date.now(), row.id);
  return row.id;
}

/** Behind a proxy: fly.io's Fly-Client-IP, which the client can't set, else the first X-Forwarded-For. */
function clientIp(req: IncomingMessage): string {
  if (!TRUST_PROXY) return req.socket.remoteAddress || "?";
  const fly = req.headers["fly-client-ip"];
  const fwd = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
  return (typeof fly === "string" && fly) || fwd || req.socket.remoteAddress || "?";
}

const registrations = new Map<string, number[]>();
function register(req: IncomingMessage, body: any) {
  const ip = clientIp(req);
  const hourAgo = Date.now() - 3_600_000;
  const recent = (registrations.get(ip) ?? []).filter((t) => t > hourAgo);
  if (recent.length >= 5) throw new HttpError(429, "too many new miners from this address, try later");
  registrations.set(ip, [...recent, Date.now()]);
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 64) : "";
  const token = randomBytes(32).toString("hex");
  const id = randomUUID();
  db.prepare("insert into miners (id, token_hash, label, created_at) values (?, ?, ?, ?)").run(id, sha256(token), label || null, Date.now());
  return { miner: id, token };
}

// ---- wallets -----------------------------------------------------------------------------------------
// Sign-In with Ethereum. The server writes the message (nothing a client wrote is ever parsed), keeps it
// with a single-use nonce for 10 minutes, and links the wallet that signed it to the miner.
// The extension can't reach a browser wallet, so it gets a one-time link code and opens /compute/connect#code,
// where the user signs in a normal tab; the code stands in for the miner's token there.
const SIGN_IN_TTL_MS = 10 * 60_000;
const PENDING_MAX = 10_000;
const linkCodes = new Map<string, { miner: string; expires: number }>();
const nonces = new Map<string, { miner: string; address: string; message: string; code: string | null; expires: number }>();

/** Drop expired entries, and the oldest if a map is full (entries need a registered miner, but still). */
function prune<V extends { expires: number }>(map: Map<string, V>): void {
  const now = Date.now();
  for (const [k, v] of map) if (v.expires < now) map.delete(k);
  while (map.size >= PENDING_MAX) map.delete(map.keys().next().value!);
}

function originOf(req: IncomingMessage): URL {
  if (PUBLIC_ORIGIN) return new URL(PUBLIC_ORIGIN);
  const proto = TRUST_PROXY ? String(req.headers["x-forwarded-proto"] ?? "https").split(",")[0].trim() : "http";
  return new URL(`${proto}://${req.headers.host ?? `localhost:${PORT}`}`);
}

function link(req: IncomingMessage, miner: string) {
  prune(linkCodes);
  const code = randomBytes(16).toString("hex");
  const expires = Date.now() + SIGN_IN_TTL_MS;
  linkCodes.set(code, { miner, expires });
  return { code, url: `${originOf(req).origin}/compute/connect#${code}`, expires_at: expires };
}

/** The miner a sign-in is for: the bearer token, or a link code from the extension. */
function signInMiner(req: IncomingMessage, code: unknown): { miner: string; code: string | null } {
  if (typeof code === "string" && code) {
    const entry = linkCodes.get(code);
    if (!entry || entry.expires < Date.now()) throw new HttpError(410, "this link has expired; open Connect wallet again from the extension");
    return { miner: entry.miner, code };
  }
  return { miner: minerOf(req), code: null };
}

function nonceFor(req: IncomingMessage, body: any) {
  const { miner, code } = signInMiner(req, body.code);
  if (typeof body.address !== "string" || !ADDRESS.test(body.address)) throw new HttpError(400, "address must be 0x followed by 40 hex digits");
  prune(nonces);
  const origin = originOf(req);
  const nonce = randomBytes(12).toString("hex");
  const now = new Date();
  const message = siweMessage({
    domain: origin.host,
    address: body.address,
    statement: `Link this wallet to fly.ai compute miner ${miner.slice(0, 8)}, so its credit is paid here.`,
    uri: origin.origin,
    chainId: CHAIN_ID,
    nonce,
    issuedAt: now,
    expirationTime: new Date(now.getTime() + SIGN_IN_TTL_MS),
  });
  nonces.set(nonce, { miner, address: checksumAddress(body.address), message, code, expires: now.getTime() + SIGN_IN_TTL_MS });
  return { nonce, message };
}

function verifySignIn(body: any) {
  const pending = typeof body.nonce === "string" ? nonces.get(body.nonce) : undefined;
  if (!pending || pending.expires < Date.now()) throw new HttpError(410, "this sign-in has expired; try again");
  let signer: string;
  try {
    signer = recoverAddress(pending.message, String(body.signature ?? ""));
  } catch (err) {
    throw new HttpError(400, `bad signature: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (signer !== pending.address) throw new HttpError(401, "the signature is from a different wallet");
  nonces.delete(body.nonce); // single use, like the link code below
  if (pending.code) linkCodes.delete(pending.code);
  db.prepare("update miners set wallet = ?, wallet_at = ? where id = ?").run(signer, Date.now(), pending.miner);
  console.log(`miner ${pending.miner.slice(0, 8)} linked to ${signer}`);
  void sampleStake(signer).catch(() => {}); // so the tier shows right away
  return { wallet: signer, miner: pending.miner.slice(0, 8) };
}

// ---- wallet sessions ---------------------------------------------------------------------------------
// One Sign-In with Ethereum per browser instead of a signature on every page and action. The token travels as
// x-flyai-session (Authorization stays the miner's) and proves the wallet for linking miners, spending its
// balance and stopping its orders. The per-action signatures above still work for API clients and old pages.
const SESSION_TTL_MS = Number(env("SESSION_DAYS", "30")) * 86_400_000;
const sessionNonces = new Map<string, { address: string; message: string; expires: number }>();

function sessionNonce(req: IncomingMessage, body: any) {
  if (typeof body.address !== "string" || !ADDRESS.test(body.address)) throw new HttpError(400, "address must be 0x followed by 40 hex digits");
  prune(sessionNonces);
  const origin = originOf(req);
  const nonce = randomBytes(12).toString("hex");
  const now = new Date();
  const message = siweMessage({
    domain: origin.host,
    address: body.address,
    statement: `Sign in to fly.ai (compute and Fly Roulette) for ${Math.round(SESSION_TTL_MS / 86_400_000)} days. Free, and sends no transaction.`,
    uri: origin.origin,
    chainId: CHAIN_ID,
    nonce,
    issuedAt: now,
    expirationTime: new Date(now.getTime() + SIGN_IN_TTL_MS),
  });
  sessionNonces.set(nonce, { address: checksumAddress(body.address), message, expires: now.getTime() + SIGN_IN_TTL_MS });
  return { nonce, message };
}

function startSession(body: any) {
  const pending = typeof body.nonce === "string" ? sessionNonces.get(body.nonce) : undefined;
  if (!pending || pending.expires < Date.now()) throw new HttpError(410, "this sign-in has expired; try again");
  let signer: string;
  try {
    signer = recoverAddress(pending.message, String(body.signature ?? ""));
  } catch (err) {
    throw new HttpError(400, `bad signature: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (signer !== pending.address) throw new HttpError(401, "the signature is from a different wallet");
  sessionNonces.delete(body.nonce);
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  db.prepare("delete from sessions where expires_at < ?").run(now);
  db.prepare("insert into sessions (token_hash, wallet, created_at, expires_at) values (?, ?, ?, ?)").run(sha256(token), signer, now, now + SESSION_TTL_MS);
  return { session: token, wallet: signer, expires_at: now + SESSION_TTL_MS };
}

/** The signed-in wallet, or null when the request carries no live session. */
function sessionWallet(req: IncomingMessage): { wallet: string; expires_at: number } | null {
  const token = /^[0-9a-f]{64}$/.exec(String(req.headers["x-flyai-session"] ?? ""))?.[0];
  const row = token ? one<{ wallet: string; expires_at: number } | undefined>("select wallet, expires_at from sessions where token_hash = ?", sha256(token)) : undefined;
  return row && row.expires_at >= Date.now() ? row : null;
}

function sessionOf(req: IncomingMessage): { wallet: string; expires_at: number } {
  const s = sessionWallet(req);
  if (!s) throw new HttpError(401, "not signed in, or the sign-in has expired");
  return s;
}

/** POST /api/session/link: the signed-in wallet takes a miner (its bearer token, or the extension's link code). */
function linkBySession(req: IncomingMessage, body: any) {
  const { wallet } = sessionOf(req);
  const { miner, code } = signInMiner(req, body.code);
  if (code) linkCodes.delete(code);
  db.prepare("update miners set wallet = ?, wallet_at = ? where id = ?").run(wallet, Date.now(), miner);
  console.log(`miner ${miner.slice(0, 8)} linked to ${wallet} (session)`);
  void sampleStake(wallet).catch(() => {});
  return { wallet, miner: miner.slice(0, 8) };
}

const openFrom = db.prepare("select id, params, kind from tasks where state = 'open' and kind = 'connectome' and r >= ? and r < ? order by r limit 16");
const canaryFrom = db.prepare("select id, params, kind from tasks where truth is not null and kind = 'connectome' and r >= ? and r < ? order by r limit 16");
// By task, never by miner: the planner picked assignments_by_miner, which walks every job the miner ever had (360k
// for the busiest), ~150 ms a call and up to two calls per job in a 32-job claim. That froze the server (2026-09-21).
const alreadyHad = db.prepare("select task from assignments indexed by assignments_by_task where miner = ? and task in (select value from json_each(?))");

/** From a random point on the sort key, the first job this miner hasn't had; wraps around once. */
function pick(from: typeof openFrom, miner: string): TaskRow | undefined {
  const start = Math.random();
  for (const [lo, hi] of [[start, 2], [-1, start]]) {
    const rows = from.all(lo, hi) as TaskRow[];
    if (!rows.length) continue;
    const had = new Set((alreadyHad.all(miner, JSON.stringify(rows.map((r) => r.id))) as { task: number }[]).map((r) => r.task));
    const row = rows.find((r) => !had.has(r.id));
    if (row) return row;
  }
  return undefined;
}

const liveOrdersWithWork = db.prepare(`select o.id, o.bid_wei from orders o where o.status = 'live' and o.house = ? and exists (
  select 1 from order_tasks ot join tasks t on t.id = ot.task where ot.order_id = o.id and ot.state = 1 and t.state = 'open'
  and t.kind in (select value from json_each(?)))`);
const openJobOf = db.prepare(`select t.id, t.params, t.kind from order_tasks ot join tasks t on t.id = ot.task
  where ot.order_id = ? and ot.state = 1 and t.state = 'open' and t.kind in (select value from json_each(?))
  and not exists (select 1 from assignments a where a.task = t.id and a.miner = ?) order by t.r limit 1`);

/**
 * An order's job: a live paid order drawn at random with odds in proportion to its bid, then one of its open jobs the
 * miner hasn't answered (a second answer must come from someone else). With no paid work, a house order, each
 * equally likely; only then does the miner get the screen.
 */
/**
 * One claim's view of the live orders: a batch of 32 jobs would otherwise list them 64 times over, which with a
 * dozen orders was seconds of work per claim. Orders that run out drop from the list as the batch fills.
 */
function paidPicker(): (miner: string, kinds: string[]) => TaskRow | undefined {
  const lists = new Map<string, { id: string; weight: number }[]>();
  return (miner, kinds) => {
    const k = JSON.stringify(kinds);
    for (const house of [0, 1] as const) {
      let orders = lists.get(house + k);
      if (!orders) {
        orders = (liveOrdersWithWork.all(house, k) as { id: string; bid_wei: string }[])
          .map((o) => ({ id: o.id, weight: house ? 1 : Number(BigInt(o.bid_wei) / 10n ** 12n) }));
        lists.set(house + k, orders);
      }
      const row = pickOrder(miner, k, orders);
      if (row) return row;
    }
    return undefined;
  };
}

function pickOrder(miner: string, k: string, orders: { id: string; weight: number }[]): TaskRow | undefined {
  while (orders.length) {
    let x = Math.random() * orders.reduce((sum, o) => sum + o.weight, 0);
    let i = 0;
    while (i < orders.length - 1 && (x -= orders[i].weight) >= 0) i++;
    const row = openJobOf.get(orders[i].id, k, miner) as TaskRow | undefined;
    if (row) return row;
    orders.splice(i, 1);
  }
  return undefined;
}

/** What miners know how to run; a client that doesn't say is an older one and gets only the brain. */
const KINDS = ["connectome", "wasm", "wgsl", "world", "probe", "embed"];

/** A claimed program job: where to fetch it and its limits. */
function openJob(params: string, kind: string) {
  const p = JSON.parse(params);
  // our own code: the miner already has it, only the job's parameters travel
  if (kind === "world" || kind === "probe") return { kind, index: p.index, timeout_s: p.timeout_s, max_output: MAX_OUTPUT_BYTES, ...p.job };
  const blob = (h: string) => `/api/blobs/${h}`;
  if (kind === "embed") {
    // the model comes from its own hub at a pinned revision; only the texts travel through us
    const m = EMBED_MODELS[p.program];
    return {
      kind, model: p.program, repo: m.repo, revision: m.revision, pooling: m.pooling, dim: m.dim, mb: m.mb,
      index: p.index, input: p.input, input_url: blob(p.input), timeout_s: p.timeout_s, output_bytes: p.output_bytes,
    };
  }
  return {
    kind, program: p.program, program_url: blob(p.program), index: p.index,
    // an index input needs no download: the miner makes the 4 bytes itself
    input: p.input === INDEX_INPUT ? null : p.input, input_url: p.input === INDEX_INPUT ? null : blob(p.input),
    timeout_s: p.timeout_s, max_output: p.output_bytes ?? MAX_OUTPUT_BYTES, dispatch: p.dispatch, output_bytes: p.output_bytes,
  };
}

function claim(miner: string, want: number, kinds: string[] = ["connectome"], openMax = 1) {
  const now = Date.now();
  const pickPaid = paidPicker();
  // overdue jobs count for nothing even before the sweep marks them
  const live = count("select count(*) as n from assignments where miner = ? and status = 'issued' and expires_at >= ?", miner, now);
  const room = Math.min(want, MAX_JOBS - live);
  if (room <= 0) throw new HttpError(429, `already running ${MAX_JOBS} jobs`);
  const issue = db.prepare("insert into assignments (id, miner, task, issued_at, expires_at, status) values (?, ?, ?, ?, ?, 'issued')");
  return transaction(() => {
    const jobs = [];
    let openCount = 0;
    for (let k = 0; k < room; k++) {
      // a canary looks exactly like a fresh job: same shape, same random order
      const brain = kinds.includes("connectome");
      // one claim holds at most openMax programs: they run one at a time, and a GPU batch shouldn't wait on them
      const allowed = openCount >= openMax ? kinds.filter((x) => x === "connectome") : kinds;
      if (!allowed.length) break;
      const canary = brain && Math.random() < CANARY_RATE ? pick(canaryFrom, miner) : undefined;
      let task = canary ?? pickPaid(miner, allowed) ?? (brain ? pick(openFrom, miner) : undefined);
      if (!task && brain) {
        topUp();
        task = pick(openFrom, miner) ?? pick(canaryFrom, miner);
      }
      if (!task) break;
      const kind = task.kind ?? "connectome";
      if (kind !== "connectome") openCount++;
      if (task !== canary && one<{ truth: string | null }>("select truth from tasks where id = ?", task.id).truth === null) {
        db.prepare("update tasks set state = 'out' where id = ?").run(task.id);
      }
      const id = randomUUID();
      issue.run(id, miner, task.id, now, now + JOB_TTL_MS);
      const units = one<{ units: number }>("select units from tasks where id = ?", task.id).units * (kind === "connectome" ? 1 : PROGRAM_BONUS);
      jobs.push(kind === "connectome"
        ? { job: id, kind, params: JSON.parse(task.params) as TaskParams, units, expires_at: now + JOB_TTL_MS }
        : { job: id, kind, params: openJob(task.params, kind), units, expires_at: now + JOB_TTL_MS });
    }
    return jobs;
  });
}

function submit(miner: string, body: any) {
  const job = String(body.job ?? "");
  const a = one<{ task: number; status: string; expires_at: number } | undefined>(
    "select task, status, expires_at from assignments where id = ? and miner = ?", job, miner);
  if (!a) throw new HttpError(404, "no such job");
  if (a.status !== "issued") throw new HttpError(409, `job already ${a.status}`);
  if (a.expires_at < Date.now()) {
    expire();
    throw new HttpError(410, "job expired");
  }
  const { kind, params } = one<{ kind: string; params: string }>("select kind, params from tasks where id = ?", a.task);
  if (kind !== "connectome") return submitOpen(job, a.task, JSON.parse(params), body);
  const result = canonical(body.result);
  if (!result) throw new HttpError(400, "malformed result");

  const day = today();
  const status = transaction(() => {
    const { truth } = one<{ truth: string | null }>("select truth from tasks where id = ?", a.task);
    const status = truth === null ? "pending" : truth === result ? "accepted" : "rejected";
    db.prepare("update assignments set status = ?, result = ?, submitted_at = ?, day = ? where id = ?")
      .run(status, result, Date.now(), day, job);
    if (status === "rejected") strike(miner);
    if (status === "pending") {
      // a struck miner's answer doesn't settle the job; it goes back out for someone else
      const { strikes } = one<{ strikes: number }>("select strikes from miners where id = ?", miner);
      const { priority } = one<{ priority: number }>("select priority from tasks where id = ?", a.task);
      // a paid job stays out for more miners until enough agree
      const done = !strikes && (!priority || settled(a.task) !== null);
      db.prepare("update tasks set state = ?, priority = ? where id = ?").run(done ? "done" : "open", done ? 0 : priority, a.task);
      if (done && priority) onSettled(a.task);
    }
    return status;
  });

  if (status === "pending" && disputed(a.task)) audit(a.task, true);
  else if (status === "pending") {
    const jobsToday = count("select coalesce(sum(accepted + pending + rejected), 0) as n from day_credit where day = ? and miner = ?", day, miner);
    if (Math.random() < AUDITS / (jobsToday + AUDITS)) audit(a.task);
  }
  return { status: "received" };
}

interface DayRow { units: number; accepted: number; pending: number; rejected: number }

/** Any wrong answer zeroes the day; a miner not yet checked enough gets nothing yet. */
function standingOf(r: DayRow) {
  const jobs = r.accepted + r.pending + r.rejected;
  const standing = r.rejected > 0 ? "zeroed" : r.accepted < Math.min(MIN_CHECKED, jobs) ? "unchecked" : jobs ? "ok" : "no jobs yet";
  return { jobs, checked: r.accepted + r.rejected, rejected: r.rejected, units: r.units, credited: standing === "ok" ? r.units : 0, standing };
}

/** A day_credit row as a DayRow (d is day_credit). */
const DAY_SUMS = `d.units + d.program_units * ${PROGRAM_BONUS} as units, d.accepted, d.pending, d.rejected`;

/** Credit for one UTC day, per miner. */
function epoch(day: string) {
  const rows = db.prepare(`select d.miner, m.label, m.wallet, ${DAY_SUMS}
    from day_credit d join miners m on m.id = d.miner where d.day = ?`).all(day) as unknown as (DayRow & { miner: string; label: string | null; wallet: string | null })[];
  const miners = rows.map((r) => ({ miner: r.miner, label: r.label, wallet: r.wallet, ...standingOf(r) }));
  const total = miners.reduce((s, m) => s + m.credited, 0);
  return { day, total_credited: total, miners: miners.map((m) => ({ ...m, share: total ? m.credited / total : 0 })) };
}
const dayTotal = cached(30_000, (day: string) => epoch(day).total_credited);

// ---- months ------------------------------------------------------------------------------------------
// Points are credited units, added up per wallet over a UTC month with the daily rules above (a zeroed or
// unchecked miner-day adds nothing). Nothing is promised in tokens while a month runs: after it ends the
// operator picks a pool, POST /api/admin/snapshot splits it by points, and MonthlyClaims pays it out.
const thisMonth = () => today().slice(0, 7);

function monthBounds(month: string): [string, string] {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return [`${month}-01`, `${next}-01`];
}

/**
 * Points per wallet (and per unlinked miner) for a month: each miner-day's credited units times the
 * wallet's stake multiplier that day (1 while staking is off; unlinked miners always count 1).
 */
function monthPoints(month: string) {
  const bounds = monthBounds(month);
  const rows = db.prepare(`select d.day, d.miner, m.wallet, ${DAY_SUMS}
    from day_credit d join miners m on m.id = d.miner where d.day >= ? and d.day < ?`).all(...bounds) as unknown as (DayRow & { day: string; miner: string; wallet: string | null })[];
  const samples = new Map((db.prepare("select wallet, day, staked_wei from stake_samples where day >= ? and day < ?").all(...bounds) as
    { wallet: string; day: string; staked_wei: string }[]).map((s) => [`${s.wallet} ${s.day}`, BigInt(s.staked_wei)]));
  const wallets = new Map<string, number>();
  const miners = new Map<string, number>();
  let unlinked = 0;
  for (const r of rows) {
    const { credited } = standingOf(r);
    miners.set(r.miner, (miners.get(r.miner) ?? 0) + credited);
    if (r.wallet) wallets.set(r.wallet, (wallets.get(r.wallet) ?? 0) + credited * multiplierFor(samples.get(`${r.wallet} ${r.day}`)));
    else unlinked += credited;
  }
  const total = [...wallets.values()].reduce((s, p) => s + p, 0);
  return { wallets, miners, unlinked, total };
}
const monthPointsCached = cached(60_000, monthPoints);

/** When a month ends: the first moment of the next month, UTC. */
const monthEnd = (m: string) => new Date(`${monthBounds(m)[1]}T00:00:00Z`);

/** What program jobs paid each wallet in a month, in wei. */
function earningsOf(m: string): Map<string, bigint> {
  const out = new Map<string, bigint>();
  for (const r of db.prepare("select wallet, amount_wei from earnings where month = ?").all(m) as { wallet: string; amount_wei: string }[]) {
    out.set(r.wallet, (out.get(r.wallet) ?? 0n) + BigInt(r.amount_wei));
  }
  return out;
}

/** The pool's part from paid orders' charges in a month, in wei. */
function buyerPoolWei(m: string): bigint {
  return (db.prepare("select pool_wei from ledger where kind = 'charge' and month = ?").all(m) as { pool_wei: string }[])
    .reduce((sum, c) => sum + BigInt(c.pool_wei), 0n);
}

/** A month's pool so far, in whole tokens: the operator's announcement plus the buyers' part; null if neither. */
function announcedPool(m: string): string | null {
  const a = one<{ pool_wei: string } | undefined>("select pool_wei from announcements where month = ?", m);
  const buyers = buyerPoolWei(m);
  return a || buyers ? fromWei(BigInt(a?.pool_wei ?? "0") + buyers) : null;
}

/** Wallets by points, highest first, with rank and share. */
function ranking(m: string) {
  const { wallets, total } = monthPointsCached(m);
  return [...wallets].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([wallet, points], i) => ({ rank: i + 1, wallet, points, share: total ? points / total : 0 }));
}

function month(m: string) {
  monthId(m); // validates
  const closed = m < thisMonth();
  const { unlinked, total } = monthPointsCached(m);
  const snap = one<{ pool_wei: string; root: string; created_at: number } | undefined>("select pool_wei, root, created_at from snapshots where month = ?", m);
  const ends = monthEnd(m);
  return {
    month: m, month_id: monthId(m), closed, total_points: total, unlinked_points: unlinked,
    ends_at: ends.toISOString(), days_left: closed ? 0 : Math.max(0, Math.ceil((ends.getTime() - Date.now()) / 86_400_000)),
    announced_pool: announcedPool(m),
    buyer_pool: fromWei(buyerPoolWei(m)),
    ...usdcMonth(m),
    wallets: ranking(m),
    snapshot: snap ? { pool: fromWei(BigInt(snap.pool_wei)), root: snap.root, created_at: snap.created_at } : null,
  };
}

/** Announce (or with pool null, withdraw) a running or future month's pool. Miners then see estimates. */
function announce(m: string, pool: unknown) {
  monthId(m);
  if (m < thisMonth()) throw new HttpError(409, `${m} is over; take its snapshot instead`);
  if (pool === null) {
    db.prepare("delete from announcements where month = ?").run(m);
    return { month: m, announced_pool: null };
  }
  let wei: bigint;
  try {
    wei = toWei(String(pool));
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }
  db.prepare(`insert into announcements (month, pool_wei, created_at) values (?, ?, ?)
    on conflict (month) do update set pool_wei = excluded.pool_wei, created_at = excluded.created_at`).run(m, wei.toString(), Date.now());
  return { month: m, announced_pool: fromWei(wei) };
}

/**
 * Freeze a finished month: split `pool` tokens by points and commit to it with a Merkle root. Once only.
 * Without `pool`, the announced pool plus the buyers' part; never less than the buyers' part.
 */
function snapshot(m: string, pool: string) {
  monthId(m);
  if (!(m < thisMonth())) throw new HttpError(409, `${m} isn't over yet`);
  if (one("select 1 from snapshots where month = ?", m)) throw new HttpError(409, `${m} already has a snapshot`);
  let poolWei: bigint;
  try {
    poolWei = toWei(pool || (announcedPool(m) ?? ""));
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }
  const buyers = buyerPoolWei(m);
  if (poolWei < buyers) throw new HttpError(409, `paid orders put ${fromWei(buyers)} tokens into ${m}'s pool; the pool can't be less`);
  const { wallets, total, unlinked } = monthPoints(m);
  // program jobs already decided who gets their part (earnings); points split the rest
  const earned = earningsOf(m);
  const earnedTotal = [...earned.values()].reduce((sum, x) => sum + x, 0n);
  const split = allocate([...wallets].map(([wallet, points]) => ({ wallet, points })), poolWei - earnedTotal);
  for (const [wallet, amount] of earned) {
    const row = split.find((a) => a.wallet === wallet);
    if (row) row.amount += amount;
    else split.push({ wallet, points: 0, amount });
  }
  if (!split.length) throw new HttpError(409, `no linked wallet earned points or program pay in ${m}`);
  const tree = merkleTree(split.map((a) => leafHash(a.wallet, a.amount)));
  transaction(() => {
    db.prepare("insert into snapshots (month, pool_wei, root, total_points, wallets, created_at) values (?, ?, ?, ?, ?, ?)")
      .run(m, poolWei.toString(), tree.root, total, split.length, Date.now());
    const insert = db.prepare("insert into snapshot_claims (month, wallet, points, amount_wei, proof) values (?, ?, ?, ?, ?)");
    for (const a of split) insert.run(m, a.wallet, a.points, a.amount.toString(), JSON.stringify(tree.proof(leafHash(a.wallet, a.amount))));
  });
  console.log(`snapshot ${m}: ${fromWei(poolWei)} tokens to ${split.length} wallets, root ${tree.root}`);
  return {
    month: m, month_id: monthId(m), pool: fromWei(poolWei), pool_wei: poolWei.toString(), root: tree.root,
    wallets: split.length, total_points: total, unlinked_points: unlinked,
    // what the owner sends: approve(contract, pool_wei) on the token, then openMonth(month_id, root, pool_wei)
  };
}

/** Everything a wallet can claim, with ready-to-send calldata, so the claim page needs no crypto. */
function claimsFor(wallet: string) {
  if (!ADDRESS.test(wallet)) throw new HttpError(400, "wallet must be 0x followed by 40 hex digits");
  const w = checksumAddress(wallet);
  const rows = db.prepare(`select c.month, c.points, c.amount_wei, c.proof, s.root from snapshot_claims c join snapshots s on s.month = c.month
    where c.wallet = ? order by c.month desc`).all(w) as { month: string; points: number; amount_wei: string; proof: string; root: string }[];
  return {
    wallet: w,
    ...CLAIMS,
    claims: rows.map((r) => {
      const id = monthId(r.month);
      const amount = BigInt(r.amount_wei);
      return {
        month: r.month, month_id: id, points: r.points, amount: fromWei(amount), amount_wei: r.amount_wei, root: r.root,
        proof: JSON.parse(r.proof) as string[],
        claim_data: claimCalldata(id, w, amount, JSON.parse(r.proof)),
        has_claimed_data: hasClaimedCalldata(id, w),
        month_data: monthCalldata(id),
      };
    }),
  };
}

function adminOnly(req: IncomingMessage): void {
  const given = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1] ?? "";
  // compare digests, so the time taken says nothing about the token
  if (!ADMIN_TOKEN || !timingSafeEqual(createHash("sha256").update(given).digest(), createHash("sha256").update(ADMIN_TOKEN).digest())) {
    throw new HttpError(403, "admin only");
  }
}

// ---- stake -------------------------------------------------------------------------------------------
/** The multiplier for a wallet-day's lowest stake sample. No sample counts as nothing staked. */
function multiplierFor(stakedWei: bigint | undefined): number {
  if (!STAKING.contract) return 1;
  return tierFor(STAKING.tiers, stakedWei ?? 0n)?.multiplier ?? 0;
}

/** Wallets we have asked the chain about outside the sampling loop, so a polled page cannot spam the RPC. */
const resampled = new Map<string, number>();
const RESAMPLE_MS = 60_000;

function stakeOf(wallet: string) {
  if (!STAKING.contract) return null;
  const s = one<{ staked_wei: string; last_wei: string; sampled_at: number } | undefined>(
    "select staked_wei, last_wei, sampled_at from stake_samples where wallet = ? and day = ?", wallet, today());
  // Only wallets whose miners were seen today get sampled, and every wallet starts a UTC day with no row at all. So
  // a staker who is not mining right now, or anyone in the minutes after 00:00 UTC, used to read as 0 staked on no
  // tier — their stake looked like it had vanished (reported by a staker 2026-09-20). Fall back to the last sample
  // we ever took for them, and ask the chain again in the background so the next load is exact.
  const last = s ?? one<{ staked_wei: string; last_wei: string; sampled_at: number } | undefined>(
    "select staked_wei, last_wei, sampled_at from stake_samples where wallet = ? order by day desc limit 1", wallet);
  if (!s && Date.now() - (resampled.get(wallet) ?? 0) > RESAMPLE_MS) {
    resampled.set(wallet, Date.now());          // /api/me is polled often; one chain read a minute per wallet is plenty
    void sampleStake(wallet).catch(() => {});
  }
  // what counts for TODAY's points is the lowest sample taken today; with no sample yet nothing has been counted
  const counted = BigInt(s?.staked_wei ?? "0");
  const now = BigInt(last?.last_wei ?? "0");
  const tier = tierFor(STAKING.tiers, counted);
  const next = tierFor(STAKING.tiers, now);
  return {
    staked: fromWei(now), counted: fromWei(counted), tier: tier?.name ?? null, multiplier: tier?.multiplier ?? 0,
    // stake added today counts from tomorrow, once it has been in place a whole day
    tomorrow: next && next.multiplier !== (tier?.multiplier ?? 0) ? { tier: next.name, multiplier: next.multiplier } : null,
    // the tier the stake they hold right now is worth, whether or not it counts yet: what the /stake page shows
    holding: next ? { tier: next.name, multiplier: next.multiplier } : null,
    sampled_today: !!s,
    sampled_at: last?.sampled_at ?? null,
  };
}

/**
 * Record `wallet`'s stake for today, straight from the chain, keeping the day's lowest sample. Taking the
 * last one instead would let stake added minutes before the final sample boost everything earned that day.
 */
async function sampleStake(wallet: string): Promise<void> {
  if (!STAKING.contract) return;
  const staked = await readStake(STAKING.rpc, STAKING.contract, wallet);
  const day = today();
  const prev = one<{ staked_wei: string } | undefined>("select staked_wei from stake_samples where wallet = ? and day = ?", wallet, day);
  const lowest = prev && BigInt(prev.staked_wei) < staked ? BigInt(prev.staked_wei) : staked;
  db.prepare(`insert into stake_samples (wallet, day, staked_wei, last_wei, sampled_at) values (?, ?, ?, ?, ?)
    on conflict (wallet, day) do update set staked_wei = excluded.staked_wei, last_wei = excluded.last_wei, sampled_at = excluded.sampled_at`)
    .run(wallet, day, lowest.toString(), staked.toString(), Date.now());
}

/** Every STAKE_SAMPLE_MIN, sample the wallets whose miners were seen today. */
let sampling = false;
async function sampleActiveStakes(): Promise<void> {
  if (!STAKING.contract || sampling) return;
  sampling = true;
  try {
    const since = Date.parse(`${today()}T00:00:00Z`);
    const wallets = (db.prepare("select distinct wallet from miners where wallet is not null and last_seen >= ?").all(since) as { wallet: string }[]).map((r) => r.wallet);
    for (const w of wallets) await sampleStake(w).catch((err) => console.error(`stake sample for ${w} failed: ${err instanceof Error ? err.message : err}`));
  } finally {
    sampling = false;
  }
}

function stakeConfig() {
  return {
    contract: STAKING.contract, token: STAKING.token, tiers: STAKING.tiers, selectors: STAKE_SELECTORS,
    chain_id: CLAIMS.chain_id, chain_name: CLAIMS.chain_name, rpc: STAKING.rpc, explorer: CLAIMS.explorer, token_symbol: CLAIMS.token_symbol,
  };
}

/** A wallet's place in the running month: rank, days left, and an estimate if a pool is announced. */
function monthStanding(wallet: string | null, points = 0) {
  const m = thisMonth();
  const ranks = ranking(m);
  const mine = wallet ? ranks.find((r) => r.wallet === wallet) : undefined;
  const pool = announcedPool(m);
  const { total } = monthPointsCached(m);
  const paid = earningsOf(m);
  // program jobs already paid their part to wallets, so points share what's left of the pool
  const forPoints = pool === null ? null : Number(pool) - Number(fromWei([...paid.values()].reduce((sum, x) => sum + x, 0n)));
  // an unlinked miner sees what its points would be worth if it linked a wallet now
  const share = wallet ? mine?.share ?? 0 : total + points ? points / (total + points) : 0;
  return {
    month_total_points: total,
    month_pool_for_points: forPoints,
    month_estimate_share: share,
    month_rank: mine?.rank ?? null,
    month_wallets: ranks.length,
    month_ends_at: monthEnd(m).toISOString(),
    month_days_left: Math.max(0, Math.ceil((monthEnd(m).getTime() - Date.now()) / 86_400_000)),
    month_announced_pool: pool,
    // an estimate at the current share; it moves as everyone mines, and the month's snapshot decides. Program jobs
    // paid their part to wallets directly, so points share the rest.
    month_program_pay: wallet ? fromWei(earningsOf(m).get(wallet) ?? 0n) : "0",
    month_estimate: forPoints === null ? null : forPoints * share + Number(fromWei(paid.get(wallet ?? "") ?? 0n)),
  };
}

function me(miner: string) {
  const day = today();
  const mine = standingOf(one<DayRow | undefined>(`select ${DAY_SUMS} from day_credit d where d.day = ? and d.miner = ?`, day, miner)
    ?? { units: 0, accepted: 0, pending: 0, rejected: 0 });
  const total = Math.max(dayTotal(day), mine.credited);
  const life = one<{ jobs: number; rejected: number | null }>(`select coalesce(sum(accepted + pending + rejected), 0) as jobs, sum(rejected) as rejected
    from day_credit where miner = ?`, miner);
  const { label, wallet } = one<{ label: string | null; wallet: string | null }>("select label, wallet from miners where id = ?", miner);
  // this month: the wallet's points across all its miners, or this miner's own until it links one
  const m = monthPointsCached(thisMonth());
  const monthPts = wallet ? m.wallets.get(wallet) ?? 0 : m.miners.get(miner) ?? 0;
  return {
    miner, label, wallet, day, ...mine, units: mine.units ?? 0, share: total ? mine.credited / total : 0,
    lifetime_jobs: life.jobs, lifetime_rejected: life.rejected ?? 0,
    month: thisMonth(), month_points: monthPts, month_share: wallet && m.total ? monthPts / m.total : 0,
    stake: wallet ? stakeOf(wallet) : null,
    ...monthStanding(wallet, monthPts),
  };
}

const stats = cached(10_000, (_: null) => ({
  miners_online: count("select count(*) as n from miners where last_seen > ?", Date.now() - 10 * 60_000),
  jobs_today: count("select coalesce(sum(accepted + pending + rejected), 0) as n from day_credit where day = ?", today()),
  tasks: count("select count(*) as n from tasks") + counter("pruned_tasks"),
  tasks_done: count("select count(*) as n from tasks where state = 'done'") + counter("pruned_tasks"),
  tasks_checked: count("select count(*) as n from tasks where truth is not null"),
  rounds: count("select coalesce(max(round) + 1, 0) as n from tasks"),
  verifiers: pool.filter((v) => v.ready).length,
  audit_queue: auditQueue.length + pool.filter((v) => v.task !== null).length,
  audits_skipped: auditsSkipped,
  orders_open: !!ORDERS.payTo,
  orders_live: count("select count(*) as n from orders where status = 'live'"),
  paid_jobs_waiting: count("select count(*) as n from tasks where priority > 0"),
  blobs_mb: Math.round(blobBytes() / 1e6),
}));

/**
 * Screen results, averaged over seeds, as spikes per neuron per second. A job counts once the server has
 * re-run it, or once a miner with no wrong answers has returned it. Hashes are never included.
 *
 * Worked out in src/results.worker.ts: over ~2M jobs it takes a minute, which on this thread froze every request
 * (2026-09-21). A request gets the last finished summary and starts a fresh one when that is RESULTS_MS old.
 */
const RESULTS_MS = 10 * 60_000;
let resultsDone: { at: number; value: unknown } | null = null;
let resultsRunning = false;
function results(): unknown {
  const ref = reference!;
  if (!resultsRunning && (!resultsDone || Date.now() - resultsDone.at > RESULTS_MS)) {
    resultsRunning = true;
    const w = new Worker(new URL("./results.worker.ts", import.meta.url), {
      workerData: { db: DB_PATH, outputs: ref.outputs, outputSizes: ref.outputSizes, dt: ref.dt },
    });
    w.once("message", (value) => { resultsDone = { at: Date.now(), value }; });
    w.once("error", (err) => console.error(`results worker failed: ${err.message}`));
    w.once("exit", () => { resultsRunning = false; });
  }
  return resultsDone?.value ?? { units: "spikes per neuron per second, mean over seeds", outputs: ref.outputs, rows: [], computing: true };
}

// ---- paid orders -------------------------------------------------------------------------------------
// create (terms and a tag) -> fund (an exact transfer, or the wallet's balance with a signature) -> live: jobs are
// taken on up to max_parallel and while the budget covers them, each charged as it settles -> done, or ended by
// budget, time or the wallet -> the unspent budget returns to the wallet's balance. See src/orders.ts.
const ordersOn = () => {
  if (!ORDERS.payTo) throw new HttpError(503, "paid orders aren't open yet");
};

/** Turns the buyer's mistakes (SpecError) into 400s. */
function asked<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof SpecError) throw new HttpError(400, err.message);
    throw err;
  }
}

const taskByParams = db.prepare("select id from tasks where params = ?");

type OrderRow = {
  webhook: string | null; webhook_secret: string | null; webhook_seq: number; webhook_final: number; webhook_fails: number;
  webhook_next_at: number | null; webhook_error: string | null; order_key_hash: string | null; house: number; label: string | null; house_units: number | null; guest: number;
  id: string; wallet: string; spec: string; jobs: number; bid_wei: string; budget_wei: string; tag: number; max_parallel: number;
  hours: number | null; status: "unpaid" | "expired" | "live" | "done" | "ended"; end_reason: string | null; cursor: number;
  spent_wei: string; tx: string | null; created_at: number; expires_at: number; funded_at: number | null; ends_at: number | null; closed_at: number | null;
};
const orderRow = (id: string) => one<OrderRow | undefined>("select * from orders where id = ?", id);

/** Expanded sweeps by order, so a refill doesn't expand up to ORDER_MAX_JOBS jobs each time. */
const sweeps = new Map<string, TaskParams[]>();
function sweepOf(o: OrderRow): TaskParams[] {
  let jobs = sweeps.get(o.id);
  if (!jobs) {
    jobs = expandSpec(JSON.parse(o.spec), Number.MAX_SAFE_INTEGER).jobs; // limits applied when it was created
    if (sweeps.size >= 100) sweeps.delete(sweeps.keys().next().value!);
    sweeps.set(o.id, jobs);
  }
  return jobs;
}

/** How much of a sweep is settled already, and what all of it would cost at a bid. */
function quote(body: any) {
  if (isOpenKind(body.spec?.kind)) {
    const spec = asked(() => openSpec(body.spec, ORDERS.maxJobs));
    const minBid = openMinBid(ORDERS, spec);
    const bid = asked(() => orderTerms(ORDERS, { bid: body.bid, budget: body.bid ?? minBid }, minBid)).bid;
    const full = bid * BigInt(spec.inputs.length);
    return {
      spec: { ...spec, inputs: spec.inputs.length }, jobs: spec.inputs.length, cached: 0, fresh: spec.inputs.length, min_bid: minBid, bid: fromWei(bid),
      full_cost: fromWei(full), full_cost_wei: full.toString(), full_to_pool: fromWei(poolPart(ORDERS, full)),
    };
  }
  const { spec, jobs } = asked(() => expandSpec(body.spec, ORDERS.maxJobs));
  let cachedJobs = 0;
  for (const p of jobs) {
    const row = taskByParams.get(JSON.stringify(p)) as { id: number } | undefined;
    if (row && settled(row.id)) cachedJobs++;
  }
  const bid = asked(() => orderTerms(ORDERS, { bid: body.bid, budget: body.bid ?? ORDERS.minBid })).bid;
  const full = sweepCost(ORDERS, bid, jobs.length - cachedJobs, cachedJobs);
  return {
    spec, jobs: jobs.length, cached: cachedJobs, fresh: jobs.length - cachedJobs, bid: fromWei(bid),
    full_cost: fromWei(full), full_cost_wei: full.toString(), full_to_pool: fromWei(poolPart(ORDERS, full)),
  };
}

function orderConfigView() {
  const bids = (db.prepare("select bid_wei from orders where status = 'live'").all() as { bid_wei: string }[])
    .map((o) => BigInt(o.bid_wei)).sort((x, y) => (x < y ? 1 : x > y ? -1 : 0));
  return {
    open: !!ORDERS.payTo, pay_to: ORDERS.payTo, token: ORDERS.token, transfer_selector: TRANSFER_SELECTOR,
    min_bid: ORDERS.minBid, cached_price: ORDERS.cachedPrice, pool_share: ORDERS.poolShare, max_jobs: ORDERS.maxJobs,
    max_parallel: ORDERS.maxParallel, max_hours: ORDERS.maxHours, ttl_min: ORDERS.ttlMin, redundancy: ORDERS.redundancy,
    // what a new order competes with for miners
    market: { live_orders: bids.length, top_bid: bids.length ? fromWei(bids[0]) : null, median_bid: bids.length ? fromWei(bids[bids.length >> 1]) : null },
    channels: [...CHANNELS, "none"], steps: STEPS, dt: reference?.dt ?? null, outputs: reference?.outputs ?? null,
    kinds: ["connectome-sweep", "wasm", "wgsl", "embed"],
    embed: {
      models: Object.fromEntries(Object.entries(EMBED_MODELS).map(([id, m]) => [id, { dim: m.dim, pooling: m.pooling, repo: m.repo, revision: m.revision, about: m.about }])),
      max_texts: EMBED_LIMITS.texts, max_text_chars: EMBED_LIMITS.chars, max_input_bytes: EMBED_LIMITS.bytes, default_cosine: 0.9999,
    },
    programs: { blob_max_bytes: BLOB_MAX_BYTES, max_timeout_s: 600, max_output_bytes: MAX_OUTPUT_BYTES, max_redundancy: 5, blob_ttl_days: BLOB_TTL_MS / 86_400_000 },
    chain_id: CLAIMS.chain_id, chain_name: CLAIMS.chain_name, rpc: CLAIMS.rpc, explorer: CLAIMS.explorer, token_symbol: CLAIMS.token_symbol,
    // card buyers: USDC on Base through an onramp, credited in $FLYAI at the live price (POST /api/orders/:id/usdc)
    usdc: USDC.enabled && ORDERS.payTo
      ? { chain_id: USDC.chain_id, chain_name: USDC.chain_name, rpc: USDC.rpc, explorer: USDC.explorer, token: USDC.token, decimals: 6, pay_to: ORDERS.payTo,
        gasless: !!relayer, onramp_url: USDC.onrampUrl, card: !!cdp, card_min_usd: Number(CARD_MIN_CENTS) / 100 }
      : null,
  };
}

const orderCreations = new Map<string, number[]>();
async function createOrder(req: IncomingMessage, body: any) {
  ordersOn();
  let webhook: string | null = null;
  if (body.webhook !== undefined && body.webhook !== null && body.webhook !== "") {
    try {
      webhook = (await checkWebhook(String(body.webhook), WEBHOOK_ALLOW_INTERNAL)).href;
    } catch (err) {
      throw new HttpError(400, err instanceof Error ? err.message : String(err));
    }
  }
  const webhookSecret = webhook ? randomBytes(24).toString("hex") : null;
  // a guest pays by card with no wallet: the order is held by PAY_TO, and its key (shown once) is the buyer's
  const guest = body.guest === true;
  if (guest && !cdp) throw new HttpError(503, "card payments aren't set up");
  if (!guest && (typeof body.wallet !== "string" || !ADDRESS.test(body.wallet))) throw new HttpError(400, "wallet must be 0x followed by 40 hex digits");
  let open: OpenSpec | null = null;
  let spec: object;
  let jobCount: number;
  let terms;
  if (isOpenKind(body.spec?.kind)) {
    open = asked(() => openSpec(body.spec, ORDERS.maxJobs));
    open.program = checkProgram(open);
    checkInputs(open.kind, open.inputs);
    const minBid = openMinBid(ORDERS, open);
    terms = asked(() => orderTerms(ORDERS, body, minBid));
    spec = { ...open, inputs: undefined };
    jobCount = open.inputs.length;
  } else {
    const sweep = asked(() => expandSpec(body.spec, ORDERS.maxJobs));
    spec = sweep.spec;
    jobCount = sweep.jobs.length;
    terms = asked(() => orderTerms(ORDERS, body));
  }
  const orderKey = open || guest ? randomBytes(24).toString("hex") : null;
  const ip = clientIp(req);
  const hourAgo = Date.now() - 3_600_000;
  const recent = (orderCreations.get(ip) ?? []).filter((t) => t > hourAgo);
  if (recent.length >= 30) throw new HttpError(429, "too many orders from this address, try later");
  orderCreations.set(ip, [...recent, Date.now()]);
  const now = Date.now();
  const id = randomUUID();
  for (let attempt = 0; ; attempt++) {
    const tag = 1 + Math.floor(Math.random() * (TAG_MAX - 1));
    try {
      transaction(() => {
        db.prepare(`insert into orders (id, wallet, spec, jobs, bid_wei, budget_wei, tag, max_parallel, hours, status, created_at, expires_at, webhook, webhook_secret, order_key_hash, guest)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', ?, ?, ?, ?, ?, ?)`)
          .run(id, guest ? ORDERS.payTo! : checksumAddress(body.wallet), JSON.stringify(spec), jobCount, terms.bid.toString(), (terms.budget + BigInt(tag)).toString(),
            tag, terms.maxParallel, terms.hours, now, now + ORDERS.ttlMin * 60_000, webhook, webhookSecret, orderKey ? sha256(orderKey) : null, guest ? 1 : 0);
        if (open) addInputs(id, 0, open.inputs);
      });
      break;
    } catch (err) {
      if (attempt > 20 || !String(err).includes("UNIQUE")) throw err; // the tag is taken by another unpaid order
    }
  }
  // the only time the secret is shown
  return { ...order(id), webhook_secret: webhookSecret, order_key: orderKey };
}

function book(wallet: string, orderId: string | null, kind: string, amount: bigint, extra: { pool?: bigint; month?: string; tx?: string } = {}): void {
  db.prepare("insert into ledger (wallet, order_id, kind, amount_wei, pool_wei, month, tx, at) values (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(wallet, orderId, kind, amount.toString(), extra.pool?.toString() ?? null, extra.month ?? null, extra.tx ?? null, Date.now());
}

/** Deposits, releases and roulette winnings, less what funded orders, was bet or was sent back. */
function balanceOf(wallet: string): bigint {
  let sum = 0n;
  for (const r of db.prepare("select kind, amount_wei from ledger where wallet = ?").all(wallet) as { kind: string; amount_wei: string }[]) {
    if (r.kind === "deposit" || r.kind === "release" || r.kind === "payout") sum += BigInt(r.amount_wei);
    else if (r.kind === "fund" || r.kind === "withdraw" || r.kind === "bet") sum -= BigInt(r.amount_wei);
  }
  return sum;
}

function balanceView(wallet: string) {
  if (!ADDRESS.test(wallet)) throw new HttpError(400, "wallet must be 0x followed by 40 hex digits");
  const w = checksumAddress(wallet);
  const rows = db.prepare("select kind, order_id, amount_wei, tx, at from ledger where wallet = ? and kind != 'charge' order by id desc limit 50")
    .all(w) as { kind: string; order_id: string | null; amount_wei: string; tx: string | null; at: number }[];
  return { wallet: w, balance: fromWei(balanceOf(w)), entries: rows.map((r) => ({ ...r, amount: fromWei(BigInt(r.amount_wei)) })) };
}

/** Start a funded order. In a transaction; the budget has been booked as a fund. */
function start(o: OrderRow, tx: string | null): void {
  const now = Date.now();
  db.prepare("update orders set status = 'live', funded_at = ?, ends_at = ?, tx = ? where id = ?")
    .run(now, o.hours === null ? null : now + Math.round(o.hours * 3_600_000), tx, o.id);
  console.log(`order ${o.id.slice(0, 8)} live: ${o.jobs} jobs, bid ${fromWei(BigInt(o.bid_wei))}, budget ${fromWei(BigInt(o.budget_wei))}`);
  refill(o.id);
}

/**
 * Take on more of an order's sweep: settled jobs are charged at once, new ones go out while fewer than max_parallel
 * are out and the budget covers every job out at the bid. Closes the order when nothing more can happen.
 * In a transaction.
 */
function refill(id: string): void {
  const o = orderRow(id);
  if (!o || o.status !== "live") return;
  if (o.ends_at !== null && Date.now() >= o.ends_at) return close(o, "ended", "time");
  const spec = JSON.parse(o.spec);
  const program = isProgramKind(spec.kind);
  const sweep = program ? null : sweepOf(o);
  const total = o.jobs;
  const bid = BigInt(o.bid_wei);
  const cachedPrice = cachedCharge(ORDERS, bid);
  let left = BigInt(o.budget_wei) - BigInt(o.spent_wei);
  let out = count("select count(*) as n from order_tasks where order_id = ? and state = 1", id);
  let cursor = o.cursor;
  const insert = db.prepare("insert into tasks (params, units, round, r, kind) values (?, ?, -1, ?, ?) on conflict (params) do nothing");
  const inputAt = db.prepare("select input from order_inputs where order_id = ? and idx = ?");
  const link = db.prepare("insert into order_tasks (order_id, task, state, charged_wei, seq) values (?, ?, ?, ?, ?)");
  const want = db.prepare("update tasks set priority = 1, state = case when state = 'done' then 'open' else state end where id = ?");
  for (; cursor < total && out < o.max_parallel; cursor++) {
    // a program job is unique to its order and index; it earns no points (its miners are paid from the charge)
    const input = program ? (inputAt.get(id, cursor) as { input: string }).input : "";
    // an embed answer is exactly one vector per text; the model's size goes with the compare rule
    const embed = program && spec.kind === "embed"
      ? { output_bytes: textCount(input) * EMBED_MODELS[spec.program].dim * 4, compare: { ...spec.compare, dim: EMBED_MODELS[spec.program].dim } }
      : {};
    const params = program
      ? JSON.stringify({ kind: spec.kind, order: id, index: cursor, program: spec.program, input,
        timeout_s: spec.timeout_s, redundancy: spec.redundancy, compare: spec.compare, dispatch: spec.dispatch, output_bytes: spec.output_bytes,
        ...embed, ...(spec.kind === "world" || spec.kind === "probe" ? { job: houseJob(spec, cursor) } : {}) })
      : JSON.stringify(sweep![cursor]);
    if (program && left - BigInt(out + 1) * bid < 0n) break;
    // house programs earn points (o.house_units); paid programs pay their miners from the charge instead
    insert.run(params, program ? (o.house ? o.house_units ?? 7.5 : 0) : sweep![cursor].steps / 100, Math.random(), program ? spec.kind : "connectome");
    const { id: task } = taskByParams.get(params) as { id: number };
    if (settled(task)) {
      if (left - BigInt(out) * bid < cachedPrice) break;
      link.run(id, task, 2, cachedPrice.toString(), ++lastSeq);
      touched(id);
      charge(o, cachedPrice);
      left -= cachedPrice;
      continue;
    }
    if (left - BigInt(out + 1) * bid < 0n) break;
    link.run(id, task, 1, null, null);
    want.run(task);
    out++;
  }
  db.prepare("update orders set cursor = ? where id = ?").run(cursor, id);
  if (out === 0) {
    if (cursor < total) close(orderRow(id)!, "ended", "budget");
    else if (!spec.keep_open) close(orderRow(id)!, "done", "sweep");
    else if (left < bid) close(orderRow(id)!, "ended", "budget"); // waiting for jobs it could never pay for
  }
}

/** Spend from an order's budget; POOL_SHARE of it joins this month's pool. */
function charge(o: OrderRow, amount: bigint): void {
  if (o.house) return; // our own work: nothing is spent, nothing joins the pool
  db.prepare("update orders set spent_wei = ? where id = ?").run((BigInt(orderRow(o.id)!.spent_wei) + amount).toString(), o.id);
  book(o.wallet, o.id, "charge", amount, { pool: poolPart(ORDERS, amount), month: thisMonth() });
}

/** A job's answer settled: charge every live order waiting on it, and take on more of their sweeps. In a transaction. */
function onSettled(task: number): void {
  const rows = db.prepare(`select o.id from order_tasks ot join orders o on o.id = ot.order_id
    where ot.task = ? and ot.state = 1 and o.status = 'live'`).all(task) as { id: string }[];
  for (const { id } of rows) {
    const o = orderRow(id)!;
    db.prepare("update order_tasks set state = 2, charged_wei = ?, seq = ? where order_id = ? and task = ?").run(o.bid_wei, ++lastSeq, id, task);
    touched(id);
    charge(o, BigInt(o.bid_wei));
    if (!o.house && JSON.parse(o.spec).kind !== "connectome-sweep") payMiners(o, task, poolPart(ORDERS, BigInt(o.bid_wei)));
    refill(id);
  }
}

/**
 * A program job's pool part goes straight to the wallets whose answers settled it, in equal shares. Parts of miners
 * with no wallet stay in the month's pool, like unlinked points. In a transaction.
 */
function payMiners(o: OrderRow, task: number, part: bigint): void {
  const miners = db.prepare(`select distinct coalesce(m.wallet, 'miner:' || m.id) as who, m.wallet from assignments a join miners m on m.id = a.miner
    where a.task = ? and a.status = 'accepted'`).all(task) as { who: string; wallet: string | null }[];
  if (!miners.length) return;
  const each = part / BigInt(miners.length);
  const add = db.prepare("insert into earnings (month, wallet, order_id, task, amount_wei, at) values (?, ?, ?, ?, ?, ?)");
  for (const m of miners) if (m.wallet && each > 0n) add.run(thisMonth(), m.wallet, o.id, task, each.toString(), Date.now());
}

/** Close an order: drop its jobs still out and return what it didn't spend. In a transaction. */
function close(o: OrderRow, status: "done" | "ended", reason: string): void {
  const dropped = db.prepare("update order_tasks set state = 3 where order_id = ? and state = 1 returning task").all(o.id) as { task: number }[];
  const unwanted = db.prepare("update tasks set priority = 0 where id = ? and not exists (select 1 from order_tasks where task = ? and state = 1)");
  for (const { task } of dropped) unwanted.run(task, task);
  const fresh = orderRow(o.id)!;
  const unspent = BigInt(fresh.budget_wei) - BigInt(fresh.spent_wei);
  if (unspent > 0n) book(o.wallet, o.id, "release", unspent);
  db.prepare("update orders set status = ?, end_reason = ?, closed_at = ? where id = ?").run(status, reason, Date.now(), o.id);
  sweeps.delete(o.id);
  touched(o.id);
  console.log(`order ${o.id.slice(0, 8)} ${status} (${reason}): spent ${fromWei(BigInt(fresh.spent_wei))}, ${fromWei(unspent)} back to the balance`);
}

function order(id: string) {
  const o = orderRow(id);
  if (!o) throw new HttpError(404, "no such order");
  const states = new Map((db.prepare("select state, count(*) as n from order_tasks where order_id = ? group by state").all(id) as { state: number; n: number }[])
    .map((r) => [r.state, r.n]));
  const budget = BigInt(o.budget_wei);
  const spent = BigInt(o.spent_wei);
  return {
    id: o.id, wallet: o.wallet, status: o.status === "unpaid" && o.expires_at < Date.now() ? "expired" : o.status, end_reason: o.end_reason,
    spec: JSON.parse(o.spec), jobs: o.jobs, taken_on: o.cursor, out: states.get(1) ?? 0, settled: states.get(2) ?? 0, dropped: states.get(3) ?? 0,
    bid: fromWei(BigInt(o.bid_wei)), budget: fromWei(budget), budget_wei: o.budget_wei, spent: fromWei(spent),
    returned: o.status === "done" || o.status === "ended" ? fromWei(budget - spent) : null,
    max_parallel: o.max_parallel, hours: o.hours,
    pay_to: ORDERS.payTo, token: ORDERS.token, tx: o.tx,
    usdc_payment: (() => {
      const u = one<{ tx: string; units: string; flyai_wei: string } | undefined>("select tx, units, flyai_wei from usdc_payments where order_id = ? order by at limit 1", id);
      return u ? { tx: u.tx, usdc: usdcText(BigInt(u.units)), flyai: fromWei(BigInt(u.flyai_wei)), explorer: USDC.explorer } : null;
    })(),
    created_at: o.created_at, expires_at: o.expires_at, funded_at: o.funded_at, ends_at: o.ends_at, closed_at: o.closed_at,
    last_seq: one<{ s: number | null }>("select max(seq) as s from order_tasks where order_id = ? and state = 2", id).s ?? 0,
    kind: JSON.parse(o.spec).kind as string,
    house: !!o.house, label: o.label, guest: !!o.guest,
    card: one<{ state: string; usdc: string; reason: string | null } | undefined>("select state, usdc, reason from card_checkouts where order_id = ?", id) ?? null,
    webhook: o.webhook ? { url: o.webhook, delivered_seq: o.webhook_seq, done: !!o.webhook_final, failures: o.webhook_fails, error: o.webhook_error } : null,
  };
}

/**
 * Fund an order with a transaction: a transfer of exactly its budget, from its wallet, to PAY_TO, mined after the
 * order was made. A late payment for an expired order still starts it. A payment for an order that's already running
 * (say, funded from the balance meanwhile) is kept as a deposit to the wallet's balance.
 */
async function payOrder(id: string, body: any) {
  ordersOn();
  const tx = String(body.tx ?? "").toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(tx)) throw new HttpError(400, "tx is a transaction hash");
  if (body.chain === "base") return payUsdc(id, tx);
  if (body.chain !== undefined && body.chain !== "robinhood") throw new HttpError(400, "chain is robinhood ($FLYAI) or base (USDC)");
  const o = orderRow(id);
  if (!o) throw new HttpError(404, "no such order");
  const used = one<{ order_id: string | null } | undefined>("select order_id from ledger where tx = ?", tx);
  if (used) {
    if (used.order_id === id) return order(id);
    throw new HttpError(409, "that transaction already paid another order");
  }
  let transfers;
  try {
    transfers = await transfersIn(CLAIMS.rpc, tx, ORDERS.token, ORDERS.payTo!);
  } catch (err) {
    throw new HttpError(502, `couldn't read the chain: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!transfers) throw new HttpError(409, "that transaction isn't mined yet; try again in a few seconds");
  const match = transfers.find((t) => t.from === o.wallet && t.value === BigInt(o.budget_wei) && t.at >= o.created_at - 120_000);
  if (!match) {
    throw new HttpError(402, transfers.length
      ? `that transaction doesn't pay exactly ${fromWei(BigInt(o.budget_wei))} ${CLAIMS.token_symbol} from ${o.wallet}`
      : `that transaction sends no ${CLAIMS.token_symbol} to ${ORDERS.payTo}`);
  }
  transaction(() => {
    if (one("select 1 from ledger where tx = ?", tx)) throw new HttpError(409, "that transaction was just used");
    book(o.wallet, id, "deposit", match.value, { tx });
    const now = orderRow(id)!;
    if (now.status !== "unpaid" && now.status !== "expired") return; // kept as balance
    book(o.wallet, id, "fund", match.value);
    start(now, tx);
  });
  return order(id);
}

// ---- USDC on Base -------------------------------------------------------------------------------------------
const usdcOn = () => {
  ordersOn();
  if (!USDC.enabled) throw new HttpError(503, "USDC payments are off");
};
const E30 = 10n ** 30n;
let priceCache: { e18: bigint; usd: number; at: number } | null = null;

/** $FLYAI in USD: the lower of GeckoTerminal and DexScreener (whichever answer), cached a minute. */
async function flyaiPrice(): Promise<{ e18: bigint; usd: number }> {
  if (USDC.fixedPrice) return { usd: Number(USDC.fixedPrice), e18: BigInt(Math.round(Number(USDC.fixedPrice) * 1e18)) };
  if (priceCache && Date.now() - priceCache.at < 60_000) return priceCache;
  const token = STAKING.token.toLowerCase();
  const get = (url: string) => fetch(url, { signal: AbortSignal.timeout(8_000), headers: { accept: "application/json" } }).then((r) => r.json());
  const feeds = await Promise.allSettled([
    get(`https://api.geckoterminal.com/api/v2/simple/networks/robinhood/token_price/${token}`)
      .then((j) => Number(j.data.attributes.token_prices[token])),
    get(`https://api.dexscreener.com/tokens/v1/robinhood/${token}`)
      .then((pairs: { baseToken: { address: string }; priceUsd?: string; liquidity?: { usd?: number } }[]) => {
        // the most liquid pair where $FLYAI is the priced token
        const best = pairs.filter((p) => p.baseToken.address.toLowerCase() === token && p.priceUsd)
          .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
        return Number(best?.priceUsd);
      }),
  ]);
  const prices = feeds.flatMap((f) => (f.status === "fulfilled" && Number.isFinite(f.value) && f.value > 0 ? [f.value] : []));
  if (!prices.length) throw new HttpError(503, "couldn't read the $FLYAI price just now; try again in a minute");
  const usd = Math.min(...prices);
  priceCache = { usd, e18: BigInt(Math.round(usd * 1e18)), at: Date.now() };
  return priceCache;
}

const usdcText = (units: bigint) => `${units / 1_000_000n}.${(units % 1_000_000n).toString().padStart(6, "0")}`;

/** POST /api/orders/:id/usdc: the order's budget in USDC at today's price, held for USDC_QUOTE_MIN. */
async function usdcQuote(id: string) {
  usdcOn();
  const o = orderRow(id);
  if (!o) throw new HttpError(404, "no such order");
  if (o.status !== "unpaid" && o.status !== "expired") throw new HttpError(409, `the order is already ${o.status}`);
  const price = await flyaiPrice();
  const base = (BigInt(o.budget_wei) * price.e18 + E30 - 1n) / E30; // micro-USDC, rounded up
  const now = Date.now();
  const taken = new Set((db.prepare("select units from usdc_quotes where expires_at > ? and order_id <> ?").all(now, id) as { units: string }[]).map((q) => q.units));
  let units = 0n;
  for (let i = 0; i < 50; i++) {
    const candidate = base + BigInt(1 + Math.floor(Math.random() * 999)); // under a tenth of a cent
    if (!taken.has(candidate.toString())) { units = candidate; break; }
  }
  if (!units) throw new HttpError(503, "too many USDC payments waiting; try again in a minute");
  db.prepare(`insert into usdc_quotes (order_id, units, price_e18, created_at, expires_at) values (?, ?, ?, ?, ?)
    on conflict (order_id) do update set units = excluded.units, price_e18 = excluded.price_e18, created_at = excluded.created_at, expires_at = excluded.expires_at`)
    .run(id, units.toString(), price.e18.toString(), now, now + USDC.quoteMs);
  return {
    order: id, usdc: usdcText(units), units: units.toString(), flyai: fromWei(BigInt(o.budget_wei)), flyai_usd: price.usd,
    expires_at: now + USDC.quoteMs, pay_to: ORDERS.payTo, token: USDC.token, chain_id: USDC.chain_id, chain_name: USDC.chain_name,
    // gasless: sign TransferWithAuthorization with this EIP-712 domain, then POST it to /api/orders/:id/usdc/authorize
    gasless: relayer ? { domain: { ...(await usdcDomain()), chainId: USDC.chain_id, verifyingContract: USDC.token } } : null,
  };
}

let domainCache: { name: string; version: string } | null = null;
async function usdcDomain() {
  domainCache ??= await tokenDomain(USDC.rpc, USDC.token).catch((err) => {
    throw new HttpError(502, `couldn't read the USDC contract: ${err instanceof Error ? err.message : err}`);
  });
  return domainCache;
}

const relaying = new Set<string>();

/**
 * POST /api/orders/:id/usdc/authorize {from, value, valid_after, valid_before, nonce, signature}: the buyer's signed
 * EIP-3009 authorization for the quoted USDC. The relayer sends it (paying the gas), then it's matched like any
 * USDC payment. It's simulated first, so a bad signature or too little USDC costs nothing.
 */
async function authorizeUsdc(id: string, body: any) {
  usdcOn();
  if (!relayer) throw new HttpError(503, "gasless USDC payments are off; send the USDC transfer yourself");
  const o = orderRow(id);
  if (!o) throw new HttpError(404, "no such order");
  if (o.status !== "unpaid" && o.status !== "expired") return order(id);
  const q = one<{ units: string } | undefined>("select units from usdc_quotes where order_id = ?", id);
  if (!q) throw new HttpError(409, "ask for a USDC price first (POST /api/orders/:id/usdc)");
  const from = typeof body.from === "string" && ADDRESS.test(body.from) ? checksumAddress(body.from) : "";
  const now = Math.floor(Date.now() / 1000);
  const validAfter = Number(body.valid_after);
  const validBefore = Number(body.valid_before);
  if (from !== o.wallet) throw new HttpError(400, "the authorization must come from the order's wallet");
  if (String(body.value) !== q.units) throw new HttpError(400, `the authorization must be for exactly ${usdcText(BigInt(q.units))} USDC`);
  if (!Number.isSafeInteger(validAfter) || validAfter < 0 || validAfter >= now) throw new HttpError(400, "valid_after must be in the past (0 is fine)");
  if (!Number.isSafeInteger(validBefore) || validBefore < now + 120 || validBefore > now + 86_400) throw new HttpError(400, "valid_before is 2 minutes to a day from now");
  if (typeof body.nonce !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(body.nonce)) throw new HttpError(400, "nonce is 32 bytes of hex");
  if (typeof body.signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(body.signature)) throw new HttpError(400, "signature is 65 bytes of hex");
  if (relaying.has(id)) throw new HttpError(409, "a payment for this order is already being sent; wait a moment");
  relaying.add(id);
  try {
    const data = transferWithAuthorizationData({
      from, to: ORDERS.payTo!, value: BigInt(q.units), validAfter: BigInt(validAfter), validBefore: BigInt(validBefore), nonce: body.nonce, signature: body.signature,
    });
    let hash: string;
    try {
      hash = await relayer.send(USDC.token, data);
    } catch (err) {
      const reverted = (err as { reverted?: boolean }).reverted;
      throw new HttpError(reverted ? 400 : 502, reverted
        ? `the USDC transfer wouldn't go through: check the wallet holds ${usdcText(BigInt(q.units))} USDC on ${USDC.chain_name} and sign again`
        : `couldn't send the transfer: ${err instanceof Error ? err.message : err}`);
    }
    return await payUsdc(id, hash.toLowerCase());
  } finally {
    relaying.delete(id);
  }
}

/**
 * POST /api/orders/:id/pay {tx, chain: "base"}: a USDC transfer of exactly the quoted amount, from the order's wallet
 * to PAY_TO, sent after the quote. Its $FLYAI goes to the wallet's balance and funds the order. Paid after the quote
 * ran out, the credit uses the price at that moment instead, and if that no longer covers the budget it waits in
 * the balance.
 */
async function payUsdc(id: string, tx: string) {
  usdcOn();
  const o = orderRow(id);
  if (!o) throw new HttpError(404, "no such order");
  const ledgerTx = `base:${tx}`;
  const used = one<{ order_id: string } | undefined>("select order_id from usdc_payments where tx = ?", tx);
  if (used) {
    if (used.order_id === id) return order(id);
    throw new HttpError(409, "that transaction already paid another order");
  }
  const q = one<{ units: string; price_e18: string; created_at: number; expires_at: number } | undefined>("select * from usdc_quotes where order_id = ?", id);
  if (!q) throw new HttpError(409, "ask for a USDC price first (POST /api/orders/:id/usdc)");
  let transfers;
  try {
    transfers = await transfersIn(USDC.rpc, tx, USDC.token, ORDERS.payTo!);
  } catch (err) {
    throw new HttpError(502, `couldn't read ${USDC.chain_name}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!transfers) throw new HttpError(409, "that transaction isn't mined yet; try again in a few seconds");
  const units = BigInt(q.units);
  const match = transfers.find((t) => t.from === o.wallet && t.value === units && t.at >= q.created_at - 120_000);
  if (!match) {
    throw new HttpError(402, transfers.length
      ? `that transaction doesn't pay exactly ${usdcText(units)} USDC from ${o.wallet}`
      : `that transaction sends no USDC to ${ORDERS.payTo} on ${USDC.chain_name}`);
  }
  const priceE18 = match.at <= q.expires_at ? BigInt(q.price_e18) : (await flyaiPrice()).e18;
  const wei = (units * E30) / priceE18;
  transaction(() => {
    if (one("select 1 from usdc_payments where tx = ?", tx)) throw new HttpError(409, "that transaction was just used");
    book(o.wallet, id, "deposit", wei, { tx: ledgerTx });
    db.prepare("insert into usdc_payments (tx, order_id, wallet, units, price_e18, flyai_wei, month, at) values (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(tx, id, o.wallet, units.toString(), priceE18.toString(), wei.toString(), thisMonth(), Date.now());
    db.prepare("delete from usdc_quotes where order_id = ?").run(id);
    const now = orderRow(id)!;
    const budget = BigInt(now.budget_wei);
    if ((now.status !== "unpaid" && now.status !== "expired") || balanceOf(now.wallet) < budget) return; // kept as balance
    book(now.wallet, id, "fund", budget);
    start(now, null);
  });
  console.log(`order ${id.slice(0, 8)}: ${usdcText(units)} USDC on ${USDC.chain_name} -> ${fromWei(wei)} FLYAI`);
  return order(id);
}

/** A month's USDC: what came in, and the part of the buyers' pool that came from USDC-paid orders. */
function usdcMonth(m: string) {
  const received = (db.prepare("select units from usdc_payments where month = ?").all(m) as { units: string }[]).reduce((s, r) => s + BigInt(r.units), 0n);
  const pool = (db.prepare(`select l.pool_wei from ledger l where l.kind = 'charge' and l.month = ?
    and l.order_id in (select order_id from usdc_payments)`).all(m) as { pool_wei: string }[]).reduce((s, r) => s + BigInt(r.pool_wei), 0n);
  return { usdc_received: usdcText(received), buyer_pool_from_usdc: fromWei(pool) };
}

const cardSessions = new Map<string, number[]>();

/**
 * POST /api/orders/:id/card: a single-use Coinbase checkout that sells the order's price in USDC (at least
 * CARD_MIN_USD) to whoever holds the link, paid straight to PAY_TO. No wallet or signature on the buyer's side: the
 * server confirms the purchase with Coinbase (checkCard) and funds the order with the $FLYAI it buys.
 */
async function cardCheckout(req: IncomingMessage, id: string) {
  usdcOn();
  if (!cdp) throw new HttpError(503, "card payments aren't set up");
  const o = orderRow(id);
  if (!o) throw new HttpError(404, "no such order");
  if (o.status !== "unpaid" && o.status !== "expired") throw new HttpError(409, `the order is already ${o.status}`);
  const ip = clientIp(req);
  const now = Date.now();
  const recent = (cardSessions.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= 20) throw new HttpError(429, "too many card checkouts from this address; try again later");
  cardSessions.set(ip, [...recent, now]);
  // price the order now; the purchase is credited at this price if it completes while the quote holds
  await usdcQuote(id);
  const q = one<{ units: string }>("select units from usdc_quotes where order_id = ?", id);
  const needed = (BigInt(q.units) + 9_999n) / 10_000n; // micro-USDC up to whole cents
  const cents = needed > CARD_MIN_CENTS ? needed : CARD_MIN_CENTS;
  const usdc = `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
  const ref = `${CDP_SANDBOX ? "sandbox-" : ""}order-${id}`;
  let session;
  try {
    session = await cdp.onramp({
      wallet: ORDERS.payTo!, usdc, network: "base",
      redirectUrl: PUBLIC_ORIGIN ? `${PUBLIC_ORIGIN}/compute/jobs?order=${id}` : undefined,
      // Coinbase refuses private addresses (a local server sees 127.0.0.1)
      clientIp: /^[0-9a-f.:]+$/i.test(ip) && !/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|::ffff:127\.|f[cd]|fe80)/i.test(ip) ? ip : undefined,
      partnerUserRef: ref,
    });
  } catch (err) {
    throw new HttpError(502, `couldn't open the card checkout: ${err instanceof Error ? err.message : err}`);
  }
  db.prepare(`insert into card_checkouts (order_id, ref, usdc, created_at, state) values (?, ?, ?, ?, 'open')
    on conflict (order_id) do update set ref = excluded.ref, usdc = excluded.usdc, created_at = excluded.created_at, state = 'open', reason = null`)
    .run(id, ref, usdc, now);
  return { url: session.url, usdc };
}

const cardChecked = new Map<string, number>();

/**
 * Asks Coinbase whether an order's card checkout went through. A successful purchase is checked on Base (USDC to
 * PAY_TO in its transaction), credited in $FLYAI to the order's wallet (PAY_TO for guests) and funds the order: a
 * guest's whole payment goes into its budget, anyone else's extra stays in their balance.
 */
async function checkCard(id: string): Promise<void> {
  const c = one<{ ref: string; state: string } | undefined>("select ref, state from card_checkouts where order_id = ?", id);
  if (!c || c.state !== "open" || !cdp) return;
  if (Date.now() - (cardChecked.get(id) ?? 0) < 4_000) return;
  cardChecked.set(id, Date.now());
  const txs = await cdp.transactions(c.ref);
  const failed = txs.find((t) => t.status === "ONRAMP_TRANSACTION_STATUS_FAILED");
  const done = txs.find((t) => t.status === "ONRAMP_TRANSACTION_STATUS_SUCCESS" && t.tx_hash
    && t.wallet_address?.toLowerCase() === ORDERS.payTo!.toLowerCase() && (t.purchase_currency ?? "").toUpperCase() === "USDC");
  if (!done) {
    if (failed && !txs.some((t) => t.status !== "ONRAMP_TRANSACTION_STATUS_FAILED")) {
      db.prepare("update card_checkouts set state = 'failed', reason = ? where order_id = ?").run(failed.failure_reason ?? "the card payment didn't go through", id);
    }
    return;
  }
  const tx = done.tx_hash!.toLowerCase();
  if (one("select 1 from usdc_payments where tx = ?", tx)) return;
  const transfers = await transfersIn(USDC.rpc, tx, USDC.token, ORDERS.payTo!);
  if (!transfers?.length) return; // not visible on Base yet
  const units = transfers.reduce((sum, t) => sum + t.value, 0n);
  const q = one<{ price_e18: string; expires_at: number } | undefined>("select price_e18, expires_at from usdc_quotes where order_id = ?", id);
  const at = transfers[0].at;
  const priceE18 = q && at <= q.expires_at ? BigInt(q.price_e18) : (await flyaiPrice()).e18;
  const wei = (units * E30) / priceE18;
  transaction(() => {
    if (one("select 1 from usdc_payments where tx = ?", tx)) return;
    const o = orderRow(id)!;
    book(o.wallet, id, "deposit", wei, { tx: `base:${tx}` });
    db.prepare("insert into usdc_payments (tx, order_id, wallet, units, price_e18, flyai_wei, month, at) values (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(tx, id, o.wallet, units.toString(), priceE18.toString(), wei.toString(), thisMonth(), Date.now());
    db.prepare("update card_checkouts set state = 'paid' where order_id = ?").run(id);
    db.prepare("delete from usdc_quotes where order_id = ?").run(id);
    if (o.status !== "unpaid" && o.status !== "expired") return;
    if (o.guest) {
      // everything a guest paid runs their order; what it doesn't spend returns to PAY_TO's balance
      db.prepare("update orders set budget_wei = ? where id = ?").run(wei.toString(), id);
      book(o.wallet, id, "fund", wei);
      start(orderRow(id)!, null);
    } else if (balanceOf(o.wallet) >= BigInt(o.budget_wei)) {
      book(o.wallet, id, "fund", BigInt(o.budget_wei));
      start(o, null);
    }
  });
  console.log(`order ${id.slice(0, 8)}: paid by card, ${usdcText(units)} USDC -> ${fromWei(wei)} FLYAI`);
}

/** GET /api/orders/:id/card: the order, after checking its card checkout with Coinbase. */
async function cardStatus(id: string) {
  if (!orderRow(id)) throw new HttpError(404, "no such order");
  await checkCard(id).catch((err) => console.log(`card check ${id.slice(0, 8)}: ${err instanceof Error ? err.message : err}`));
  return order(id);
}

// wallet signatures for spending a balance or stopping an order
const intents = new Map<string, { order: string; action: "fund" | "stop"; message: string; expires: number }>();

function intent(id: string, body: any) {
  const o = orderRow(id);
  if (!o) throw new HttpError(404, "no such order");
  const action = body.action;
  if (action !== "fund" && action !== "stop") throw new HttpError(400, "action is fund or stop");
  prune(intents);
  const nonce = randomBytes(12).toString("hex");
  const expires = new Date(Date.now() + SIGN_IN_TTL_MS);
  const message = intentMessage({ action, order: id, wallet: o.wallet, budget: fromWei(BigInt(o.budget_wei)), nonce, expires, symbol: CLAIMS.token_symbol });
  intents.set(nonce, { order: id, action, message, expires: expires.getTime() });
  return { nonce, message };
}

function signedAction(id: string, action: "fund" | "stop", body: any, req?: IncomingMessage) {
  ordersOn();
  if (action === "stop" && req && keyed(req, id)) {
    transaction(() => {
      const now = orderRow(id)!;
      if (now.status !== "live") throw new HttpError(409, `the order is ${now.status}`);
      close(now, "ended", "stopped");
    });
    return order(id);
  }
  const o = orderRow(id);
  if (!o) throw new HttpError(404, "no such order");
  const signedIn = req && body.nonce === undefined ? sessionWallet(req) : null;
  if (signedIn) {
    if (signedIn.wallet !== o.wallet) throw new HttpError(401, "you're signed in with a different wallet from the order's");
  } else {
    const pending = typeof body.nonce === "string" ? intents.get(body.nonce) : undefined;
    if (!pending || pending.expires < Date.now() || pending.order !== id || pending.action !== action) throw new HttpError(410, "this request has expired; try again");
    let signer: string;
    try {
      signer = recoverAddress(pending.message, String(body.signature ?? ""));
    } catch (err) {
      throw new HttpError(400, `bad signature: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (signer !== o.wallet) throw new HttpError(401, "the signature isn't from the order's wallet");
    intents.delete(body.nonce);
  }
  transaction(() => {
    const now = orderRow(id)!;
    if (action === "stop") {
      if (now.status !== "live") throw new HttpError(409, `the order is ${now.status}`);
      close(now, "ended", "stopped");
      return;
    }
    if (now.status !== "unpaid" && now.status !== "expired") throw new HttpError(409, "the order is already funded");
    const budget = BigInt(now.budget_wei);
    const balance = balanceOf(now.wallet);
    if (balance < budget) throw new HttpError(402, `the balance is ${fromWei(balance)} ${CLAIMS.token_symbol}; the order needs ${fromWei(budget)}`);
    book(now.wallet, id, "fund", budget);
    start(now, null);
  });
  return order(id);
}

const csvCell = (v: unknown) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

/**
 * An order's settled jobs with their motor spike counts (never hashes), in settle order after `after`, at most `limit`.
 * `next` is the seq to ask after next time. A row whose agreement is being re-checked (a miner behind it was caught
 * lying) holds the page there until the server's own run settles it again, so no row is skipped.
 */
function orderResults(id: string, after = 0, limit = Number.MAX_SAFE_INTEGER) {
  const o = orderRow(id);
  if (!o) throw new HttpError(404, "no such order");
  const ref = loadedRef();
  const program = isProgramKind(JSON.parse(o.spec).kind);
  const rows = db.prepare(`select t.id, t.params, ot.seq from order_tasks ot join tasks t on t.id = ot.task
    where ot.order_id = ? and ot.state = 2 and ot.seq > ? order by ot.seq limit ?`).all(id, after, limit) as (TaskRow & { seq: number })[];
  const out = [];
  let next = after;
  for (const row of rows) {
    const s = settled(row.id);
    if (!s) break;
    if (program) {
      out.push({ seq: row.seq, ...programRow(JSON.parse(row.params), s) } as any);
    } else {
      const r = JSON.parse(s.result) as TaskResult;
      out.push({ seq: row.seq, ...(JSON.parse(row.params) as TaskParams), checked_by: s.by, spikes: r.spikes, base: r.base, stim: r.stim });
    }
    next = row.seq;
  }
  const view = order(id);
  const head = { order: id, kind: program ? JSON.parse(o.spec).kind : "connectome-sweep", status: view.status, jobs: o.jobs, settled: view.settled, after, next, more: next < view.last_seq };
  if (program) return { ...head, rows: out, outputs: [] as string[], output_sizes: [] as number[], dt: 0 };
  return {
    ...head,
    units: "spike counts per motor group: base before the drive starts (warm steps), stim after it",
    dt: ref.dt, outputs: ref.outputs, output_sizes: ref.outputSizes, rows: out,
  };
}

// ---- feeding results: stream and webhooks --------------------------------------------------------------
let lastSeq = one<{ s: number | null }>("select max(seq) as s from order_tasks").s ?? 0;
const streams = new Map<string, Set<{ res: ServerResponse; after: number; status: string }>>();
const pendingFeeds = new Set<string>();

/** An order got rows or changed status; streams hear about it once the current transaction has committed. */
function touched(id: string): void {
  if (!pendingFeeds.size) setImmediate(flushStreams);
  pendingFeeds.add(id);
}

function sse(res: ServerResponse, event: string, data: unknown, id?: number): void {
  res.write(`${id === undefined ? "" : `id: ${id}\n`}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function feedStream(id: string, sub: { res: ServerResponse; after: number; status: string }): void {
  for (;;) {
    const page = orderResults(id, sub.after, WEBHOOK_BATCH);
    for (const row of page.rows) sse(sub.res, "result", row, row.seq);
    sub.after = page.next;
    if (!page.rows.length || !page.more) break;
  }
  const view = order(id);
  if (view.status !== sub.status) {
    sub.status = view.status;
    sse(sub.res, "status", { status: view.status, end_reason: view.end_reason, settled: view.settled, jobs: view.jobs, spent: view.spent });
  }
}

function flushStreams(): void {
  const ids = [...pendingFeeds];
  pendingFeeds.clear();
  for (const id of ids) for (const sub of streams.get(id) ?? []) feedStream(id, sub);
}

/** GET /api/orders/:id/stream: server-sent events from `after` (or Last-Event-ID) on. */
function openStream(req: IncomingMessage, res: ServerResponse, id: string, after: number): void {
  if (!orderRow(id)) throw new HttpError(404, "no such order");
  loadedRef();
  const resume = Number(req.headers["last-event-id"]);
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no", ...CORS });
  const sub = { res, after: Number.isSafeInteger(resume) && resume > after ? resume : after, status: "" };
  let set = streams.get(id);
  if (!set) streams.set(id, (set = new Set()));
  set.add(sub);
  res.write("retry: 5000\n\n");
  feedStream(id, sub);
  // Fly's proxy closes connections idle for 60 s
  const beat = setInterval(() => res.write(": ping\n\n"), 25_000);
  req.on("close", () => {
    clearInterval(beat);
    set.delete(sub);
    if (!set.size) streams.delete(id);
  });
}

/** POST each webhook order's new rows (and at the end its final status), one order at a time, with backoff. */
let delivering = false;
async function deliverWebhooks(): Promise<void> {
  if (delivering || !reference) return;
  delivering = true;
  try {
    const due = db.prepare(`select o.id from orders o where o.webhook is not null and o.status in ('live', 'done', 'ended')
      and o.webhook_fails < ? and (o.webhook_next_at is null or o.webhook_next_at <= ?)
      and (o.webhook_final = 0 or exists (select 1 from order_tasks ot where ot.order_id = o.id and ot.state = 2 and ot.seq > o.webhook_seq))`)
      .all(WEBHOOK_MAX_FAILS, Date.now()) as { id: string }[];
    for (const { id } of due) {
      const o = orderRow(id)!;
      const page = orderResults(id, o.webhook_seq, WEBHOOK_BATCH);
      const final = page.status === "done" || page.status === "ended";
      if (!page.rows.length && !(final && !page.more)) continue; // live with nothing new
      const body = JSON.stringify({ ...page, final: final && !page.more });
      let error: string | null = null;
      try {
        await checkWebhook(o.webhook!, WEBHOOK_ALLOW_INTERNAL); // again: the name may point somewhere else now
        const res = await fetch(o.webhook!, {
          method: "POST", body, redirect: "manual", signal: AbortSignal.timeout(10_000),
          headers: { "content-type": "application/json", "user-agent": "flyai-compute-webhook", "x-flyai-order": id, "x-flyai-signature": sign(o.webhook_secret!, body) },
        });
        if (res.status < 200 || res.status >= 300) error = `HTTP ${res.status}`;
        await res.body?.cancel().catch(() => {});
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      if (error) {
        db.prepare("update orders set webhook_fails = webhook_fails + 1, webhook_next_at = ?, webhook_error = ? where id = ?")
          .run(Date.now() + backoffMs(o.webhook_fails + 1), error, id);
      } else {
        db.prepare("update orders set webhook_seq = ?, webhook_final = ?, webhook_fails = 0, webhook_next_at = null, webhook_error = null where id = ?")
          .run(page.next, final && !page.more ? 1 : 0, id);
      }
    }
  } finally {
    delivering = false;
  }
}

function orderCsv(res: ServerResponse, id: string): void {
  const r = orderResults(id);
  if (r.kind !== "connectome-sweep") {
    const rows = r.rows as unknown as ReturnType<typeof programRow>[];
    const lines = [["seq", "index", "input", "checked_by", "output", "size", "error"],
      ...rows.map((x: any) => [x.seq, x.index, x.input, x.checked_by, x.output?.url ?? "", x.output?.size ?? "", x.error ?? (x.answers ? "disputed" : "")])];
    res.writeHead(200, { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="flyai-order-${id.slice(0, 8)}.csv"`, "cache-control": "no-store", ...CORS });
    return void res.end(lines.map((l) => l.map(csvCell).join(",")).join("\n") + "\n");
  }
  const head = ["channel", "side", "amount", "gain", "tonic", "seed", "steps", "warm", "checked_by", "spikes",
    ...r.outputs.map((o) => `base ${o}`), ...r.outputs.map((o) => `stim ${o}`)];
  const lines = [head, ...r.rows.map((x) => [x.channel, x.side, x.amount, x.gain, x.tonic, x.seed, x.steps, x.warm, x.checked_by, x.spikes, ...x.base, ...x.stim])];
  res.writeHead(200, { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="flyai-order-${id.slice(0, 8)}.csv"`, "cache-control": "no-store", ...CORS });
  res.end(lines.map((l) => l.map(csvCell).join(",")).join("\n") + "\n");
}

function ordersOf(wallet: string) {
  if (!ADDRESS.test(wallet)) throw new HttpError(400, "wallet must be 0x followed by 40 hex digits");
  const w = checksumAddress(wallet);
  const ids = db.prepare("select id from orders where wallet = ? order by created_at desc limit 50").all(w) as { id: string }[];
  return { wallet: w, balance: fromWei(balanceOf(w)), orders: ids.map((r) => order(r.id)) };
}

function adminOrders() {
  const months = db.prepare("select month, count(*) as jobs, group_concat(amount_wei) as charged, group_concat(pool_wei) as pool from ledger where kind = 'charge' group by month order by month desc")
    .all() as { month: string; jobs: number; charged: string; pool: string }[];
  const sum = (csv: string) => csv.split(",").reduce((acc, x) => acc + BigInt(x), 0n);
  const wallets = (db.prepare("select distinct wallet from ledger").all() as { wallet: string }[])
    .map((r) => ({ wallet: r.wallet, balance: balanceOf(r.wallet) })).filter((b) => b.balance > 0n);
  const rows = db.prepare("select id from orders where status not in ('unpaid', 'expired') order by funded_at desc limit 200").all() as { id: string }[];
  return {
    months: months.map((m) => {
      const charged = sum(m.charged);
      const pool = sum(m.pool);
      return { month: m.month, jobs_charged: m.jobs, charged: fromWei(charged), pool: fromWei(pool), treasury: fromWei(charged - pool) };
    }),
    // tokens held for buyers: returned on request with POST /api/admin/withdraw after sending them on-chain
    balances: wallets.map((b) => ({ wallet: b.wallet, balance: fromWei(b.balance) })),
    orders: rows.map((r) => order(r.id)),
  };
}

/** Record tokens the operator sent back to a wallet from its balance. */
function withdraw(body: any) {
  if (typeof body.wallet !== "string" || !ADDRESS.test(body.wallet)) throw new HttpError(400, "wallet must be 0x followed by 40 hex digits");
  if (typeof body.tx !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(body.tx)) throw new HttpError(400, "tx is the hash of the transfer back");
  const w = checksumAddress(body.wallet);
  let amount: bigint;
  try {
    amount = toWei(String(body.amount ?? ""));
  } catch {
    throw new HttpError(400, "amount is a number of tokens");
  }
  transaction(() => {
    const balance = balanceOf(w);
    if (amount <= 0n || amount > balance) throw new HttpError(409, `the balance is ${fromWei(balance)}`);
    book(w, null, "withdraw", amount, { tx: body.tx.toLowerCase() });
    db.prepare("update withdraw_requests set status = 'paid', done_at = ?, tx = ? where wallet = ? and status = 'open'").run(Date.now(), body.tx.toLowerCase(), w);
  });
  return balanceView(w);
}

function loadedRef(): Reference {
  if (!reference) throw new HttpError(503, "server is loading the connectome, try again in a moment");
  return reference;
}

// ---- buyers' programs: uploads, checks, answers ------------------------------------------------------------
// A program order (src/orders.ts openSpec) runs a WebAssembly module or WGSL shader on each input. Miners fetch both
// by hash, check them, run them sandboxed (web/openjob.ts) and upload the output. Nobody is struck over a program:
// a job settles when `redundancy` wallets agree (exactly, or within a shader's f32 tolerance), answers that don't
// match earn nothing, and a job nobody agrees on after redundancy + 2 answers goes to the buyer as disputed.
mkdirSync(BLOBS_DIR, { recursive: true });
const blobPath = (hash: string) => join(BLOBS_DIR, hash);
/** What a file really takes: whole 4 KB blocks. By size alone, 167k small outputs came to 837 MB under a 600 MB cap. */
const onDisk = (size: number) => Math.ceil(size / 4096) * 4096;
const blobBytes = () => one<{ s: number | null }>("select sum((size + 4095) / 4096 * 4096) as s from blobs").s ?? 0;

/** Store bytes by sha256 (once); returns the hash. */
function putBlob(bytes: Uint8Array): string {
  const hash = createHash("sha256").update(bytes).digest("hex");
  const now = Date.now();
  if (one("select 1 from blobs where hash = ?", hash) && existsSync(blobPath(hash))) {
    db.prepare("update blobs set used_at = ? where hash = ?").run(now, hash);
    return hash;
  }
  if (blobBytes() + onDisk(bytes.length) > STORE_MAX_BYTES) throw new HttpError(507, "storage is full right now; try again later");
  const tmp = `${blobPath(hash)}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tmp, bytes);
  renameSync(tmp, blobPath(hash));
  db.prepare("insert into blobs (hash, size, created_at, used_at) values (?, ?, ?, ?) on conflict (hash) do update set used_at = excluded.used_at")
    .run(hash, bytes.length, now, now);
  return hash;
}

function needBlob(hash: string): Uint8Array {
  if (!BLOB_HASH.test(hash) || !one("select 1 from blobs where hash = ?", hash) || !existsSync(blobPath(hash))) {
    throw new HttpError(400, `no upload ${hash.slice(0, 12)}…; POST it to /api/blobs first`);
  }
  db.prepare("update blobs set used_at = ? where hash = ?").run(Date.now(), hash);
  return readFileSync(blobPath(hash));
}

/**
 * Check an order's program and return the hash miners will run: for WASM the module with its memory and tables
 * capped (src/wasmcheck.ts), stored as its own upload; for WGSL the shader as given.
 */
function checkProgram(spec: OpenSpec): string {
  if (spec.kind === "embed") return spec.program; // a model id, checked against EMBED_MODELS by openSpec
  const bytes = needBlob(spec.program);
  try {
    if (spec.kind === "wgsl") {
      inspectWgsl(bytes);
      return spec.program;
    }
    return putBlob(inspectWasm(bytes).bytes);
  } catch (err) {
    if (err instanceof WasmError) throw new HttpError(400, `program refused: ${err.message}`);
    throw err;
  }
}

/** Every input must be uploaded; an embed input must also be a valid batch of texts. */
function checkInputs(kind: string, inputs: string[]): void {
  for (const h of new Set(inputs)) {
    if (h === INDEX_INPUT) continue;
    const bytes = needBlob(h);
    if (kind === "embed") asked(() => embedTexts(bytes));
  }
}

/** How many texts an embed input holds (checked when it was ordered), remembered by hash. */
const textCounts = new Map<string, number>();
function textCount(hash: string): number {
  let n = textCounts.get(hash);
  if (n === undefined) {
    n = embedTexts(readFileSync(blobPath(hash))).length;
    if (textCounts.size > 50_000) textCounts.clear();
    textCounts.set(hash, n);
  }
  return n;
}

const uploads = new Map<string, { at: number; bytes: number }[]>();
/** Whether the request carries the admin token (the house bridges do), without throwing. */
function isAdmin(req: IncomingMessage): boolean {
  try {
    adminOnly(req);
    return true;
  } catch {
    return false;
  }
}

/** POST /api/blobs with the raw bytes: → {hash, size, url}. Limits per IP: 600 uploads and 2 GB an hour,
 *  except for admin uploads: the mining bridges upload one input per job, far more than that. */
async function upload(req: IncomingMessage) {
  const ip = clientIp(req);
  const hourAgo = Date.now() - 3_600_000;
  const recent = (uploads.get(ip) ?? []).filter((u) => u.at > hourAgo);
  if (!isAdmin(req) && (recent.length >= 600 || recent.reduce((sum, u) => sum + u.bytes, 0) > 2e9)) throw new HttpError(429, "too many uploads from this address, try later");
  const declared = Number(req.headers["content-length"] ?? 0);
  if (declared > BLOB_MAX_BYTES) throw new HttpError(413, `uploads are at most ${BLOB_MAX_BYTES} bytes`);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BLOB_MAX_BYTES) throw new HttpError(413, `uploads are at most ${BLOB_MAX_BYTES} bytes`);
    chunks.push(chunk);
  }
  uploads.set(ip, [...recent, { at: Date.now(), bytes: size }]);
  const hash = putBlob(Buffer.concat(chunks));
  return { hash, size, url: `/api/blobs/${hash}` };
}

/** Anyone may fetch an upload by hash. Served as a download, never as a page, so an upload can't script this origin. */
function serveBlob(res: ServerResponse, hash: string): void {
  if (!existsSync(blobPath(hash))) throw new HttpError(404, "no such upload (uploads nobody uses are deleted after a while)");
  res.writeHead(200, {
    "content-type": "application/octet-stream", "content-disposition": `attachment; filename="${hash}"`,
    "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; sandbox", ...CORS,
  });
  res.end(readFileSync(blobPath(hash)));
}

let lastGc = Date.now();
/** Delete uploads and outputs not used for BLOB_TTL_DAYS, unless an unpaid or live order still needs them. */
function collectBlobs(): void {
  lastGc = Date.now();
  const old = db.prepare("select hash from blobs where used_at < ? and keep = 0").all(Date.now() - BLOB_TTL_MS) as { hash: string }[];
  const inUse = db.prepare(`select 1 from orders o where o.status in ('unpaid', 'live') and (instr(o.spec, ?) > 0
    or exists (select 1 from order_inputs i where i.order_id = o.id and i.input = ?))`);
  let n = 0;
  for (const { hash } of old) {
    if (inUse.get(hash, hash)) continue;
    rmSync(blobPath(hash), { force: true });
    db.prepare("delete from blobs where hash = ?").run(hash);
    n++;
  }
  if (n) console.log(`deleted ${n} unused uploads`);
}

// ---- pruning ------------------------------------------------------------------------------------------
// Every screen job leaves a task row and an assignment row holding its answer: 1.7M a day by 2026-09-22, which
// filled /data twice (09-19, 09-23). Once a finished job has sat untouched for PRUNE_AFTER_HOURS its answer is
// added to screen_sums (what /api/results reports) and both rows go. Credit is already in day_credit, so nothing a
// miner earned changes. Never pruned: canaries (the server's own answers), paid jobs, buyers' programs, house jobs,
// and jobs a verifier holds. A miner struck later can no longer take back answers older than the window.
const PRUNE_BATCH = 250; // task ids per transaction; after each, a pause twice as long so requests keep flowing
let pruneFloor = 0; // every task id below this is pruned or kept for good
let lastPrune = 0;
let pruning = false;
const counter = (name: string) => one<{ n: number } | undefined>("select n from counters where name = ?", name)?.n ?? 0;

async function pruneScreen(): Promise<void> {
  const ref = reference;
  if (pruning || !ref) return;
  pruning = true;
  lastPrune = Date.now();
  const started = Date.now();
  const top = one<{ n: number | null }>("select max(id) as n from tasks").n ?? 0;
  // the unary + keeps SQLite on the id range: left to itself it took tasks_open (state = 'done') and read every
  // finished job for each batch of 1000, which froze the server on its first run (2026-09-23)
  const pick = db.prepare(`select t.id, t.params, (select a.result from assignments a join miners m on m.id = a.miner
      where a.task = t.id and (a.status = 'accepted' or (a.status = 'pending' and m.strikes = 0)) limit 1) as result
    from tasks t where t.id >= ? and t.id < ? and +t.kind = 'connectome' and +t.state = 'done' and t.truth is null
      and not exists (select 1 from order_tasks ot where ot.task = t.id)
      and not exists (select 1 from assignments a where a.task = t.id and (a.status = 'issued' or coalesce(a.submitted_at, a.issued_at) >= ?))`);
  const getSum = db.prepare("select seeds, base, stim from screen_sums where key = ?");
  const putSum = db.prepare("insert into screen_sums (key, seeds, base, stim) values (?, ?, ?, ?) on conflict (key) do update set seeds = excluded.seeds, base = excluded.base, stim = excluded.stim");
  const dropAssignments = db.prepare("delete from assignments where task = ?");
  const dropTask = db.prepare("delete from tasks where id = ?");
  const addCount = db.prepare("insert into counters (name, n) values ('pruned_tasks', ?) on conflict (name) do update set n = n + excluded.n");
  let pruned = 0;
  try {
    for (let from = pruneFloor; from <= top; from += PRUNE_BATCH) {
      // at full speed the first run (4.5M jobs, 2026-09-23) left requests 25 ms in every 400 and the health check failed
      const batchStart = Date.now();
      const cutoff = batchStart - PRUNE_AFTER_MS;
      const rows = (pick.all(from, from + PRUNE_BATCH, cutoff) as { id: number; params: string; result: string | null }[])
        .filter((row) => !queued.has(row.id));
      if (rows.length) transaction(() => {
        const sums = new Map<string, { seeds: number; base: number[]; stim: number[] }>();
        for (const row of rows) {
          if (row.result) {
            const { key, params } = screenKey(JSON.parse(row.params) as TaskParams);
            const r = screenRates(params, JSON.parse(row.result) as TaskResult, ref.outputSizes, ref.dt);
            let s = sums.get(key);
            if (!s) {
              const old = getSum.get(key) as { seeds: number; base: string; stim: string } | undefined;
              s = old ? { seeds: old.seeds, base: JSON.parse(old.base), stim: JSON.parse(old.stim) } : { seeds: 0, base: r.base.map(() => 0), stim: r.stim.map(() => 0) };
              sums.set(key, s);
            }
            s.seeds++;
            r.base.forEach((x, g) => { s.base[g] += x; });
            r.stim.forEach((x, g) => { s.stim[g] += x; });
          }
          dropAssignments.run(row.id);
          dropTask.run(row.id);
        }
        for (const [key, s] of sums) putSum.run(key, s.seeds, JSON.stringify(s.base), JSON.stringify(s.stim));
        addCount.run(rows.length);
      });
      pruned += rows.length;
      await new Promise((resolve) => setTimeout(resolve, Math.max(5, 2 * (Date.now() - batchStart))));
    }
    pruneFloor = one<{ n: number | null }>(`select min(t.id) as n from tasks t where t.id >= ? and +t.kind = 'connectome' and t.truth is null
      and not exists (select 1 from order_tasks ot where ot.task = t.id)`, pruneFloor).n ?? top + 1;
    if (pruned) console.log(`pruned ${pruned} finished screen jobs in ${Math.round((Date.now() - started) / 1000)} s`);
  } catch (err) {
    console.error(`pruning stopped: ${(err as Error).message}`);
  } finally {
    pruning = false;
  }
}

/** In a transaction. */
function addInputs(orderId: string, from: number, inputs: string[]): void {
  const add = db.prepare("insert into order_inputs (order_id, idx, input) values (?, ?, ?)");
  inputs.forEach((h, i) => add.run(orderId, from + i, h));
}

/** The order key given at creation, as a bearer token. */
function keyed(req: IncomingMessage, id: string): boolean {
  const token = /^Bearer ([0-9a-f]{48})$/.exec(req.headers.authorization ?? "")?.[1];
  const row = orderRow(id);
  if (!token || !row?.order_key_hash) return false;
  return timingSafeEqual(Buffer.from(sha256(token), "hex"), Buffer.from(row.order_key_hash, "hex"));
}

/** POST /api/orders/:id/jobs {inputs} or {count} with the order key: more jobs for a program order that hasn't ended. */
function appendJobs(req: IncomingMessage, id: string, body: any) {
  const o = orderRow(id);
  if (!o) throw new HttpError(404, "no such order");
  if (!keyed(req, id)) throw new HttpError(401, "send the order key from creation as Authorization: Bearer <order_key>");
  if (o.status === "done" || o.status === "ended") throw new HttpError(409, `the order has ${o.status === "done" ? "finished" : "ended"}; create a new one`);
  const count = body.count === undefined ? null : Number(body.count);
  if (count !== null && !(Number.isInteger(count) && count >= 1 && count <= 50_000)) throw new HttpError(400, "count is 1..50000");
  const kind = JSON.parse(o.spec).kind;
  if (kind === "embed" && count !== null) throw new HttpError(400, "embed jobs need inputs: upload JSON arrays of texts");
  const inputs: string[] = count !== null ? Array.from({ length: count }, () => INDEX_INPUT) : body.inputs;
  if (count === null && (!Array.isArray(inputs) || !inputs.length || inputs.length > 50_000 || inputs.some((h) => typeof h !== "string" || !BLOB_HASH.test(h)))) {
    throw new HttpError(400, "send inputs (1..50000 upload sha256s) or count (jobs given their index)");
  }
  if (o.jobs + inputs.length > 1_000_000) throw new HttpError(409, "an order holds at most 1,000,000 jobs");
  checkInputs(kind, inputs);
  transaction(() => {
    const now = orderRow(id)!;
    addInputs(id, now.jobs, inputs);
    db.prepare("update orders set jobs = jobs + ? where id = ?").run(inputs.length, id);
    refill(id);
  });
  return order(id);
}

/** A miner's answer to a program job: an output (stored as an upload) or the error the program hit. */
function programAnswer(raw: any, params: any): string {
  // an embed input was checked when it was ordered, so a model can't fail on it: an error there is a miner's problem
  if (params.kind === "embed" && raw && typeof raw.error === "string") throw new HttpError(400, "embed jobs answer with vectors; release the job if this machine can't run it");
  if (raw && typeof raw.error === "string") {
    return JSON.stringify({ error: raw.error.replace(/[^\x20-\x7e]/g, "?").slice(0, 200) });
  }
  if (!raw || typeof raw.output !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(raw.output)) throw new HttpError(400, "result is {output: base64} or {error}");
  const bytes = Buffer.from(raw.output, "base64");
  const limit = params.output_bytes ?? MAX_OUTPUT_BYTES;
  if (params.output_bytes ? bytes.length !== limit : bytes.length > limit) throw new HttpError(400, `output must be ${params.output_bytes ? "exactly" : "at most"} ${limit} bytes`);
  const hash = putBlob(bytes);
  if (orderRow(params.order)?.house) db.prepare("update blobs set keep = 1 where hash = ?").run(hash);
  return JSON.stringify({ output: hash, size: bytes.length });
}

function answersAgree(a: string, b: string, compare: OpenSpec["compare"] | { cosine: number; dim: number }): boolean {
  if (a === b) return true;
  if (compare === "exact") return false;
  const x = JSON.parse(a);
  const y = JSON.parse(b);
  if (!x.output || !y.output || x.size !== y.size) return false;
  if ("cosine" in compare) return cosineAgree(readFileSync(blobPath(x.output)), readFileSync(blobPath(y.output)), (compare as { dim: number }).dim, compare.cosine);
  return f32Agree(readFileSync(blobPath(x.output)), readFileSync(blobPath(y.output)), compare.f32_tolerance);
}

/** Settle a program job if its answers allow it. In a transaction. */
function settleProgram(task: number, params: any): boolean {
  const rows = db.prepare(`select a.id, a.result, coalesce(m.wallet, m.id) as who from assignments a join miners m on m.id = a.miner
    where a.task = ? and a.status = 'pending' and m.strikes = 0 order by a.submitted_at`).all(task) as { id: string; result: string; who: string }[];
  const groups: { result: string; who: Set<string>; ids: string[] }[] = [];
  for (const r of rows) {
    const g = groups.find((x) => answersAgree(x.result, r.result, params.compare));
    if (g) {
      g.who.add(r.who);
      g.ids.push(r.id);
    } else {
      groups.push({ result: r.result, who: new Set([r.who]), ids: [r.id] });
    }
  }
  const best = groups.sort((x, y) => y.who.size - x.who.size)[0];
  const everyone = new Set(rows.map((r) => r.who)).size;
  let truth: string;
  let by: string;
  let accepted: string[];
  if (best && best.who.size >= params.redundancy) {
    truth = best.result;
    by = params.redundancy === 1 ? "single" : "agreement";
    accepted = best.ids;
  } else if (everyone >= params.redundancy + 2) {
    truth = JSON.stringify({ disputed: groups.map((g) => ({ ...JSON.parse(g.result), miners: g.who.size })) });
    by = "disputed";
    accepted = groups.flatMap((g) => g.ids);
  } else {
    return false;
  }
  const accept = db.prepare("update assignments set status = 'accepted' where id = ?");
  for (const id of accepted) accept.run(id);
  // the rest did the work but don't match: no pay, and no strike either ('expired' counts for nothing)
  db.prepare("update assignments set status = 'expired' where task = ? and status = 'pending'").run(task);
  db.prepare("update tasks set truth = ?, settled_by = ?, checked_at = ?, state = 'done', priority = 0 where id = ?").run(truth, by, Date.now(), task);
  onSettled(task);
  return true;
}

function submitOpen(job: string, task: number, params: any, body: any) {
  const result = programAnswer(body.result, params);
  transaction(() => {
    const { truth } = one<{ truth: string | null }>("select truth from tasks where id = ?", task);
    // late: the job settled while this miner ran it
    const status = truth === null ? "pending" : answersAgree(truth, result, params.compare) ? "accepted" : "expired";
    db.prepare("update assignments set status = ?, result = ?, submitted_at = ?, day = ? where id = ?").run(status, result, Date.now(), today(), job);
    if (status === "pending" && !settleProgram(task, params)) db.prepare("update tasks set state = 'open' where id = ?").run(task);
  });
  return { status: "received" };
}

// ---- house orders: our own work --------------------------------------------------------------------------------
// Created by the operator with the admin token: no payment, no charges, nothing added to the pool. They run after
// every paid order and before the free screen. Brain sweeps earn their usual points; programs earn `units` points
// per settled job. Their programs, inputs and outputs are kept for good (blobs.keep), so results can be read any time.

/** POST /api/admin/house {label, spec, max_parallel?, hours?, units?}: start a house order at once. */
function createHouse(body: any) {
  if (typeof body.label !== "string" || !/^[\w./-]{1,80}$/.test(body.label)) throw new HttpError(400, "label is 1..80 of letters, digits, . / _ -");
  let open: OpenSpec | null = null;
  let spec: object;
  let jobCount: number;
  if (body.spec?.kind === "world" || body.spec?.kind === "probe") {
    const h = asked(() => houseSpec(body.spec, 1_000_000));
    jobCount = h.inputs.length;
    spec = { ...h, inputs: undefined };
    open = h;
    if (body.units === undefined) body.units = houseUnits(h);
  } else if (isOpenKind(body.spec?.kind)) {
    open = asked(() => openSpec(body.spec, 1_000_000));
    open.program = checkProgram(open);
    checkInputs(open.kind, open.inputs);
    spec = { ...open, inputs: undefined };
    jobCount = open.inputs.length;
  } else {
    const sweep = asked(() => expandSpec(body.spec, 1_000_000));
    spec = sweep.spec;
    jobCount = sweep.jobs.length;
  }
  const maxParallel = body.max_parallel === undefined ? ORDERS.maxParallel : Number(body.max_parallel);
  if (!Number.isInteger(maxParallel) || maxParallel < 1 || maxParallel > 10_000) throw new HttpError(400, "max_parallel is 1..10000");
  const units = body.units === undefined ? 7.5 : Number(body.units);
  if (!(units >= 0 && units <= 1000)) throw new HttpError(400, "units is 0..1000 points per settled job");
  const hours = body.hours === undefined || body.hours === null ? null : Number(body.hours);
  if (hours !== null && !(hours > 0 && hours <= 24 * 365)) throw new HttpError(400, "hours is a positive number");
  const id = randomUUID();
  const now = Date.now();
  transaction(() => {
    // a house order has no payment: its tag is a negative number, outside the unpaid tags, and never matched
    db.prepare(`insert into orders (id, wallet, spec, jobs, bid_wei, budget_wei, tag, max_parallel, hours, status, created_at, expires_at, house, label, house_units)
      values (?, ?, ?, ?, '0', '0', ?, ?, ?, 'unpaid', ?, ?, 1, ?, ?)`)
      .run(id, ORDERS.payTo ?? "0x0000000000000000000000000000000000000000", JSON.stringify(spec), jobCount, -Math.floor(Math.random() * 1e12) - 1,
        maxParallel, hours, now, now, body.label, units);
    if (open) {
      addInputs(id, 0, open.inputs);
      for (const h of [open.program, ...new Set(open.inputs)]) if (h && h !== INDEX_INPUT) db.prepare("update blobs set keep = 1 where hash = ?").run(h);
    }
    start(orderRow(id)!, null);
  });
  console.log(`house order ${body.label}: ${jobCount} jobs`);
  return order(id);
}

/** POST /api/admin/house/:id/jobs {inputs} | {count}: more work for a house order (it stays open with keep_open). */
function addHouseJobs(id: string, body: any) {
  const o = orderRow(id);
  if (!o?.house) throw new HttpError(404, "no such house order");
  if (!isOpenKind(JSON.parse(o.spec).kind)) throw new HttpError(409, "brain sweeps, world runs and probes are fixed; start another house order");
  if (o.status !== "live") throw new HttpError(409, `the order has ${o.status === "done" ? "finished" : "ended"}; start another`);
  const count = body.count === undefined ? null : Number(body.count);
  const inputs: string[] = count !== null && Number.isInteger(count) && count >= 1 && count <= 100_000
    ? Array.from({ length: count }, () => INDEX_INPUT) : body.inputs;
  if (!Array.isArray(inputs) || !inputs.length || inputs.some((h) => typeof h !== "string" || !(BLOB_HASH.test(h) || h === INDEX_INPUT))) {
    throw new HttpError(400, "send inputs (upload sha256s) or count");
  }
  for (const h of new Set(inputs)) if (h !== INDEX_INPUT) needBlob(h);
  transaction(() => {
    const now = orderRow(id)!;
    addInputs(id, now.jobs, inputs);
    for (const h of new Set(inputs)) db.prepare("update blobs set keep = 1 where hash = ?").run(h);
    db.prepare("update orders set jobs = jobs + ? where id = ?").run(inputs.length, id);
    refill(id);
  });
  return order(id);
}

function stopHouse(id: string) {
  const o = orderRow(id);
  if (!o?.house) throw new HttpError(404, "no such house order");
  if (o.status !== "live") throw new HttpError(409, `the order is ${o.status}`);
  transaction(() => close(orderRow(id)!, "ended", "stopped"));
  return order(id);
}

/** GET /api/house: our own work and how far it's got. Public: the results are research anyone may read. */
const houseOrders = cached(10_000, (_: null) => ({
  orders: (db.prepare("select id from orders where house = 1 order by created_at desc limit 500").all() as { id: string }[]).map((r) => {
    const o = order(r.id);
    return { id: o.id, label: o.label, kind: o.kind, status: o.status, end_reason: o.end_reason, jobs: o.jobs, settled: o.settled, out: o.out, created_at: o.created_at, closed_at: o.closed_at };
  }),
}));
function houseOrdersView() {
  return houseOrders(null);
}

/**
 * GET /api/experiments: what our own research orders found, one summary each (src/experiments.ts). Worked out in the
 * background every 30 minutes from the settled results, reading a sample of the big ones, so a page view costs nothing.
 */
const SAMPLE = { world: 400, probe: 300 };
let experiments: { at: number; summaries: Summary[] } | null = null;
function computeExperiments(): void {
  const ref = reference;
  if (!ref) return;
  const orders = houseOrders(null).orders.filter((o) => o.label && !o.label.startsWith("mining/"))
    .sort((a, b) => a.created_at - b.created_at);
  const outputOf = (row: any): Buffer | null => (row.output?.hash && existsSync(blobPath(row.output.hash)) ? readFileSync(blobPath(row.output.hash)) : null);
  const worldRuns = (id: string) => orderResults(id, 0, SAMPLE.world).rows.map(outputOf).filter(Boolean).map((b) => JSON.parse(b!.toString()) as WorldRun);
  const summaries: Summary[] = [];
  const byLabel = new Map(orders.map((o) => [o.label, o]));
  for (const o of orders) {
    const before = summaries.length;
    try {
      const label = o.label as string;
      if (/learning-off/.test(label)) continue; // summarized with its learning-on twin
      if (o.kind === "connectome-sweep" || o.kind === "connectome") {
        const rows = orderResults(o.id).rows as unknown as SweepRow[];
        summaries.push(tuningSummary(label, rows, ref.outputs, ref.outputSizes, ref.dt));
      } else if (o.kind === "world" && /learning-on/.test(label)) {
        const twin = byLabel.get(label.replace("learning-on", "learning-off"));
        if (twin) {
          summaries.push(learningSummary(label.replace("learning-on", "learning"), worldRuns(o.id), worldRuns(twin.id)));
          // progress over both halves of the pair
          Object.assign(summaries[summaries.length - 1], { status: o.status === twin.status ? o.status : "live", jobs: o.jobs + twin.jobs, settled: o.settled + twin.settled, order: o.id });
          continue;
        }
      } else if (o.kind === "world") {
        summaries.push(worldSummary(label, worldRuns(o.id)));
      } else if (o.kind === "probe") {
        const spec = JSON.parse(orderRow(o.id)!.spec);
        const columns = (spec.params.record as string[]).map((set) => ref.recordSizes[set] ?? 0);
        const runs: ProbeRun[] = [];
        for (const row of orderResults(o.id, 0, SAMPLE.probe).rows as any[]) {
          const b = outputOf(row);
          if (!b) continue;
          runs.push({ condition: houseJob(spec, row.index).condition as string, steps: spec.params.steps, counts: new Uint16Array(b.buffer, b.byteOffset, b.length >> 1) });
        }
        summaries.push(encodingSummary(label, runs, columns, ref.dt));
      } else if (o.kind === "wasm" && /pi/.test(label)) {
        summaries.push(piSummary(label, orderResults(o.id).rows.map(outputOf).filter((b) => b?.length === 8).map((b) => b!.readBigUInt64LE(0))));
      } else if (o.kind === "wasm" && /tsp/.test(label)) {
        summaries.push(tspSummary(label, orderResults(o.id).rows.map(outputOf).filter((b) => b && b.length >= 4).map((b) => b!.readUInt32LE(0))));
      } else if (o.kind === "wasm" && /mandelbrot/.test(label)) {
        summaries.push(tilesSummary(label, o.settled, o.jobs));
      }
      // progress of the order the summary came from (for a learning pair, the learning-on half)
      if (summaries.length > before) Object.assign(summaries[summaries.length - 1], { status: o.status, jobs: o.jobs, settled: o.settled, order: o.id });
    } catch (err) {
      console.error(`experiment summary for ${o.label} failed:`, err);
    }
  }
  experiments = { at: Date.now(), summaries };
}
function experimentsView() {
  if (!experiments) computeExperiments();
  return { updated_at: experiments ? new Date(experiments.at).toISOString() : null, experiments: experiments?.summaries ?? [] };
}

/**
 * GET /api/mining: what the project's own mining has done. Jobs come from the mining/* house orders; what the
 * pools owe us comes from the bridge app (BRIDGE_URL), which reads the pools' public stats. Cached for a minute.
 */
const BRIDGE_URL = env("BRIDGE_URL", "https://flyai-bridge.fly.dev");
let miningCache: { at: number; pools: any } | null = null;
async function miningView() {
  if (!miningCache || Date.now() - miningCache.at > 60_000) {
    const pools = await fetch(`${BRIDGE_URL}/mining`, { signal: AbortSignal.timeout(15_000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => (Array.isArray(body?.coins) ? body : null))
      .catch(() => null);
    // a bridge that's away keeps the last good answer rather than blanking the page
    miningCache = { at: Date.now(), pools: pools ?? miningCache?.pools ?? null };
  }
  const jobs = new Map<string, { jobs: number; settled: number; live: boolean }>();
  for (const o of houseOrders(null).orders) {
    if (!o.label?.startsWith("mining/")) continue;
    const j = jobs.get(o.label) ?? { jobs: 0, settled: 0, live: false };
    jobs.set(o.label, { jobs: j.jobs + o.jobs, settled: j.settled + o.settled, live: j.live || o.status === "live" });
  }
  const coins = ((miningCache.pools?.coins ?? []) as any[]).map((c) => {
    const j = jobs.get(`mining/${c.algo}`) ?? jobs.get(`mining/${c.name}`);
    return { ...c, jobs_settled: j?.settled ?? 0, live: j?.live ?? false };
  });
  return { updated_at: miningCache.pools?.updated_at ?? null, coins, pools_reachable: !!miningCache.pools };
}

/** A settled program job as a result row. */
function programRow(p: any, s: { result: string; by: string }) {
  const r = JSON.parse(s.result);
  const out = (x: any) => (x.output ? { hash: x.output, size: x.size, url: `/api/blobs/${x.output}` } : null);
  return {
    index: p.index, input: p.input === INDEX_INPUT ? null : p.input, checked_by: s.by,
    output: out(r), error: r.error ?? null,
    answers: r.disputed ? r.disputed.map((a: any) => ({ output: out(a), error: a.error ?? null, miners: a.miners })) : undefined,
  };
}

// ---- static files ------------------------------------------------------------------------------------
// Locally the server serves the compute pages in the same layout Vercel does (mine/scripts/build-web.mjs):
// pages under /compute/, scripts as /compute/<repo path>.js, the site's CSS and logo under /assets/.
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".ts": "text/javascript", ".js": "text/javascript",
  ".json": "application/json", ".webp": "image/webp", ".md": "text/markdown; charset=utf-8",
};
const DOCS_ASSETS = fileURLToPath(new URL("../../docs/assets/", import.meta.url));
const stripped = new Map<string, { mtime: number; code: string }>();
/** "./x.ts" and "../y.ts" string literals: imports and new URL("./worker.ts", import.meta.url) */
const RELATIVE_TS = /(["'])(\.{1,2}\/[^"'\n]*?)\.ts\1/g;

/** Browsers get .ts sources as .js: types removed by Node's own stripper, relative imports renamed, no build step. */
function serveFile(res: ServerResponse, path: string, maxAge = 0): void {
  let mtime: number;
  try {
    mtime = statSync(path).mtimeMs;
  } catch {
    throw new HttpError(404, "not found");
  }
  const ext = path.slice(path.lastIndexOf("."));
  let body: string | Buffer;
  if (ext === ".ts") {
    const hit = stripped.get(path);
    body = hit && hit.mtime === mtime ? hit.code : stripTypeScriptTypes(readFileSync(path, "utf8"), { mode: "strip" }).replace(RELATIVE_TS, "$1$2.js$1");
    stripped.set(path, { mtime, code: body });
  } else body = readFileSync(path);
  res.writeHead(200, {
    "content-type": TYPES[ext] ?? "application/octet-stream",
    "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-cache",
    "x-content-type-options": "nosniff",
    ...CORS,
  });
  res.end(body);
}

async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const p = url.pathname;
  const loaded = () => {
    if (!reference) throw new HttpError(503, "server is loading the connectome, try again in a moment");
    return reference;
  };
  let m: RegExpExecArray | null;
  if (req.method !== "OPTIONS" && (p.startsWith("/api/roulette/") || p.startsWith("/api/balance/") || p === "/api/admin/roulette")) {
    if (await roulette.route(req, res, url)) return;
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204, { ...CORS, "access-control-allow-methods": "GET, POST" });
    return void res.end();
  }
  if (req.method === "GET") {
    const oldPage = /^\/(stake|claim|leaderboard|results|connect|bench|jobs)$/.exec(p);
    if (p === "/" || p === "/compute" || oldPage) {
      res.writeHead(302, { location: `/compute/${oldPage?.[1] ?? ""}` });
      return void res.end();
    }
    if (p === "/compute/") return serveFile(res, join(ROOT, "web", "index.html"));
    if ((m = /^\/compute\/(stake|claim|leaderboard|results|connect|bench|jobs)$/.exec(p))) return serveFile(res, join(ROOT, "web", `${m[1]}.html`));
    if (p === "/compute/mine/web/compute.css") return serveFile(res, join(ROOT, "web", "compute.css"));
    if (p === "/compute/compute-api.md") return serveFile(res, join(ROOT, "web", "compute-api.md"));
    if ((m = /^\/compute\/mine\/web\/([\w-]+(?:\.worker)?)\.js$/.exec(p))) return serveFile(res, join(ROOT, "web", `${m[1]}.ts`));
    // the wagmi bundle, when built locally (cd wallet && npm ci && npm run build); Vercel builds its own
    if ((m = /^\/compute\/mine\/web\/wallet\/((?:chunks\/)?[\w.-]+\.js)$/.exec(p))) return serveFile(res, join(ROOT, "wallet", "dist", m[1]));
    if ((m = /^\/compute\/mine\/src\/(model|runner|fixed|wasmcheck|probe)\.js$/.exec(p))) return serveFile(res, join(ROOT, "src", `${m[1]}.ts`));
    if ((m = /^\/compute\/world\/src\/(connectome|rng|sim|brain|eyes|senses|wiring|genome|social|datalog)\.js$/.exec(p))) return serveFile(res, join(WORLD_SRC, `${m[1]}.ts`));
    if ((m = /^\/assets\/(site\.css|site\.js|nav\.js|logo\.webp)$/.exec(p))) return serveFile(res, join(DOCS_ASSETS, m[1]), 3600);
    // the site's languages (docs/assets/i18n/): the runtime and its strings, and the runtime again where the
    // compute pages import it from (mine/web/i18n.ts, at its repo path as build-web lays it out)
    if ((m = /^\/assets\/i18n\/((?:[\w-]+\/)?[\w-]+\.(?:js|json))$/.exec(p))) return serveFile(res, join(DOCS_ASSETS, "i18n", m[1]));
    if (p === "/compute/docs/assets/i18n/i18n.js") return serveFile(res, join(DOCS_ASSETS, "i18n", "i18n.js"));
    if (p === "/api/stake-config") return send(res, 200, stakeConfig());
    if (p === "/api/session") return send(res, 200, sessionOf(req));
    if (p === "/api/month") {
      const m = url.searchParams.get("month") ?? thisMonth();
      if (!/^\d{4}-\d{2}$/.test(m)) throw new HttpError(400, "month is YYYY-MM");
      return send(res, 200, month(m));
    }
    if (p === "/api/claims") return send(res, 200, claimsFor(url.searchParams.get("wallet") ?? ""));
    if (p === "/api/orders/config") return send(res, 200, orderConfigView());
    if (p === "/api/price") return send(res, 200, { flyai_usd: (await flyaiPrice()).usd, sources: USDC.fixedPrice ? "fixed" : "lower of GeckoTerminal and DexScreener" });
    if ((m = /^\/api\/blobs\/([0-9a-f]{64})$/.exec(p))) return serveBlob(res, m[1]);
    if (p === "/api/balance") return send(res, 200, balanceView(url.searchParams.get("wallet") ?? ""));
    if (p === "/api/orders") return send(res, 200, ordersOf(url.searchParams.get("wallet") ?? ""));
    if ((m = /^\/api\/orders\/([0-9a-f-]{36})$/.exec(p))) return send(res, 200, order(m[1]));
    if ((m = /^\/api\/orders\/([0-9a-f-]{36})\/card$/.exec(p))) return send(res, 200, await cardStatus(m[1]));
    if ((m = /^\/api\/orders\/([0-9a-f-]{36})\/results$/.exec(p))) {
      if (url.searchParams.get("format") === "csv") return orderCsv(res, m[1]);
      const after = Number(url.searchParams.get("after") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? 5000);
      if (!Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 5000) throw new HttpError(400, "after is a seq, limit is 1..5000");
      return send(res, 200, orderResults(m[1], after, limit));
    }
    if ((m = /^\/api\/orders\/([0-9a-f-]{36})\/stream$/.exec(p))) {
      const after = Number(url.searchParams.get("after") ?? 0);
      if (!Number.isSafeInteger(after) || after < 0) throw new HttpError(400, "after is a seq");
      return openStream(req, res, m[1], after);
    }
    if (p === "/api/admin/orders") {
      adminOnly(req);
      return send(res, 200, adminOrders());
    }
    if (p === "/api/admin/relayer") {
      adminOnly(req);
      return send(res, 200, relayer ? { address: relayer.address, chain: USDC.chain_name, gas_wei: (await relayer.balance()).toString() } : { address: null });
    }
    if (p === "/api/house") return send(res, 200, houseOrdersView());
    if (p === "/api/mining") return send(res, 200, await miningView());
    if (p === "/api/experiments") return send(res, 200, experimentsView());
    if ((m = /^\/connectome\/(brain\.json|meta\.bin|weights\.\d+\.bin)$/.exec(p))) return serveFile(res, join(CONNECTOME_DIR, m[1]), 3600);
    if (p === "/api/model") return send(res, 200, loaded().model);
    if (p === "/api/me") return send(res, 200, me(minerOf(req)));
    if (p === "/api/stats") return send(res, 200, stats(null));
    if (p === "/api/results") {
      loaded();
      return send(res, 200, results());
    }
    if (p === "/api/epoch") {
      const day = url.searchParams.get("day") ?? today();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new HttpError(400, "day is YYYY-MM-DD");
      return send(res, 200, epoch(day));
    }
  }
  if (req.method === "POST") {
    if (p === "/api/register") return send(res, 200, register(req, await readJson(req)));
    if (p === "/api/orders/quote") return send(res, 200, quote(await readJson(req, 4_000_000)));
    if (p === "/api/orders") return send(res, 200, await createOrder(req, await readJson(req, 4_000_000)));
    if ((m = /^\/api\/orders\/([0-9a-f-]{36})\/pay$/.exec(p))) return send(res, 200, await payOrder(m[1], await readJson(req)));
    if ((m = /^\/api\/orders\/([0-9a-f-]{36})\/usdc$/.exec(p))) return send(res, 200, await usdcQuote(m[1]));
    if ((m = /^\/api\/orders\/([0-9a-f-]{36})\/card$/.exec(p))) return send(res, 200, await cardCheckout(req, m[1]));
    if ((m = /^\/api\/orders\/([0-9a-f-]{36})\/usdc\/authorize$/.exec(p))) return send(res, 200, await authorizeUsdc(m[1], await readJson(req)));
    if ((m = /^\/api\/orders\/([0-9a-f-]{36})\/intent$/.exec(p))) return send(res, 200, intent(m[1], await readJson(req)));
    if ((m = /^\/api\/orders\/([0-9a-f-]{36})\/(fund|stop)$/.exec(p))) return send(res, 200, signedAction(m[1], m[2] as "fund" | "stop", await readJson(req), req));
    if ((m = /^\/api\/orders\/([0-9a-f-]{36})\/jobs$/.exec(p))) return send(res, 200, appendJobs(req, m[1], await readJson(req, 4_000_000)));
    if (p === "/api/blobs") return send(res, 200, await upload(req));
    if (p === "/api/admin/house") {
      adminOnly(req);
      return send(res, 200, createHouse(await readJson(req, 4_000_000)));
    }
    if ((m = /^\/api\/admin\/house\/([0-9a-f-]{36})\/jobs$/.exec(p))) {
      adminOnly(req);
      return send(res, 200, addHouseJobs(m[1], await readJson(req, 4_000_000)));
    }
    if ((m = /^\/api\/admin\/house\/([0-9a-f-]{36})\/stop$/.exec(p))) {
      adminOnly(req);
      return send(res, 200, stopHouse(m[1]));
    }
    if (p === "/api/admin/withdraw") {
      adminOnly(req);
      return send(res, 200, withdraw(await readJson(req)));
    }
    if (p === "/api/link") return send(res, 200, link(req, minerOf(req)));
    if (p === "/api/auth/nonce") return send(res, 200, nonceFor(req, await readJson(req)));
    if (p === "/api/session/nonce") return send(res, 200, sessionNonce(req, await readJson(req)));
    if (p === "/api/session") return send(res, 200, startSession(await readJson(req)));
    if (p === "/api/session/link") return send(res, 200, linkBySession(req, await readJson(req)));
    if (p === "/api/session/end") {
      const token = /^[0-9a-f]{64}$/.exec(String(req.headers["x-flyai-session"] ?? ""))?.[0];
      if (token) db.prepare("delete from sessions where token_hash = ?").run(sha256(token));
      return send(res, 200, { ended: true });
    }
    if (p === "/api/auth/verify") return send(res, 200, verifySignIn(await readJson(req)));
    if (p === "/api/admin/announce") {
      adminOnly(req);
      const body = await readJson(req);
      if (typeof body.month !== "string" || !/^\d{4}-\d{2}$/.test(body.month)) throw new HttpError(400, "month is YYYY-MM");
      if (!("pool" in body)) throw new HttpError(400, "pool is a number of tokens, or null to withdraw the announcement");
      return send(res, 200, announce(body.month, body.pool));
    }
    if (p === "/api/admin/snapshot") {
      adminOnly(req);
      const body = await readJson(req);
      if (typeof body.month !== "string" || !/^\d{4}-\d{2}$/.test(body.month)) throw new HttpError(400, "month is YYYY-MM");
      return send(res, 200, snapshot(body.month, String(body.pool ?? "")));
    }
    if (p === "/api/claim") {
      const miner = minerOf(req);
      loaded();
      const body = await readJson(req);
      const want = body.count === undefined ? 1 : Number(body.count);
      if (!Number.isInteger(want) || want < 1 || want > 32) throw new HttpError(400, "count is 1..32");
      const kinds = body.kinds === undefined ? ["connectome"] : body.kinds;
      if (!Array.isArray(kinds) || !kinds.length || kinds.some((k: unknown) => !KINDS.includes(k as string))) throw new HttpError(400, `kinds are some of ${KINDS.join(", ")}`);
      const openMax = body.open_max === undefined ? 1 : Number(body.open_max);
      if (!Number.isInteger(openMax) || openMax < 0 || openMax > 32) throw new HttpError(400, "open_max is 0..32");
      const jobs = claim(miner, want, kinds, openMax);
      return jobs.length ? send(res, 200, { jobs }) : send(res, 204, null);
    }
    if (p === "/api/release") {
      const miner = minerOf(req);
      return send(res, 200, release(miner, (await readJson(req)).jobs));
    }
    if (p === "/api/submit") {
      const miner = minerOf(req);
      loaded();
      const body = await readJson(req, (Math.ceil(MAX_OUTPUT_BYTES * 1.4) + 4096) * (MAX_JOBS + 1));
      // a whole GPU batch in one request: 32 round trips over the Atlantic cost more than the work itself
      if (Array.isArray(body.results)) {
        if (body.results.length > MAX_JOBS) throw new HttpError(400, `results holds at most ${MAX_JOBS} answers`);
        return send(res, 200, {
          results: body.results.map((r: any) => {
            try {
              return { job: String(r?.job ?? ""), ...submit(miner, r) };
            } catch (err) {
              return { job: String(r?.job ?? ""), status: "error", error: err instanceof HttpError ? err.message : "failed", code: err instanceof HttpError ? err.status : 500 };
            }
          }),
        });
      }
      return send(res, 200, submit(miner, body));
    }
  }
  throw new HttpError(404, "not found");
}

// jobs a verifier was working on when the server stopped have no assignment to expire
db.prepare(`update tasks set state = 'open' where state = 'out' and truth is null
  and not exists (select 1 from assignments where task = tasks.id and status = 'issued')`).run();
topUp();
// Fly Roulette bets (src/roulette.ts): the same ledger, sign-in and chain as compute orders
const roulette = createRoulette({
  db, transaction, book, balanceOf, adminOnly, HttpError, toWei, fromWei, send, readJson,
  sessionWallet: (req) => sessionOf(req).wallet,
  transfersIn: (tx) => {
    if (!ORDERS.payTo) throw new HttpError(503, "deposits aren't open yet");
    return transfersIn(CLAIMS.rpc, tx, ORDERS.token, ORDERS.payTo);
  },
  connectomeDir: CONNECTOME_DIR,
  env: process.env,
});
roulette.resume();
// card checkouts still open from the last three hours: a buyer who closed the tab still gets their order started
setInterval(() => {
  if (!cdp) return;
  const open = db.prepare("select order_id from card_checkouts where state = 'open' and created_at > ?").all(Date.now() - 3 * 3_600_000) as { order_id: string }[];
  void (async () => { for (const { order_id } of open) await checkCard(order_id).catch(() => {}); })();
}, 30_000).unref();
setInterval(() => {
  expire();
  topUp();
  // frees their tags; a late payment is still accepted (payOrder)
  db.prepare("update orders set status = 'expired' where status = 'unpaid' and expires_at < ?").run(Date.now());
  // time limits, and anything a missed refill left waiting
  for (const { id } of db.prepare("select id from orders where status = 'live'").all() as { id: string }[]) transaction(() => refill(id));
  if (Date.now() - lastGc > 3_600_000) collectBlobs();
  if (Date.now() - lastPrune > 3_600_000) void pruneScreen();
  pump(); // paid jobs waiting on a second answer get the idle verifiers
}, 15_000).unref();
setInterval(() => void deliverWebhooks().catch((err) => console.error("webhooks:", err)), 5_000).unref();
if (STAKING.contract) {
  void sampleActiveStakes();
  setInterval(() => void sampleActiveStakes(), STAKING.sampleMs).unref();
  // the research summaries: once the connectome is loaded, then every half hour
  setTimeout(() => computeExperiments(), 90_000).unref();
  setInterval(() => computeExperiments(), 30 * 60_000).unref();
}

const server = createServer(async (req, res) => {
  try {
    await route(req, res, new URL(req.url ?? "/", "http://local"));
  } catch (err) {
    if (err instanceof HttpError) return send(res, err.status, { error: err.message });
    console.error(err);
    send(res, 500, { error: "internal error" });
  }
});
// a job takes seconds between claim and submit; Node's 5 s default closes the idle connection just as
// the miner reuses it
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.listen(PORT);
