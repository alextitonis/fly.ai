/**
 * Flinder's bragging rights, all in this browser: each swiper's stats, a leaderboard of the flies you've run,
 * a PNG card to post, and a link that runs the same fly on a friend's page.
 */
import { t } from "./i18n.ts";
import { rizz } from "./lines.ts";
import { flyToHash, type Profile } from "./profiles.ts";

export interface Stats { swipes: number; rights: number; supers: number; matches: number; dates: number; ghosted: number; unmatched: number }
export const emptyStats = (): Stats => ({ swipes: 0, rights: 0, supers: 0, matches: 0, dates: 0, ghosted: 0, unmatched: 0 });

export interface BoardRow extends Stats { key: string; name: string; color: string; pic: string; at: number }
const KEY = "flinder-board";
export function loadBoard(): BoardRow[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as BoardRow[]; } catch { return []; }
}
/** Saves this swiper's stats (one row per fly, the 20 most recent kept). */
export function saveBoard(p: Profile, s: Stats, pic: string): BoardRow[] {
  const key = `${p.name}:${p.seed}`;
  const rows = loadBoard().filter((r) => r.key !== key);
  rows.unshift({ ...s, key, name: p.name, color: p.color, pic, at: Date.now() });
  try { localStorage.setItem(KEY, JSON.stringify(rows.slice(0, 20))); } catch { /* private mode: no board */ }
  return rows.slice(0, 20);
}
/** The leaderboard's categories: who wins each, among the flies run here (labels in the page's language). */
export const categories = (): [string, (r: BoardRow) => number][] => [
  [t("flinder.board.player"), (r) => r.matches],
  [t("flinder.board.dates"), (r) => r.dates],
  [t("flinder.board.ghosted"), (r) => r.ghosted],
  [t("flinder.board.unmatched"), (r) => r.unmatched],
  [t("flinder.board.supers"), (r) => r.supers],
];

/** A small square thumbnail of a photo, to keep the board light. */
export function thumb(url: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = 72;
      const s = Math.min(img.width, img.height);
      c.getContext("2d")!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 72, 72);
      resolve(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => resolve("");
    img.src = url;
  });
}

export const flyLink = (p: Profile) => `${location.origin}${location.pathname}#${flyToHash(p)}`;

/** The card to post: the fly's photo, its numbers and its rizz. */
export async function statsCard(p: Profile, s: Stats, pic: string): Promise<Blob> {
  const W = 1080, H = 1350;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#ff4f7b"); bg.addColorStop(1, "#ff8a1f");
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.font = "700 84px 'Outfit', sans-serif";
  g.fillText("flinder🔥", W / 2, 130);
  const img = await new Promise<HTMLImageElement>((r) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(i); i.src = pic; });
  const ph = 520, pw = ph * 0.8, px = (W - pw) / 2, py = 180;
  g.save();
  g.beginPath(); g.roundRect(px, py, pw, ph, 40); g.clip();
  if (img.width) g.drawImage(img, px, py, pw, ph);
  g.restore();
  g.lineWidth = 12; g.strokeStyle = "#fff";
  g.beginPath(); g.roundRect(px, py, pw, ph, 40); g.stroke();
  g.font = "700 72px 'Outfit', sans-serif";
  g.fillText(p.name, W / 2, 800);
  g.font = "600 44px Inter, sans-serif";
  g.fillText(rizz(s.swipes, s.matches, s.dates), W / 2, 870);
  const cells: [string, number][] = [["swipes", s.swipes], ["matches", s.matches], ["dates", s.dates], ["ghosted", s.ghosted], ["unmatched", s.unmatched], ["superLikes", s.supers]];
  cells.forEach(([label, n], i) => {
    const x = 200 + (i % 3) * 340, y = 990 + Math.floor(i / 3) * 170;
    g.fillStyle = "rgba(255,255,255,.18)";
    g.beginPath(); g.roundRect(x - 150, y - 90, 300, 150, 24); g.fill();
    g.fillStyle = "#fff";
    g.font = "700 64px 'Outfit', sans-serif";
    g.fillText(String(n), x, y);
    g.font = "500 30px Inter, sans-serif";
    g.fillText(t(`flinder.share.${label}`), x, y + 44);
  });
  g.font = "500 32px Inter, sans-serif";
  g.fillText(t("flinder.share.footer"), W / 2, 1310);
  return new Promise((r) => c.toBlob((b) => r(b!), "image/png"));
}

export const tweetText = (p: Profile, s: Stats) =>
  t("flinder.share.tweet", { name: p.name, swipes: s.swipes, matches: s.matches, dates: s.dates, ghosted: s.ghosted, rizz: rizz(s.swipes, s.matches, s.dates) });
