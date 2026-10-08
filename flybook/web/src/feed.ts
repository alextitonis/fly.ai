import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { BoardRow } from "./badges";
import type { Action } from "./words";

export type Patch = { id: string; name: string; blurb: string; event_mix: Record<string, number> };
export type FlySettings = {
  senses: Record<string, number>; temperament: Record<string, number>; dials: Record<string, string>;
};
export type Fly = Partial<FlySettings> & {
  id: string; name: string; color: string; patch_id: string; owner: string | null;
  active?: boolean; created_at?: string;
  x?: number | null; y?: number | null; heading?: number | null;   // position in its patch (a 1 x 1 square)
  elo?: number; duels?: number; wins?: number; losses?: number; draws?: number;
  parents?: string[]; generation?: number;
  auto_born?: boolean;   // born from automatic mating; doesn't count toward the owner's cap
  gift?: boolean;        // hatched from a merch thank-you code; doesn't count toward the owner's cap
};

/** What differs from a standard fly, e.g. ["eyes 1.5x", "escape off"]. */
export function tuning(f: Partial<FlySettings>): string[] {
  return [
    ...Object.entries(f.senses ?? {}).map(([k, v]) => `${k} ${v}×`),
    ...Object.entries(f.temperament ?? {}).map(([k, v]) => `${k} ${v}×`),
    ...Object.entries(f.dials ?? {}).map(([k, v]) => `${k} ${v}`),
  ];
}
export type Neuron = { type: string; z: number };
/** What a fly's behaviour neurons did during a post's event: spikes per group per step (voice.ts plays it). */
export type Trace = { step_ms: number; groups: string[]; counts: number[][] };
export type Cause = { channel: "loom" | "target" | "sound" | "bump"; from_fly_id: string; strength: number };
export type Post = {
  id: number; tick_id: number; fly_id: string; patch_id: string;
  word: string; confidence: number; truth: string;
  correct: boolean | null;                                   // null when no word was read
  kind: "sense" | "misread" | "hallucination" | "action";
  actions: Action[];
  poke_id: number | null;
  cause: Cause | null;                                       // set when a neighbour's brain output is what happened
  wing_hz: number | null; neurons: Neuron[]; created_at: string;
  likes?: number;       // human likes (boards count only holders' likes)
  comments?: number;    // comment count
  caption?: string | null;   // the owner's caption, always shown as human-written
  has_voice?: boolean;       // the post has a trace to play
  trace?: Trace | null;      // only inline on the demo feed and fresh realtime posts; fetched on play otherwise
};
export type Poke = {
  id: number; patch_id: string; stimulus: string; created_at: string; consumed_at: string | null; tick_id: number | null;
  x: number | null; y: number | null;
};
/** One patch's replay: per frame, per fly [x, y, heading, flags (1 jump, 2 wings, 4 grooming)]. */
export type Replay = {
  flies: string[];
  frames: number[][][];
  links: { from: string; to: string; channel: string; step: number }[];
  event: { stimulus: string; x?: number; y?: number; poke_id: number | null; fly_id: string | null };
};
export type Tick = {
  id: number; started_at: string; finished_at: string | null; flies: number; posts: number;
  translator: { version: string; precision: Record<string, number>; recall: Record<string, number>; postable: string[] };
  replay?: Record<string, Replay> | null;
};
export type Comment = { id: number; post_id: number; user_id: string; wallet_short: string; body: string; created_at: string };
export type Duel = {
  id: number; kind: "quickdraw" | "stare"; a_fly: string; b_fly: string; requested_by: string | null;
  status: "pending" | "done" | "cancelled"; winner: string | null; a_step: number | null; b_step: number | null;
  a_elo: number | null; b_elo: number | null; delta: number | null; replay: Replay | null; created_at: string; done_at: string | null;
};
/** Automatic mating between two owners' flies (worker/mating.py). */
export type Mating = {
  id: number; a_fly: string | null; b_fly: string | null; child: string | null; owner: string | null;
  trigger: "brain" | "matched"; created_at: string;
};
export type ChallengeRow = {
  challenge: "calm" | "alarm" | "sharp" | "loved"; fly_id: string; name: string; color: string; house: boolean;
  owner_wallet: string | null; score: number; detail: string;
};
export type Snapshot = { patches: Patch[]; flies: Fly[]; posts: Post[]; tick: Tick | null; live: boolean };
/** An AI image meme made from one of a fly's posts (worker/memes.py). likes and likes_week count holders' likes. */
export type Meme = {
  id: number; user_id: string; fly_id: string; post_id: number | null; style: string; idea: string | null;
  top_text: string; bottom_text: string; image_path: string; created_at: string;
  likes?: number; likes_week?: number; likes_all?: number;
};

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const db: SupabaseClient | null = url && key ? createClient(url, key) : null;
export const BASE = import.meta.env.BASE_URL;
export const memeImage = (m: Pick<Meme, "image_path">) => (url ? `${url}/storage/v1/object/public/memes/${m.image_path}` : "");

