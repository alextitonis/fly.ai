/**
 * /compute/leaderboard?month=YYYY-MM: wallets by points for a month, the days left, the pool once announced
 * or snapshotted, and the visitor's own row if this browser has a miner with a linked wallet.
 */
import { locale, t } from "./i18n.ts";
import { API } from "./config.ts";
import { $, compact, num } from "./format.ts";
import { mountAccount, signedIn } from "./account.ts";
import { api } from "./mine-core.ts";
import { shortAddress } from "./wallet.ts";

const TOP = 50;

function shiftMonth(m: string, by: number): string {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1 + by, 1)).toISOString().slice(0, 7);
}

/** The month on screen: the one asked for in ?month=, else this one. */
function monthShown(): { m: string; current: string } {
  const current = new Date().toISOString().slice(0, 7);
  const asked = new URLSearchParams(location.search).get("month");
  return { m: asked && /^\d{4}-\d{2}$/.test(asked) ? asked : current, current };
}

// 2026-09-29 ("takes a long time to load and often freezes"): the board draws as soon as the month's numbers
// arrive - and at once from the last copy this browser saw - instead of waiting for the miner lookup (/api/me,
// which the busy mining side answers), whose row is filled in afterwards.
const CACHE_KEY = (m: string) => `flymine.month.${m}`;
let mine: string | null = null;

async function load(): Promise<void> {
  const { m } = monthShown();
  const data = await api(API, `/api/month?month=${m}`, null);
  try { sessionStorage.setItem(CACHE_KEY(m), JSON.stringify(data)); } catch { /* private window, full storage */ }
  render(data);
}

/** Who "you" are: the signed-in wallet, else the wallet linked to this browser's miner (looked up once, later). */
async function whoAmI(): Promise<void> {
  mine = signedIn();
  if (mine) return;
  try {
    const token = localStorage.getItem("flymine.token");
    if (token) mine = (await api(API, "/api/me", token)).wallet;
  } catch { /* no miner in this browser, or the mining side is slow: the board shows without "you" */ }
}

function render(data: any): void {
  const { m, current } = monthShown();

  const name = new Date(`${m}-01T00:00:00Z`).toLocaleString(locale(), { month: "long", year: "numeric", timeZone: "UTC" });
  $("title").textContent = m === current ? t("compute.leaderboard.soFar", { month: name }) : name;
  ($("prev") as HTMLAnchorElement).href = `?month=${shiftMonth(m, -1)}`;
  const next = shiftMonth(m, 1);
  ($("next") as HTMLAnchorElement).href = `?month=${next}`;
  $("next").hidden = next > current;

  $("wallets").textContent = String(data.wallets.length);
  $("points").textContent = num(data.total_points, 0);
  $("days").textContent = data.closed ? t("compute.leaderboard.ended") : String(data.days_left);
  $("days-label").textContent = data.closed ? new Date(data.ends_at).toLocaleDateString(locale(), { timeZone: "UTC" }) : t("compute.leaderboard.daysLeft");
  const pool = data.snapshot?.pool ?? data.announced_pool;
  $("pool").textContent = pool ? compact(Number(pool)) : t("compute.leaderboard.notSet");
  // before the snapshot the pool is the announcement plus the buyers' part, which grows as orders are charged
  const buyers = Number(data.buyer_pool ?? 0);
  $("pool-parts").hidden = !!data.snapshot || buyers <= 0;
  if (!data.snapshot && buyers > 0) {
    const announced = Number(data.announced_pool ?? 0) - buyers;
    const fromUsdc = Number(data.buyer_pool_from_usdc ?? 0);
    $("pool-parts").textContent = [
      t("compute.leaderboard.poolBuyers", { announced: announced > 0 ? t("compute.leaderboard.poolAnnounced", { amount: compact(announced) }) : "", buyers: compact(buyers) }),
      fromUsdc > 0 ? t("compute.leaderboard.poolUsdc", { amount: compact(fromUsdc), usdc: Number(data.usdc_received).toLocaleString(locale(), { maximumFractionDigits: Number(data.usdc_received) < 1 ? 6 : 2 }) }) : "",
      t("compute.leaderboard.poolGrows"),
    ].join("");
  }

  const rows = data.wallets as { rank: number; wallet: string; points: number; share: number }[];
  const me = mine ? rows.find((r) => r.wallet === mine) : undefined;
  $("you").hidden = !mine;
  if (mine) {
    $("you-text").textContent = me
      ? t("compute.leaderboard.you", { rank: me.rank, wallets: rows.length, points: num(me.points, 1), share: (me.share * 100).toFixed(2) })
        + (pool ? t("compute.leaderboard.youAtShare", { amount: compact(Number(pool) * me.share) }) : "")
      : t("compute.leaderboard.youNone", { wallet: shortAddress(mine) });
  }

  const shown = rows.slice(0, TOP);
  if (me && me.rank > TOP) shown.push(me);
  $("empty").hidden = shown.length > 0;
  $("board").replaceChildren(...shown.map((r) => {
    const tr = document.createElement("tr");
    if (r.wallet === mine) tr.className = "me";
    for (const [text, cls, title] of [[`#${r.rank}`, "", ""], [shortAddress(r.wallet), "", r.wallet], [num(r.points, 1), "r", ""], [`${(r.share * 100).toFixed(2)}%`, "r", ""]]) {
      const td = document.createElement("td");
      td.textContent = text;
      if (cls) td.className = cls;
      if (title) td.title = title;
      tr.append(td);
    }
    return tr;
  }));
}

mountAccount();
try {                                                  // the last board this browser saw, drawn before any request
  const seen = sessionStorage.getItem(CACHE_KEY(monthShown().m));
  if (seen) render(JSON.parse(seen));
} catch { /* nothing kept */ }
void load();
// "you" is filled in once the miner lookup answers, without holding the board up
void whoAmI().then(() => {
  try {
    const seen = sessionStorage.getItem(CACHE_KEY(monthShown().m));
    if (seen) render(JSON.parse(seen));
  } catch { /* nothing kept */ }
});
// the pool grows as buyers' orders are charged: keep this month's numbers current
setInterval(() => { if (!document.hidden) void load().catch(() => {}); }, 120_000);
