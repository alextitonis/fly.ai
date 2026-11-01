// npm test
import assert from "node:assert/strict";
import { LANGS, STRINGS, detectLang, setLang, t, type Lang } from "./i18n.ts";
import { NO_SEEN, PACE_PX, dayMood, paceTarget, readFlies, readPrice, tradeReaction, type Fly, type Trade } from "./mood.ts";

const trade = (at: number, side: string, pnl: number | null = null, usd = 5): Trade => ({ at, symbol: "ANY.300a", side, usd, tx: null, pnl_pct: pnl });
const fly = (trades: Trade[], profit = 0, value = 100, id = 318): Fly => ({ id, funded: true, value, profit, profit_pct: 0, profit_24h: 0, profit_7d: 0, active: true, trades });
const opts = { notify: true, minUsd: 0 };

// the first look is only a baseline
let r = readFlies(NO_SEEN, [fly([trade(10, "buy")], 1)], opts);
assert.equal(r.reactions.length, 0);
assert.equal(r.seen.lastAt[318], 10);

// a buy says what it bought; the ticker loses its suffix
r = readFlies(r.seen, [fly([trade(20, "buy"), trade(10, "buy")], 1)], opts);
assert.deepEqual(r.reactions.map((x) => [x.mood, x.text, x.notify]), [["buy", "#318 bought ANY for $5.00", true]]);

// the same trade isn't told twice
r = readFlies(r.seen, [fly([trade(20, "buy")], 1)], opts);
assert.equal(r.reactions.length, 0);

// sells react to their result
assert.equal(tradeReaction(1, trade(1, "sell", 4), true).mood, "happy");
assert.equal(tradeReaction(1, trade(1, "sell", 25), true).mood, "moon");
assert.equal(tradeReaction(1, trade(1, "sell", -4), true).mood, "sad");
assert.equal(tradeReaction(1, trade(1, "sell", -20), true).mood, "rugged");
assert.equal(tradeReaction(1, trade(1, "sell"), true).mood, "sell");
assert.equal(tradeReaction(1, trade(1, "sell", -4), true).text, "#1 sold ANY for $5.00 (-4.0%)");

// a burst is one line, with its strongest result
r = readFlies({ lastAt: { 318: 0 }, profit: 0 }, [fly([1, 2, 3].map((a) => trade(a, "sell", a === 2 ? -30 : 2)).concat(trade(4, "buy")))], opts);
assert.deepEqual(r.reactions.map((x) => [x.mood, x.text]), [["rugged", "4 new trades"]]);

// small trades can be filtered
r = readFlies({ lastAt: { 318: 0 }, profit: 0 }, [fly([trade(1, "buy", null, 1)])], { notify: true, minUsd: 2 });
assert.equal(r.reactions.length, 0);
assert.equal(r.seen.lastAt[318], 1);

// money moves: small ones wait and add up, then gain and loss animate
let seen = { lastAt: {}, profit: 10 };
r = readFlies(seen, [fly([], 10.5)], opts);
assert.equal(r.reactions.length, 0);
assert.equal(r.seen.profit, 10);
r = readFlies(r.seen, [fly([], 11.2)], opts);
assert.deepEqual(r.reactions.map((x) => [x.mood, x.text]), [["happy", "up $1.20!"]]);
assert.equal(r.seen.profit, 11.2);
assert.equal(readFlies(seen, [fly([], 16)], opts).reactions[0].mood, "moon");
assert.equal(readFlies(seen, [fly([], 8.5)], opts).reactions[0].mood, "sad");
assert.deepEqual(readFlies(seen, [fly([], 3)], opts).reactions.map((x) => [x.mood, x.text]), [["rugged", "down $7.00..."]]);

// several flies count together
assert.equal(readFlies(seen, [fly([], 8, 100, 1), fly([], 3, 100, 2)], opts).reactions.length, 0);

// the price: nothing until an hour of samples, then once
const H = 3_600_000;
let p = readPrice([], 1, 0);
assert.equal(p.reaction, null);
p = readPrice(p.samples, 1.5, H / 2);
assert.equal(p.reaction, null);
p = readPrice(p.samples, 1.04, H);
assert.equal(p.reaction?.mood, "happy");
assert.equal(p.reaction?.text, "$FLYAI +4.0% this hour");
assert.equal(p.samples.length, 1);
assert.equal(readPrice([{ at: 0, usd: 1 }], 0.8, H).reaction?.mood, "rugged");
assert.equal(readPrice([{ at: 0, usd: 1 }], 0.8, H).reaction?.notify, true);
assert.equal(readPrice([{ at: 0, usd: 1 }], 1.01, H).reaction, null);

// pacing stays near home, whatever the dice say, and inside the screen
for (const r of [0, 0.2, 0.5, 0.8, 1]) {
  const to = paceTarget(1000, 950, r, 0, 1800);
  assert.ok(Math.abs(to - 1000) <= PACE_PX, `${to}`);
}
assert.equal(paceTarget(1790, 1790, 1, 0, 1800), 1800);
assert.equal(paceTarget(5, 5, 0, 0, 1800), 0);

// the share card's picture
assert.equal(dayMood(10, 100), "moon");
assert.equal(dayMood(1, 100), "happy");
assert.equal(dayMood(-1, 100), "sad");
assert.equal(dayMood(-10, 100), "rugged");
assert.equal(dayMood(0, 0), "happy");

// every language says everything, with the same blanks
const blanks = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
for (const lang of Object.keys(LANGS) as Lang[]) {
  assert.deepEqual(Object.keys(STRINGS[lang]).sort(), Object.keys(STRINGS.en).sort(), lang);
  for (const k of Object.keys(STRINGS.en) as (keyof typeof STRINGS.en)[]) {
    assert.equal(blanks(STRINGS[lang][k]), blanks(STRINGS.en[k]), `${lang} ${k}`);
    assert.ok(STRINGS[lang][k].trim(), `${lang} ${k}`);
  }
}
assert.equal(detectLang("zh-TW"), "zh-Hant");
assert.equal(detectLang("zh-CN"), "zh-Hans");
assert.equal(detectLang("tr-TR"), "tr");
assert.equal(detectLang("fr-FR"), "en");
setLang("tr");
assert.equal(t("up", { usd: "$1.00" }), "$1.00 kazandık!");
assert.equal(tradeReaction(1, trade(1, "buy"), true).text, "#1 $5.00 karşılığında ANY aldı");
setLang("en");

console.log("all passed");