/** Memes, newest first, with like counts; one fly's (flyId) or one person's (userId) when given. */
export async function loadMemes(opts: { limit?: number; flyId?: string; userId?: string } = {}): Promise<Meme[]> {
  if (!db) return [];
  let q = db.from("meme_board").select("*").order("id", { ascending: false }).limit(opts.limit ?? 40);
  if (opts.flyId) q = q.eq("fly_id", opts.flyId);
  if (opts.userId) q = q.eq("user_id", opts.userId);
  const { data } = await q;
  return (data ?? []) as Meme[];
}

/** The memes this user has liked. */
export async function myMemeLikes(userId: string): Promise<Set<number>> {
  if (!db) return new Set();
  const { data } = await db.from("meme_likes").select("meme_id").eq("user_id", userId).limit(1000);
  return new Set((data ?? []).map((r) => r.meme_id as number));
}

const FLY_COLUMNS = "id,name,color,patch_id,owner,active,created_at,senses,temperament,dials,x,y,heading,elo,duels,wins,losses,draws,parents,generation,auto_born,gift";
// every post column except the trace (fetched when someone presses play); voice_ms only says whether there is one
const POST_COLUMNS = "id,tick_id,fly_id,patch_id,word,confidence,truth,correct,wing_hz,neurons,created_at,kind,actions,poke_id,cause,"
  + "voice_ms:trace->step_ms,likes(count),comments(count),captions(body)";

type RawPost = Omit<Post, "likes" | "comments"> & {
  likes: { count: number }[]; comments: { count: number }[]; captions: { body: string } | { body: string }[] | null;
  voice_ms?: number | null;
};
const withCounts = (p: RawPost): Post => {
  const caption = Array.isArray(p.captions) ? p.captions[0]?.body : p.captions?.body;
  const { voice_ms, captions: _captions, ...rest } = p;
  return {
    ...rest, actions: p.actions ?? [], cause: p.cause ?? null,
    likes: p.likes?.[0]?.count ?? 0, comments: p.comments?.[0]?.count ?? 0, caption: caption ?? null,
    has_voice: voice_ms != null || !!p.trace,
  };
};

export async function load(limit = 200): Promise<Snapshot> {
  if (!db) {
    const res = await fetch(`${BASE}demo-feed.json`);
    if (!res.ok) throw new Error("No database configured and no demo-feed.json found.");
    const d = await res.json();
    const posts = [...(d.posts as Post[])].sort((a, b) => b.id - a.id).slice(0, limit).map((p) => ({ ...p, has_voice: !!p.trace }));
    const ticks = (d.ticks as Tick[]).filter((t) => t.finished_at);
    return { patches: d.patches, flies: d.flies, posts, tick: ticks.at(-1) ?? null, live: false };
  }
  const [patches, flies, posts, ticks] = await Promise.all([
    db.from("patches").select("*"),
    db.from("flies").select(FLY_COLUMNS),
    db.from("posts").select(POST_COLUMNS).order("id", { ascending: false }).limit(limit),
    db.from("ticks").select("id,started_at,finished_at,flies,posts,translator").not("finished_at", "is", null)
      .order("id", { ascending: false }).limit(1),
  ]);
  for (const r of [patches, flies, posts, ticks]) if (r.error) throw r.error;
  return {
    patches: patches.data as Patch[], flies: flies.data as Fly[],
    posts: (posts.data as unknown as RawPost[]).map(withCounts),
    tick: (ticks.data as Tick[])[0] ?? null, live: true,
  };
}

