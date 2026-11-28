/**
 * Flyverse Maker closed test (2026-11-20): the game maker's server calls (/api/fv/*: AI builder, textures,
 * multiplayer matchmaker). The code lives in the separate flyverse/ folder that deploy.sh ships next to mine;
 * without it (or with FLYVERSE_WALLETS=off) these routes are simply off and answer 404 like any unknown path.
 * Only the listed wallets and the ambassadors (badge #12, FLYVERSE_AMBASSADORS=off to drop them) get in, signed in
 * on fly.ai; textures and spend are kept in /data/flyverse.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import { makeStakeSigner } from "./stakes-sign.ts";

type Handler = (req: IncomingMessage, res: ServerResponse, url: URL) => Promise<boolean>;
let handler: Handler | null = null;

/** the closed test: the dev wallet and the user's personal wallet unless FLYVERSE_WALLETS says otherwise */
// FlyTill on Robinhood Chain (flytrade/contracts/src/FlyTill.sol), and when it started
const DEFAULT_TILL = "0xC969B45268bD7c81ed3e33044817aB1A3c33faC9", DEFAULT_TILL_SINCE = "2026-11-22T20:21:00Z";
const TILL = /^0x[0-9a-fA-F]{40}$/.exec(process.env.FLYVERSE_TILL ?? DEFAULT_TILL)?.[0] ?? "";
// FlyStakes (bounties, tournaments, PvP bets; flytrade/contracts/src/FlyStakes.sol): on when FLYVERSE_STAKES (the proxy)
// and FLYVERSE_STAKES_KEY (the payout signer, the contract's `signer`) are both set
const STAKES = /^0x[0-9a-fA-F]{40}$/.exec(process.env.FLYVERSE_STAKES ?? "")?.[0] ?? "";
const DEFAULT_WALLETS = "0x625862521777e19ad54ce6c7abed9ca54d6589ea,0xae92d64584e7f8e54995c362eaa8d7949fac8b1b";
/** the first early testers, put in Flyverse's database on start; more are added from the page by the team
 * (FLYVERSE_TESTERS replaces this seed). They get an early-tester badge + some XP later. */
const DEFAULT_TESTERS = "0xe3b79b727a642496cd2a7ac3ed7ea2899dae7a84,0x672f28a7c84528e277623a70c90600d6efca4362,0x9aae1f57700e3202cddeb6b7aa761f9b175e5983,0x9150cd0c6f080065f0188116e43cfd51913af278,0xc8e695b30ef512ae634007efa89a75e1421e3055";

