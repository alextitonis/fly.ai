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

type Handler = (req: IncomingMessage, res: ServerResponse, url: URL) => Promise<boolean>;
let handler: Handler | null = null;

/** the closed test: the dev wallet and the user's personal wallet unless FLYVERSE_WALLETS says otherwise */
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
      dailyUsd: Number(process.env.FLYVERSE_DAILY_USD ?? 3),
      createsPerDay: Number(process.env.FLYVERSE_CREATES_PER_DAY ?? 5),
      testers,
      notify: deps.notify,
      gate: async (req: IncomingMessage) => {
        const s = await deps.sessionWallet(req);
        if (!s) return { ok: false, why: "Sign in on fly.ai first" };
        const w = s.wallet.toLowerCase();
        if (wallets.includes(w)) return { ok: true, wallet: w, team: true };
        return (await isAmb(w)) ? { ok: true, wallet: w } : { ok: false, wallet: w, why: "This wallet isn't on the test list" };
      },
      log: (msg: string) => console.log(msg),
    });
    console.log(`flyverse: on for ${wallets.length} team wallet(s) + testers (database)${ambassadors ? " + ambassadors" : ""}, data in ${data}`);
  } catch (e) {
    console.log(`flyverse: off (${e instanceof Error ? e.message.slice(0, 120) : e})`);
  }
}

export function flyverseRoute(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  return handler && url.pathname.startsWith("/api/fv/") ? handler(req, res, url) : Promise.resolve(false);
}