/** The fly market (worker/market.py): real Robinhood Chain token prices, paper USDG (the eth columns hold dollars). */
export type Coin = {
  symbol: string; name: string; kind: "real" | "meme" | "fly"; price: number; regime: string;
  category?: "major" | "meme" | "stock" | null; address?: string | null;   // real Robinhood Chain tokens (prices.py)
};
/** A coin a fly launched itself (worker/launches.py): a small pool its creator seeded, moved by every buy and sell. */
export type FlyCoin = {
  symbol: string; name: string; tagline: string | null; persona: string | null; image_path: string | null;
  price: number; launch_price: number | null; supply: number | null; pool_eth: number | null; status: "live" | "dead";
  launched_at: string | null; creator: string | null; creator_name: string | null; creator_color: string | null;
  creator_owner: string | null; market_cap: number | null; since_launch: number | null; holders: number;
};
/** Launches, shills, FUD, buybacks and dumps: next round they reach other flies' senses through their relationships. */
export type MarketSocial = {
  id: number; round_id: number | null; fly_id: string | null; kind: "launch" | "shill" | "fud" | "buyback" | "dump";
  symbol: string; reach: number; created_at: string;
  detail: { tagline?: string; persona?: string; number?: number; creator?: string | null; bond?: string | null; own?: boolean; eth?: number };
};
/** Live fly merch: each design with how many items sold, and its products in the shop. */
export type MerchItem = {
  id: number; fly_id: string; style: string; idea: string | null; preview_path: string; live_at: string; sold: number;
  products: { kind: string; url: string | null; image_url: string | null; price: number | null }[];
};
export const merchImage = (path: string) => (url ? `${url}/storage/v1/object/public/merch/${path}` : "");
export async function loadMerch(limit = 60): Promise<MerchItem[]> {
  if (!db) return [];
  const { data } = await db.from("merch_board").select("*").order("live_at", { ascending: false }).limit(limit);
  const rows = (data ?? []) as Omit<MerchItem, "products">[];
  if (!rows.length) return [];
  const { data: products } = await db.from("merch_products").select("design_id,kind,url,image_url,price")
    .in("design_id", rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, products: (products ?? []).filter((p) => p.design_id === r.id) }));
}

/** Items sold per live design this month, and Fly of the month winners (newest first). */
export type MerchMonthRow = { id: number; fly_id: string; preview_path: string; sold: number };
export type MerchAward = { month: string; design_id: number; fly_id: string; sold: number; points: number };
export async function loadMerchMonth(): Promise<MerchMonthRow[]> {
  if (!db) return [];
  const { data } = await db.from("merch_month").select("*").order("sold", { ascending: false }).limit(20);
  return (data ?? []) as MerchMonthRow[];
}
export async function loadMerchAwards(): Promise<MerchAward[]> {
  if (!db) return [];
  const { data } = await db.from("merch_awards").select("month,design_id,fly_id,sold,points").order("month", { ascending: false }).limit(24);
  return (data ?? []) as MerchAward[];
}

export const coinImage = (path: string | null) => (url && path ? `${url}/storage/v1/object/public/coins/${path}` : "");

/** The latest launches, shills, FUD, buybacks and dumps, newest first (the main feed shows them too). */
export async function loadSocial(limit = 60): Promise<MarketSocial[]> {
  if (!db) return [];
  const { data } = await db.from("market_social").select("*").order("id", { ascending: false }).limit(limit);
  return (data ?? []) as MarketSocial[];
}

