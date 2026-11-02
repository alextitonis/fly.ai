// Checking a project someone names (2026-11-02, the user: "if asking can you check this project Name/X/URL"): free public
// facts and fixed rules, no model. A name, ticker or contract is looked up on DexScreener and goes through the feed's scam
// filter (screen.ts); an X account is read from FxTwitter. A website is never fetched here: the bot would be reaching for any
// address a stranger gives it, so sites go to the Fly Scan worker (commands/research.ts).
import { contractCheck, holderCheck, screen, type Verdict } from "./screen.ts";
import { codeOf, coinOf, domainAgeDays, flow, hostOf, launchesBy, oursOn, poolsOf, priceHistory, promoOf, tokenInfo, websiteOf,
  type Code, type Coin, type Flow, type Launches, type Ours, type Pool, type PriceHistory, type Promo, type TokenInfo } from "./sources.ts";

export type Target = { kind: "token" | "x" | "site" | "nft"; value: string };   // nft: an OpenSea slug, or "chain:0x…"

const DOMAIN = /\b((?:[a-z0-9-]+\.)+(?:com|io|ai|xyz|app|fun|finance|org|net|gg|co|lol|money|dev|meme|exchange|trade|fi|me|so|sh|tech|site|online))\b(\/\S*)?/i;
const ADDRESS = /0x[0-9a-fA-F]{40}/;
const SOLANA = /(?:^|\s)([1-9A-HJ-NP-Za-km-z]{32,44})(?=\s|$)/;   // base58: a Solana mint address

/** What a message points at, when it's unmistakable: a contract, an X link or @handle, a chart link, a website. */
export function exactTarget(text: string): Target | null {
  const t = text.replace(/[<>]/g, " ");
  // an OpenSea link means the NFT on it, not OpenSea (2026-11-02, the user: "i sent the open sea but didn't check the nft it self")
  const slug = /opensea\.io\/(?:[a-z-]+\/)?collection\/([A-Za-z0-9_-]+)/i.exec(t);
  if (slug) return { kind: "nft", value: slug[1]! };
  const item = /opensea\.io\/(?:[a-z-]+\/)?(?:item|assets)\/([a-z_]+)\/(0x[0-9a-fA-F]{40})/i.exec(t);
  if (item) return { kind: "nft", value: `${item[1]!.toLowerCase()}:${item[2]}` };
  const x = /(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/@?([A-Za-z0-9_]{1,15})\b/i.exec(t);
  if (x) return { kind: "x", value: x[1]! };
  const chart = /dexscreener\.com\/[a-z0-9-]+\/([A-Za-z0-9]{32,66})/i.exec(t);
  if (chart) return { kind: "token", value: chart[1]! };
  const address = ADDRESS.exec(t);
  if (address) return { kind: "token", value: address[0] };
  const mint = SOLANA.exec(t);
  if (mint) return { kind: "token", value: mint[1]! };
  const at =/(?:^|\s)@([A-Za-z0-9_]{1,15})\b/.exec(t);
  if (at) return { kind: "x", value: at[1]! };
  const site = DOMAIN.exec(t);
  if (site && !/^fly\.ai$/i.test(site[1]!)) return { kind: "site", value: `${site[1]}${site[2] ?? ""}`.replace(/[.,!?)]+$/, "") };
  return null;
}

export type Facts = {
  query: string;
  token?: { name: string; symbol: string; ca: string; chain: string; chainKey: string | null; url: string; image?: string; price?: string; ageH: number | null };
  verdict?: Verdict | null;
  copies?: number;                     // other tokens with this ticker
  links?: string[];                    // what the token lists: unverified
  nft?: Nft;
  x?: XProfile | null;                 // undefined: none to read. null: asked for one that can't be read
  xListedFailed?: string;              // the X account the token lists couldn't be read just now (not held against it)
  deep?: Deep;
};
/** The rest of what's public about it (sources.ts). Each is left out if it can't be read. */
export type Deep = { info?: TokenInfo | null; pools?: Pool[]; history?: PriceHistory | null; flow?: Flow | null; promo?: Promo | null; launches?: Launches | null;
  website?: string | null; domainDays?: number | null; code?: Code | null; coin?: Coin | null; ours?: Ours | null };