export async function startFlyverse(deps: {
  sessionWallet: (req: IncomingMessage) => Promise<{ wallet: string } | null>;
  key: () => string;
  /** ambassadors (badge #12) are in the test too */
  isAmbassador?: (wallet: string) => Promise<boolean>;
  /** a note in someone's site 🔔 */
  notify?: (wallet: string, text: string, href: string) => Promise<void>;
  /** Flyverse quests and milestones as fly.ai XP (source "quest"), and the Flyverse badges (#14-16) */
  awardXp?: (wallet: string, xp: number, ref: string) => Promise<void>;
  /** fly.ai's rule for earning XP (10k FLYAI or a Trader Fly) */
  xpEligible?: (wallet: string) => Promise<boolean>;
  /** FLYAI in all (wallet + staked + locked) and staked (+ locked), whole tokens */
  holding?: (wallet: string) => Promise<{ total: number; staked: number }>;
  earnBadge?: (wallet: string, badge: string) => Promise<void>;
  /** the weekly story: replies under an episode's X post, and X handles -> linked wallets (mine.x_links) */
  xReplies?: (postId: string) => Promise<{ id: string; author: string; text: string; at: number }[]>;
  xWallets?: (handles: string[]) => Promise<Map<string, string>>;
}) {
  const list = (process.env.FLYVERSE_WALLETS ?? DEFAULT_WALLETS).toLowerCase();
  if (list === "off") return;
  const wallets = list.split(",").map((s) => s.trim()).filter(Boolean);
  const testers = (process.env.FLYVERSE_TESTERS ?? DEFAULT_TESTERS).toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  const ambassadors = process.env.FLYVERSE_AMBASSADORS !== "off" && deps.isAmbassador ? deps.isAmbassador : null;
  // badge lookups are cached a few minutes (every Flyverse call checks the gate)
  const ambCache = new Map<string, { ok: boolean; at: number }>();
  const isAmb = async (w: string) => {
    if (!ambassadors) return false;
    const c = ambCache.get(w);
    if (c && Date.now() - c.at < 5 * 60_000) return c.ok;
    const ok = await ambassadors(w).catch(() => c?.ok ?? false);
    ambCache.set(w, { ok, at: Date.now() });
    return ok;
  };
  const open = process.env.FLYVERSE_PUBLIC === "1";
  const buildRule = (["holders", "all", "listed"] as const).find((r) => r === process.env.FLYVERSE_BUILD) ?? "holders";
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../flyverse");
  const data = process.env.FLYVERSE_DATA ?? (process.env.MINE_DB ? path.join(path.dirname(process.env.MINE_DB), "flyverse") : path.join(root, "data", "mine"));
  const spec = path.join(root, "server", "routes.ts");
  try {
    const m = await import(/* not in the public repo */ new URL("file:///" + spec.replace(/\\/g, "/").replace(/^\//, "")).href);
    handler = m.createFlyverse({
      key: deps.key,
      texDir: path.join(data, "textures"),
      texSeedDir: path.join(root, "data", "textures"),
      modelsCatalog: path.join(root, "public", "models", "catalog.json"),
      spendFile: path.join(data, "spend.json"),
      dbFile: path.join(data, "fv.db"),
      // AI budget for everyone together, and the free new games a wallet gets a day (more can be bought)
      dailyUsd: Number(process.env.FLYVERSE_DAILY_USD ?? 15),
      createsPerWeek: Number(process.env.FLYVERSE_CREATES_PER_WEEK ?? 2),
      changesPerDay: Number(process.env.FLYVERSE_CHANGES_PER_DAY ?? 15),
      // open to everyone to play (FLYVERSE_PUBLIC=1); who builds: FLYVERSE_BUILD = holders (10k FLYAI or a fly, the
      // default), all, or listed (team, testers, ambassadors)
      buildRule: open ? buildRule : undefined,
      // bought builds and changes are paid to the dev wallet (the first team wallet)
      payTo: process.env.FLYVERSE_PAY_TO ?? wallets[0],
      // unlocks and skins go through the FlyTill contract, which splits off fly.ai's cut (not set: straight to the creator)
      stakes: STAKES && process.env.FLYVERSE_STAKES_KEY ? { address: STAKES, signer: makeStakeSigner(process.env.FLYVERSE_STAKES_KEY, STAKES), bps: Number(process.env.FLYVERSE_STAKES_BPS ?? 1000), maxPool: Number(process.env.FLYVERSE_STAKES_MAX ?? 5_000_000) } : undefined,
      till: TILL ? { address: TILL, bps: Number(process.env.FLYVERSE_TILL_BPS ?? 1000), since: Date.parse(process.env.FLYVERSE_TILL_SINCE ?? DEFAULT_TILL_SINCE) || 0 } : undefined,
      xpEligible: deps.xpEligible,
      // building, when open to holders: 200k FLYAI held (staked and locked count); 1M staked: a free new game a day
      holding: deps.holding,
      testers,
      teamWallets: wallets,
      notify: deps.notify,
      awardXp: deps.awardXp,
      earnBadge: deps.earnBadge,
      xReplies: deps.xReplies,
      xWallets: deps.xWallets,
      // the early-tester badge is handed out while the test is closed (never once it's open)
      testerBadge: !open && process.env.FLYVERSE_TESTER_BADGE !== "off",
      gate: async (req: IncomingMessage) => {
        const s = await deps.sessionWallet(req);
        if (!s) return open ? { ok: true, anon: true } : { ok: false, why: "Sign in on fly.ai first" };
        const w = s.wallet.toLowerCase();
        if (wallets.includes(w)) return { ok: true, wallet: w, team: true };
        if (open) return { ok: true, wallet: w, listed: await isAmb(w) };
        return (await isAmb(w)) ? { ok: true, wallet: w } : { ok: false, wallet: w, why: "This wallet isn't on the test list" };
      },
      log: (msg: string) => console.log(msg),
    });
    if (open) console.log(`flyverse: OPEN to everyone to play; building: ${buildRule}`);
    console.log(`flyverse: stakes ${STAKES && process.env.FLYVERSE_STAKES_KEY ? "ON at " + STAKES : "off"}`);
    console.log(`flyverse: on for ${wallets.length} team wallet(s) + testers (database)${ambassadors ? " + ambassadors" : ""}, data in ${data}`);
  } catch (e) {
    console.log(`flyverse: off (${e instanceof Error ? e.message.slice(0, 120) : e})`);
  }
}

export function flyverseRoute(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  return handler && url.pathname.startsWith("/api/fv/") ? handler(req, res, url) : Promise.resolve(false);
}