/** Every fly-made coin by symbol (logo, name, tagline). */
export async function loadCoinLogos(): Promise<Map<string, FlyCoin>> {
  if (!db) return new Map();
  const { data } = await db.from("fly_coin_board").select("*").limit(200);
  return new Map(((data ?? []) as FlyCoin[]).map((c) => [c.symbol, c]));
}
export type MarketRound = {
  id: number; started_at: string; prices: Record<string, number>;
  events: { symbol: string; kind: string; move: number; likes?: number; comments?: number }[]; traders: number; trades: number;
};
export type MindTraits = { risk?: number; lr?: number; k?: number; memory_size?: number; tube_growth?: number; tube_decay?: number; caution?: number };
export type MindStats = { rounds?: number; rewards?: number; good_trades?: number; bad_trades?: number; vetoes?: number; dopamine?: number };
export type Learning = { dopamine: boolean; memory: boolean; tubes: boolean };
export type Trader = {
  learning: Partial<Learning> | null;
  fly_id: string; name: string; color: string; owner: string | null; generation: number | null; fly_parents: string[] | null; eth: number;
  holdings: Record<string, { qty: number; cost_eth: number }>; start_eth: number; value_eth: number; pnl: number; trades: number;
  updated_at: string; traits: MindTraits | null; inherit: "traits" | "partial" | "all" | null; stats: MindStats | null;
  tubes: Record<string, number> | null; gains: Record<string, number> | null; bias: Record<string, number> | null; memories: number | null;
};
export type FlyTrade = {
  id: number; round_id: number; fly_id: string; symbol: string;
  side: "buy" | "panic_sell" | "take_profit" | "sell" | "skipped" | "launch" | "buyback" | "dump";
  qty: number; price: number; eth: number; value_after: number; created_at: string;
  reason: {
    did?: string[]; dopamine?: number; wanted?: string; skipped?: string; bias?: number; persona?: string; tagline?: string;
    memory?: { mean_reward: number; similar: number };
    felt?: {
      target?: { symbol: string | null; move: number; tube?: number; social?: SocialHit[]; mood?: number };
      threat?: { symbol: string | null; move: number; social?: SocialHit[]; mood?: number }; wind?: { chop: number; mood?: number };
    };
  };
};
/** Who a shill or FUD that reached a fly came from. */
export type SocialHit = { from: string | null; kind: string; label: string };
export type MarketControl = { paused: boolean; note: string | null; updated_at: string | null };
export async function loadMarket(rounds = 48): Promise<{
  coins: Coin[]; rounds: MarketRound[]; traders: Trader[]; trades: FlyTrade[]; control: MarketControl; flyCoins: FlyCoin[]; social: MarketSocial[];
}> {
  const idle: MarketControl = { paused: false, note: null, updated_at: null };
  if (!db) return { coins: [], rounds: [], traders: [], trades: [], control: idle, flyCoins: [], social: [] };
  const [coins, rs, traders, trades, control, flyCoins, social] = await Promise.all([
    db.from("market_coins").select("symbol,name,kind,price,regime,category,address").neq("kind", "fly").order("category").order("symbol"),
    db.from("market_rounds").select("id,started_at,prices,events,traders,trades").order("id", { ascending: false }).limit(rounds),
    db.from("trader_board").select("*").order("value_eth", { ascending: false }).limit(100),
    db.from("fly_trades").select("*").order("id", { ascending: false }).limit(60),
    db.from("market_control").select("paused,note,updated_at").eq("id", 1).maybeSingle(),
    db.from("fly_coin_board").select("*").order("launched_at", { ascending: false }).limit(60),
    db.from("market_social").select("*").order("id", { ascending: false }).limit(60),
  ]);
  return {
    coins: (coins.data ?? []) as Coin[], rounds: ((rs.data ?? []) as MarketRound[]).reverse(),
    traders: (traders.data ?? []) as Trader[], trades: (trades.data ?? []) as FlyTrade[],
    control: (control.data as MarketControl | null) ?? idle,
    flyCoins: (flyCoins.data ?? []) as FlyCoin[], social: (social.data ?? []) as MarketSocial[],
  };
}

export type Portfolio = {
  fly_id: string; eth: number; holdings: Record<string, { qty: number; cost_eth: number }>;   // cost_eth: total paid for what it still holds
  start_eth: number; value_eth: number; trades: number; updated_at: string;
};
export type Wallet = { portfolio: Portfolio | null; prices: Record<string, number>; trades: FlyTrade[]; complete: boolean };
const WALLET_TRADES = 60;
/** One fly's paper wallet (fly_portfolios), the latest prices and its own latest trades, newest first.
 * complete: every trade it ever made is in the list (so a value history can start from its first dollar). */
export async function loadWallet(flyId: string): Promise<Wallet> {
  if (!db) return { portfolio: null, prices: {}, trades: [], complete: true };
  const [p, coins, trades] = await Promise.all([
    db.from("fly_portfolios").select("*").eq("fly_id", flyId).maybeSingle(),
    db.from("market_coins").select("symbol,price"),
    db.from("fly_trades").select("*").eq("fly_id", flyId).order("id", { ascending: false }).limit(WALLET_TRADES),
  ]);
  for (const r of [p, coins, trades]) if (r.error) throw r.error;
  const rows = (trades.data ?? []) as FlyTrade[];
  return {
    portfolio: (p.data as Portfolio | null) ?? null,
    prices: Object.fromEntries(((coins.data ?? []) as { symbol: string; price: number }[]).map((c) => [c.symbol, c.price])),
    trades: rows,
    complete: rows.length < WALLET_TRADES,
  };
}

/** These flies' market styles (fly_minds): learners and risk. Flies without a row yet are born with one at their first round. */
export async function loadStyles(flyIds: string[]): Promise<Map<string, { learning: Partial<Learning> | null; risk: number | null }>> {
  if (!db || flyIds.length === 0) return new Map();
  const { data, error } = await db.from("fly_minds").select("fly_id,traits,learning").in("fly_id", flyIds);
  if (error) throw error;
  return new Map(((data ?? []) as { fly_id: string; traits: MindTraits | null; learning: Partial<Learning> | null }[])
    .map((m) => [m.fly_id, { learning: m.learning, risk: m.traits?.risk ?? null }]));
}