export type Nft = { slug: string; name: string; url: string; image?: string; chain: string; contract: string | null; supply: number | null; owners: number | null;
  floor: number | null; volume: number | null; sales7: number | null; sales30: number | null; volume30: number | null; symbol: string; created: number | null; verified: boolean; disabled: boolean; feePct: number; website: string | null; twitter: string | null };
export type XProfile = { handle: string; name: string; followers: number; posts: number; joined: number | null; bio: string; website: string | null; protected: boolean };

const DRIED_USD = 10_000;              // a day's volume: above this, a slower month is just a slower month
const CHAIN_KEY: Record<string, string> = { robinhood: "", base: "base", bsc: "bsc", arbitrum: "arbitrum", ethereum: "ethereum", solana: "solana" };   // what screen() can check

type DexPair = { chainId: string; url: string; priceUsd?: string; liquidity?: { usd?: number }; pairCreatedAt?: number;
  baseToken: { address: string; name: string; symbol: string };
  info?: { imageUrl?: string; websites?: { url: string }[]; socials?: { type: string; url: string }[] } };

const json = async (url: string, timeout = 12_000): Promise<any> => {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { "user-agent": "Mozilla/5.0 (fly.ai discord bot)" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

export async function readX(handle: string): Promise<XProfile | null> {
  const url = `https://api.fxtwitter.com/${encodeURIComponent(handle)}`;
  const d = await json(url).catch(() => null) ?? await new Promise((r) => setTimeout(r, 1500)).then(() => json(url)).catch(() => null);
  const u = d?.user;
  if (!u?.screen_name) return null;
  const joined = Date.parse(u.joined ?? "");
  return { handle: u.screen_name, name: u.name ?? u.screen_name, followers: Number(u.followers ?? 0), posts: Number(u.tweets ?? 0),
    joined: Number.isFinite(joined) ? joined : null, bio: String(u.description ?? ""), website: u.website?.url ?? null, protected: !!u.protected };
}

/** The token a name, ticker or address means: an exact match first, deepest pool. `copies`: other tokens wearing that ticker. */
export async function findToken(query: string): Promise<{ pair: DexPair; copies: number } | null> {
  const d = await json(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`).catch(() => null);
  const pairs: DexPair[] = d?.pairs ?? [];
  if (!pairs.length) return null;
  const q = query.toLowerCase().replace(/^\$/, "");
  const exact = pairs.filter((p) => [p.baseToken.address, p.baseToken.symbol, p.baseToken.name].some((x) => x.toLowerCase() === q));
  const pool = exact.length ? exact : ADDRESS.test(query) ? [] : [];
  if (!pool.length) return null;   // a loose search hit is some other project: better "not found" than the wrong token's numbers
  const deepest = [...pool].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0]!;
  // a ticker here usually means the Robinhood token, unless a copy elsewhere is a different league (asked for PEPE, that's Ethereum's)
  const home = pool.filter((p) => p.chainId === "robinhood").sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  const best = home && (deepest.liquidity?.usd ?? 0) < Math.max(home.liquidity?.usd ?? 0, 1_000) * 100 ? home : deepest;
  const others = new Set(pool.map((p) => p.baseToken.address.toLowerCase()));
  others.delete(best.baseToken.address.toLowerCase());
  return { pair: best, copies: others.size };
}

/** A collection from OpenSea's API: by slug, or by "chain:0x…" (an item's link). null when it can't be read. */
export async function readCollection(value: string): Promise<Nft | null> {
  const API = "https://api.opensea.io/api/v2";
  let slug: string | null = value;
  const m = /^([a-z_]+):(0x[0-9a-fA-F]{40})$/.exec(value);
  if (m) slug = (await json(`${API}/chain/${m[1]}/contract/${m[2]}`).catch(() => null))?.collection ?? null;
  if (!slug) return null;
  const c = await json(`${API}/collections/${encodeURIComponent(slug)}`).catch(() => null);
  if (!c?.collection) return null;
  const s = await json(`${API}/collections/${encodeURIComponent(slug)}/stats`).catch(() => null);
  const on = c.contracts?.[0];
  const created = Date.parse(c.created_date ?? "");
  const num = (x: unknown) => (x == null || !Number.isFinite(Number(x)) ? null : Number(x));
  const span = (name: string) => (s?.intervals ?? []).find((i: { interval?: string }) => i.interval === name);
  return { slug, name: String(c.name ?? slug), url: c.opensea_url ?? `https://opensea.io/collection/${slug}`, ...(c.image_url ? { image: c.image_url } : {}),
    chain: String(on?.chain ?? "?"), contract: m?.[2] ?? on?.address ?? null, supply: num(c.total_supply), owners: num(s?.total?.num_owners),
    floor: num(s?.total?.floor_price), volume: num(s?.total?.volume), sales7: num(span("seven_day")?.sales), sales30: num(span("thirty_day")?.sales), volume30: num(span("thirty_day")?.volume), symbol: s?.total?.floor_price_symbol ?? s?.total?.volume_symbol ?? "ETH",
    created: Number.isFinite(created) ? created : null, verified: ["verified", "approved"].includes(String(c.safelist_status)), disabled: !!c.is_disabled,
    feePct: (c.fees ?? []).filter((f: { required?: boolean; fee?: number; recipient?: string }) => f.recipient?.toLowerCase() === String(c.owner).toLowerCase()).reduce((n: number, f: { fee?: number }) => n + Number(f.fee ?? 0), 0),
    website: /^https:\/\//.test(c.project_url ?? "") ? c.project_url : null, twitter: c.twitter_username || null };
}

const handleOf = (url: string) => /(?:x|twitter)\.com\/@?([A-Za-z0-9_]{1,15})/i.exec(url)?.[1] ?? null;

/** Everything public about a name, ticker, address or X handle; whatever fails is left out. */
export async function gather(t: Target): Promise<Facts> {
  const facts: Facts = { query: t.value };
  if (t.kind === "nft") {
    const n = await readCollection(t.value);
    if (!n) return facts;
    facts.nft = n;
    if (n.twitter) {
      const read = await readX(n.twitter);
      if (read) facts.x = read; else facts.xListedFailed = n.twitter;
    }
    if (n.contract && n.chain === "robinhood") facts.verdict = await holderCheck(n.contract, n.created ?? Infinity).catch(() => null);
    facts.deep = await siteFacts([n.website], []);
    return facts;
  }
  if (t.kind === "x") facts.x = await readX(t.value);
  const inBio = facts.x ? ADDRESS.exec(facts.x.bio)?.[0] : null;
  const query = t.kind === "token" ? t.value : inBio ?? null;
  const found = query ? await findToken(query) : null;
  if (found) {
    const p = found.pair;
    const key = CHAIN_KEY[p.chainId];
    facts.token = { name: p.baseToken.name, symbol: p.baseToken.symbol, ca: p.baseToken.address, chain: p.chainId, chainKey: key ?? null, url: p.url,
      ageH: p.pairCreatedAt ? (Date.now() - p.pairCreatedAt) / 3_600_000 : null,
      ...(p.info?.imageUrl ? { image: p.info.imageUrl } : {}), ...(p.priceUsd ? { price: p.priceUsd } : {}) };
    facts.copies = found.copies;
    facts.links = [...(p.info?.websites ?? []), ...(p.info?.socials ?? [])].map((x) => x.url).filter((u) => /^https:\/\//.test(u)).slice(0, 4);
    let v = key === undefined ? null : await screen(p.baseToken.address, key).catch(() => null);
    // the filter stopped at the pool, so the contract was never read: asked about it, read it anyway
    if (v && key !== undefined && !v.contractChecked && !v.failed) {
      const c = await contractCheck(p.baseToken.address, key);
      v = { ...v, why: [...v.why, ...c.why.filter((w) => !c.failed || !/not checked|check failed/.test(w))], ok: v.ok && !c.why.length, contractChecked: !!c.contractChecked, contractClean: !!c.contractClean,
        ...(c.tax != null ? { tax: c.tax } : {}), ...(c.lp ? { lp: c.lp } : {}), ...(c.creator ? { creator: c.creator } : {}), ...(c.creatorPct != null ? { creatorPct: c.creatorPct } : {}),
        ...(c.creatorHoneypots ? { creatorHoneypots: c.creatorHoneypots } : {}), ...(c.warnings ? { warnings: c.warnings } : {}), ...(c.top10 != null ? { top10: c.top10 } : {}) };
    }
    facts.verdict = v;
    // bundling even when the filter stopped at the pool or the contract, on a copy: the filter's cached verdict stays as it is
    if (v && p.chainId === "robinhood" && v.holders == null && v.holdersSkipped !== "too busy to read" && !v.failed) {
      const h = await holderCheck(p.baseToken.address, p.pairCreatedAt ?? Infinity);
      facts.verdict = { ...v, why: [...v.why, ...h.why], ok: v.ok && !h.why.length,
        ...(h.holders != null ? { holders: h.holders } : {}), ...(h.top10 != null ? { top10: h.top10 } : {}),
        ...(h.cluster != null ? { cluster: h.cluster } : {}), holdersSkipped: h.holdersSkipped ?? "" };
    }
    if (!facts.x) {
      const h = (p.info?.socials ?? []).filter((s) => s.type === "twitter").map((s) => handleOf(s.url)).find((x) => x && x !== "i");
      if (h) {
        const read = await readX(h);
        if (read) facts.x = read; else facts.xListedFailed = h;
      }
    }
    facts.deep = await tokenFacts(p, facts);
  } else if (facts.x) {
    facts.deep = await siteFacts([facts.x.website], [facts.x.bio]);
  }
  return facts;
}

const githubIn = (texts: (string | null | undefined)[]) => texts.map((t) => /https?:\/\/(?:www\.)?github\.com\/[^\s"'<>)]+/i.exec(t ?? "")?.[0]).find(Boolean) ?? null;

/** A project's site age and code, with nothing on chain to go on. */
async function siteFacts(urls: (string | null | undefined)[], texts: (string | null | undefined)[]): Promise<Deep> {
  const website = websiteOf(urls), host = hostOf(website), repo = githubIn([...urls, ...texts]);
  const [domainDays, code] = await Promise.all([host ? domainAgeDays(host).catch(() => null) : null, repo ? codeOf(repo).catch(() => null) : null]);
  return { website, domainDays, code };
}

/** Its pools, history, creator, promotion, site, code and our own flies' dealings, all at once. */
async function tokenFacts(p: DexPair, f: Facts): Promise<Deep> {
  const chain = p.chainId, ca = p.baseToken.address;
  const [info, pools, promo, ours] = await Promise.all([tokenInfo(chain, ca).catch(() => null), poolsOf(chain, ca).catch(() => []),
    promoOf(chain, ca).catch(() => null), oursOn(chain, ca, p.baseToken.symbol).catch(() => null)]);
  // the busiest pool, not the deepest: a one-sided band can be deep with no trades at all
  const busiest = [...pools].sort((a, b) => b.vol24 - a.vol24 || b.liq - a.liq)[0];
  const [history, tape] = busiest ? await Promise.all([priceHistory(chain, busiest.address).catch(() => null), flow(chain, busiest.address).catch(() => null)]) : [null, null];
  const coin = info?.coin ? await coinOf(info.coin).catch(() => null) : null;
  const creator = info?.dev ?? f.verdict?.creator ?? null;
  const launches = creator && chain === "robinhood" ? await launchesBy(creator, ca).catch(() => null) : null;
  const site = await siteFacts([...(f.links ?? []), info?.website, f.x?.website], [...(f.links ?? []), coin?.repo, f.x?.bio]);
  return { info, pools, history, flow: tape, promo, launches, ours, coin, ...site };
}

/** Clean or bundled, in one line. `level` follows the same limits as the scam filter (25%). */
export function bundle(f: Facts): { level: "bad" | "some" | "clean" | "unknown"; line: string } | null {
  if (!f.token && !f.nft) return null;
  const chain = f.token?.chain ?? f.nft?.chain;
  const v = f.verdict;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const top = v?.top10 != null ? `. Top 10 wallets hold ${pct(v.top10)}` : "";
  if (v?.cluster != null) {
    if (v.cluster > 0.25) return { level: "bad", line: `🔴 Bundled: wallets that look like one group hold ${pct(v.cluster)}${top}` };
    if (v.cluster > 0.05) return { level: "some", line: `🟡 Some grouped wallets, holding ${pct(v.cluster)}${top}` };
    return { level: "clean", line: `🟢 Clean: no real wallet group among the top 25${top}` };
  }
  if (chain === "robinhood") return { level: "unknown", line: `⚪ Not checked: ${v?.holdersSkipped ?? "the checks couldn't finish"}${top}` };
  return { level: "unknown", line: `⚪ Bundling can only be read on Robinhood Chain for now${top}` };
}

export type Grade = { level: "red" | "careful" | "clear" | "unknown"; bad: string[]; careful: string[]; good: string[] };

/** The token's pools, past and people, measured. The limits are where a number stops being ordinary, not proof of anything. */
function gradeDeep(f: Facts, bad: string[], careful: string[], good: string[]): void {
  const d = f.deep;
  if (!d) return;
  const pct = (x: number) => `${Math.round(x)}%`;
  if (d.info?.devPct != null && d.info.devPct >= 10) careful.push(`Its developer wallet holds ${pct(d.info.devPct)}`);
  const l = d.launches;
  if (l) {
    if (l.count >= 3 && l.dead / Math.min(l.count, 30) >= 0.7) bad.push(`Its creator launched ${l.count} other tokens, and ${l.dead} now have under $1k in pools`);
    else if (l.last7d >= 3) careful.push(`Its creator launched ${l.last7d} other tokens in the last week`);
    else if (l.count) careful.push(`Its creator launched ${l.count} other token${l.count > 1 ? "s" : ""}: look at how they went`);
  }
  if (d.history && d.history.fromPeak <= -0.9) careful.push(`Price is ${pct(-d.history.fromPeak * 100)} below its ${d.history.days}-day high`);
  if (d.history?.volBefore && d.history.vol7 < d.history.volBefore * 0.2 && d.history.vol7 < DRIED_USD) careful.push("Trading has dried up: this week's volume is under a fifth of the month before");
  if (d.flow && d.flow.trades >= 30 && d.flow.top3 >= 0.7) careful.push(`Three wallets made ${pct(d.flow.top3 * 100)} of its recent volume, which can mean wash trading`);
  const busy = [...(d.pools ?? [])].sort((a, b) => b.vol24 - a.vol24)[0];
  if (busy && busy.buys >= 20 && busy.sells === 0) bad.push(`${busy.buys} buys and no sells in 24h in its busiest pool, which is what a honeypot looks like`);
  if (d.coin?.notice) careful.push(`CoinGecko notice: ${d.coin.notice}`);
  gradeSite(d, careful, good);
}

function gradeSite(d: Deep, careful: string[], good: string[]): void {
  if (d.domainDays != null && d.domainDays < 30) careful.push(`Its website's domain is only ${Math.round(d.domainDays)} days old`);
  if (d.domainDays != null && d.domainDays >= 365) good.push(`Website domain is over ${Math.floor(d.domainDays / 365)} year${d.domainDays >= 730 ? "s" : ""} old`);
  if (d.code?.pushedDays != null) {
    if (d.code.pushedDays <= 30) good.push(`Public code updated ${d.code.pushedDays < 1 ? "today" : `${Math.round(d.code.pushedDays)} days ago`}`);
    else if (d.code.pushedDays > 180) careful.push(`Its public code hasn't changed in ${Math.round(d.code.pushedDays)} days`);
  }
}

/** The rules. They can only say what they saw: nothing here calls a project safe. */
export function grade(f: Facts, now = Date.now()): Grade {
  const bad: string[] = [], careful: string[] = [], good: string[] = [];
  const v = f.verdict;
  if (f.token) {
    if (v && !v.ok && !v.failed) bad.push(...v.why);
    if (v?.failed) careful.push("The scam checks couldn't finish, so nothing is known about its contract");
    if (!v) careful.push(`Contract and holder checks don't cover ${f.token.chain}`);
    if (v?.contractClean) good.push("No owner powers or sell blocks found in the contract");
    if (v?.contractChecked === false) careful.push("Its contract couldn't be read, so owner powers are unknown");
    if (v?.creatorHoneypots) bad.push(`GoPlus ties ${v.creatorHoneypots} honeypot${v.creatorHoneypots > 1 ? "s" : ""} to the same creator`);
    // (a low share says nothing: on 11-02 GoPlus showed 0% on nearly every token, PEPE included, it doesn't know the lockers)
    if (v?.lp && v.lp.locked >= 0.5) good.push(`${Math.round(v.lp.locked * 100)}% of its LP shows as locked or burned`);
    for (const w of v?.warnings ?? []) careful.push(w);
    gradeDeep(f, bad, careful, good);
    const b = bundle(f);
    if (b?.level === "some") careful.push("Some of the top wallets look grouped");
    if (b?.level === "clean") good.push("No wallet group found among the top holders");
    if (b?.level === "unknown" && f.token.chain === "robinhood") careful.push("Whether it's bundled couldn't be checked");
    if (f.token.ageH != null && f.token.ageH < 7 * 24) careful.push(`The pool is only ${f.token.ageH < 48 ? `${Math.round(f.token.ageH)} hours` : `${Math.round(f.token.ageH / 24)} days`} old`);
    if ((f.copies ?? 0) >= 2) careful.push(`${f.copies} other tokens use this name. Match the contract before buying`);
    if (!f.links?.length) careful.push("It lists no website or socials");
  }
  if (f.nft) {
    const n = f.nft, days = n.created ? (now - n.created) / 86_400_000 : null;
    if (n.disabled) bad.push("OpenSea has disabled this collection");
    if (f.verdict?.why.length) bad.push(...f.verdict.why);
    const b = bundle(f);
    if (b?.level === "some") careful.push("Some of the top wallets look grouped");
    if (b?.level === "clean") good.push("No wallet group found among the top holders");
    if (b?.level === "unknown") careful.push("Who holds it couldn't be checked");
    if (days != null && days < 7) careful.push(`The collection is only ${days < 2 ? "a day" : `${Math.round(days)} days`} old`);
    if (n.verified) good.push("Verified on OpenSea"); else careful.push("Not verified on OpenSea");
    if (n.sales30 === 0) careful.push("No sales in the last 30 days");
    else if (n.sales7 === 0) careful.push("No sales in the last 7 days");
    if (n.feePct >= 10) careful.push(`${n.feePct}% creator fee on sales`);
    if (n.supply && n.owners != null && n.owners / n.supply < 0.1) careful.push(`Only ${n.owners.toLocaleString("en-US")} owners for ${n.supply.toLocaleString("en-US")} items`);
    if (!n.website && !n.twitter) careful.push("It lists no website or X account");
    if (f.deep) gradeSite(f.deep, careful, good);
  }
  if (!f.token && !f.nft && f.deep) gradeSite(f.deep, careful, good);
  if (f.x) {
    const days = f.x.joined ? (now - f.x.joined) / 86_400_000 : null;
    if (f.x.protected) careful.push("The X account is private");
    if (days != null && days < 60) careful.push(`The X account is only ${Math.round(days)} days old`);
    if (f.x.followers < 500) careful.push(`Only ${f.x.followers.toLocaleString("en-US")} followers on X`);
    if (days != null && days >= 365) good.push(`X account over ${Math.floor(days / 365)} year${days >= 730 ? "s" : ""} old`);
  } else if (f.x === null) {
    careful.push("Couldn't read that X account: it may not exist");
  }
  const seen = !!f.token || !!f.x || !!f.nft;
  return { level: bad.length ? "red" : !seen ? "unknown" : careful.length ? "careful" : "clear", bad, careful, good };
}