/** The latest posts of these flies (the My flies tab), newest first; optionally one post kind. */
export async function loadFlyPosts(flyIds: string[], opts: { limit?: number; kind?: Post["kind"] } = {}): Promise<Post[]> {
  if (!db || flyIds.length === 0) return [];
  let q = db.from("posts").select(POST_COLUMNS).in("fly_id", flyIds).order("id", { ascending: false }).limit(opts.limit ?? 150);
  if (opts.kind) q = q.eq("kind", opts.kind);
  const { data, error } = await q;
  if (error) throw error;
  return (data as unknown as RawPost[]).map(withCounts);
}

/** One post, for links to posts older than the loaded feed. */
export async function fetchPost(id: number): Promise<Post | null> {
  if (!db) return null;
  const { data } = await db.from("posts").select(POST_COLUMNS).eq("id", id).maybeSingle();
  return data ? withCounts(data as unknown as RawPost) : null;
}

/** All flies, fresh (Elo and positions change every tick). */
export async function loadFlies(): Promise<Fly[]> {
  if (!db) return [];
  const { data } = await db.from("flies").select(FLY_COLUMNS);
  return (data ?? []) as Fly[];
}

/** Per-fly totals behind the badges. */
export async function loadBoard(): Promise<Map<string, BoardRow>> {
  if (!db) return new Map();
  const { data } = await db
    .from("fly_board")
    .select("fly_id,posts,true_posts,misreads,words,likes,hallucinations,jumps,grooms,buzzes,pokes_felt,best_streak");
  return new Map(((data ?? []) as BoardRow[]).map((r) => [r.fly_id, r]));
}

/** The latest replay of each patch, from recent ticks. */
export async function loadReplays(): Promise<Map<string, { tickId: number; replay: Replay }>> {
  const out = new Map<string, { tickId: number; replay: Replay }>();
  if (!db) return out;
  const { data } = await db.from("ticks").select("id,replay").not("replay", "is", null).order("id", { ascending: false }).limit(20);
  for (const t of (data ?? []) as { id: number; replay: Record<string, Replay> }[]) {
    for (const [pid, replay] of Object.entries(t.replay)) if (!out.has(pid)) out.set(pid, { tickId: t.id, replay });
  }
  return out;
}

/** Current positions of every fly (the worker moves them each tick). */
export async function loadPositions(): Promise<Map<string, { x: number; y: number; heading: number }>> {
  if (!db) return new Map();
  const { data } = await db.from("flies").select("id,x,y,heading").not("x", "is", null);
  return new Map(((data ?? []) as { id: string; x: number; y: number; heading: number }[]).map((f) => [f.id, f]));
}

/** Pokes from the last hour, newest first. */
export async function loadPokes(): Promise<Poke[]> {
  if (!db) return [];
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { data } = await db
    .from("pokes")
    .select("id,patch_id,stimulus,created_at,consumed_at,tick_id,x,y")
    .gte("created_at", since)
    .order("id", { ascending: false })
    .limit(50);
  return (data ?? []) as Poke[];
}

export async function loadComments(postId: number): Promise<Comment[]> {
  if (!db) return [];
  const { data } = await db.from("comments").select("*").eq("post_id", postId).order("id").limit(200);
  return (data ?? []) as Comment[];
}

/** Waiting duels and the latest finished ones. */
export async function loadDuels(limit = 40): Promise<Duel[]> {
  if (!db) return [];
  const { data } = await db.from("duels").select("*").neq("status", "cancelled").order("id", { ascending: false }).limit(limit);
  return (data ?? []) as Duel[];
}

/** The latest automatic matings, newest first. */
export async function loadMatings(limit = 30): Promise<Mating[]> {
  if (!db) return [];
  const { data } = await db.from("matings").select("*").order("id", { ascending: false }).limit(limit);
  return (data ?? []) as Mating[];
}

export type BondLabel = "mates" | "family" | "best friends" | "friends" | "frenemies" | "rivals" | "enemies" | "acquaintances";
/** Two flies' relationship (fly_bonds): what their brains did to each other, a < b. a_* is what fly a felt about fly b. */
export type Bond = {
  a: string; b: string;
  a_startled: number; b_startled: number; a_drawn: number; b_drawn: number; a_touched: number; b_touched: number;
  a_wins: number; b_wins: number; draws: number; matings: number;
  kin: "a_parent" | "b_parent" | "siblings" | null;
  warmth: number; tension: number; label: BondLabel; last_at: string | null;
};
/** One fly's relationships (flyId), or everyone's (null), over the last `days` days. */
export async function loadBonds(flyId: string | null, days: number): Promise<Bond[]> {
  if (!db) return [];
  const { data, error } = await db.rpc("fly_bonds", { focus_fly: flyId, window_days: days });
  if (error) throw error;
  return (data ?? []) as Bond[];
}

/** Monday 00:00 UTC of the week containing `d`, shifted by `weeks`. */
export function weekStart(d = new Date(), weeks = 0): Date {
  const day = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 7 * weeks));
}

export async function challengeBoard(start: Date): Promise<ChallengeRow[]> {
  if (!db) return [];
  const { data, error } = await db.rpc("challenge_board", { week_start: start.toISOString() });
  if (error) throw error;
  return (data ?? []) as ChallengeRow[];
}

export type Mission = { key: string; period: "daily" | "weekly"; label: string; progress: number; target: number; points: number };
export async function myMissions(): Promise<Mission[]> {
  if (!db) return [];
  const { data, error } = await db.rpc("my_missions");
  if (error) throw error;
  return data as Mission[];
}

/** wallet_short is how the person is shown (handle or shortened wallet); has_wallet marks reward-eligible accounts. */
export type SeasonRow = { user_id: string; wallet_short: string; points: number; missions: number; has_wallet?: boolean };
export async function loadSeasonBoard(): Promise<SeasonRow[]> {
  if (!db) return [];
  // a failed read is an error, not an empty season (2026-10-08: a timeout showed "No missions completed" to everyone)
  const { data, error } = await db.from("season_board").select("*");
  if (error) throw new Error(error.message);
  return ((data ?? []) as SeasonRow[]).sort((a, b) => b.points - a.points);
}

/** How many people like a post. */
export async function likeCount(postId: number): Promise<number> {
  if (!db) return 0;
  const { count } = await db.from("likes").select("post_id", { count: "exact", head: true }).eq("post_id", postId);
  return count ?? 0;
}

/** The posts this user has liked. */
export async function myLikes(userId: string): Promise<Set<number>> {
  if (!db) return new Set();
  const { data } = await db.from("likes").select("post_id").eq("user_id", userId).limit(1000);
  return new Set((data ?? []).map((r) => r.post_id as number));
}

/** Live changes. No-op on the demo feed. */
export function subscribe(handlers: {
  onPost: (p: Post) => void; onTick: (t: Tick) => void; onLike: (postId: number) => void; onPoke: (p: Poke) => void;
  onComment: (postId: number) => void; onCaption: (postId: number, body: string | null) => void; onDuel: (d: Duel) => void;
  onMeme?: () => void; onMarket?: () => void;
}): () => void {
  if (!db) return () => {};
  const channel = db
    .channel("feed")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" },
        (m) => handlers.onPost({ ...(m.new as Post), actions: (m.new as Post).actions ?? [], cause: (m.new as Post).cause ?? null,
                                 likes: 0, comments: 0, caption: null, has_voice: !!(m.new as Post).trace }))
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "ticks" }, (m) => handlers.onTick(m.new as Tick))
    .on("postgres_changes", { event: "*", schema: "public", table: "likes" }, (m) => {
      const row = (m.eventType === "DELETE" ? m.old : m.new) as { post_id?: number };
      if (row.post_id) handlers.onLike(row.post_id);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "pokes" }, (m) => {
      if (m.eventType !== "DELETE") handlers.onPoke(m.new as Poke);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, (m) => {
      const row = (m.eventType === "DELETE" ? m.old : m.new) as { post_id?: number };
      if (row.post_id) handlers.onComment(row.post_id);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "captions" }, (m) => {
      const row = (m.eventType === "DELETE" ? m.old : m.new) as { post_id?: number; body?: string };
      if (row.post_id) handlers.onCaption(row.post_id, m.eventType === "DELETE" ? null : row.body ?? null);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "duels" }, (m) => {
      if (m.eventType !== "DELETE") handlers.onDuel(m.new as Duel);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "memes" }, () => handlers.onMeme?.())
    .on("postgres_changes", { event: "*", schema: "public", table: "meme_likes" }, () => handlers.onMeme?.())
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "market_social" }, () => handlers.onMarket?.())
    .subscribe();
  return () => void db.removeChannel(channel);
}
