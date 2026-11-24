// Expeditions (2026-11-18, EXPEDITIONS-PLAN.md phase 1; mine src/expeditions.ts): the fly goes on a timed trip and comes
// back with things to wear. The trip runs on the server's clock: here there's only a countdown, so it costs this PC
// nothing. This module draws the Expeditions card inside the fly's chat panel (talk.ts) and tells the pet (pet.ts) when
// the fly leaves, comes back, or puts something on.
import { t, type Key } from "./i18n.ts";
import { nameOf, span, tripState } from "./logic.ts";
import {
  expCached, expClaim, expEquip, expFeed, expRead, expRecycle, expStart, prefs, setExpCached, SignedOut,
  type ExpClaim, type ExpItem, type ExpSlot, type ExpView, type Names6,
} from "./store.ts";

const RECYCLE_XP = { common: 3, uncommon: 10, rare: 30, legendary: 100 } as const;
const RARITY_COLOR = { common: "#c9c9c9", uncommon: "#7cf5c4", rare: "#7aa7ff", legendary: "#ffcf5a" } as const;
const BAG_SLOTS: ExpSlot[] = ["hat", "wings", "trail", "bubble", "acc", "junk"];
const SITE = "https://www.flyaiworld.com";
const native = window.flyNative;
const openUrl = (url: string) => (native ? native.openUrl(url) : (window.open(url), Promise.resolve()));
/** an item's picture: its pixel art (public/items/<id>.png), or its glyph if the file isn't there */
export function itemArt(item: Pick<ExpItem, "id" | "glyph"> | undefined, px: number): HTMLElement {
  const img = document.createElement("img");
  img.className = "xp-art"; img.alt = ""; img.width = px; img.height = px; img.draggable = false;
  img.src = `items/${item?.id ?? "none"}.png`;
  img.addEventListener("error", () => { const s = document.createElement("span"); s.className = "xp-glyph"; s.style.fontSize = `${Math.round(px * 0.8)}px`; s.textContent = item?.glyph ?? "?"; img.replaceWith(s); });
  return img;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, any> = {}, ...kids: (Node | string | null | false | undefined)[]) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") e.className = v; else if (k === "style") e.setAttribute("style", v); else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v != null && v !== false) e.setAttribute(k, String(v));
  }
  e.append(...kids.filter((k): k is Node | string => k != null && k !== false));
  return e;
};
// nameOf and span live in logic.ts (pure, tested); kept exported from here for the other modules
export { nameOf, span };
const length = (minutes: number) => (minutes % 60 ? t("x.min", { n: minutes }) : t("x.hour", { n: minutes / 60 }));

export interface Expeditions {
  /** the Expeditions card (talk.ts shows it in place of the chat stream) */
  box: HTMLElement;
  /** the server's view (or the last one kept), for the pet's look and away state */
  view(): ExpView | null;
  load(): Promise<void>;
  render(): void;
  /** the day's feed (the tray's Feed and the card's button) */
  feed(): Promise<void>;
}

export function setupExpeditions(hooks: {
  changed: (v: ExpView | null) => void;            // the look or the trip changed
  left: (place: string, ms: number) => void;       // the fly just left
  claimed: (c: ExpClaim) => void;                  // its finds were opened
  fed: (xp: number) => void;                       // fed (the day's pet XP, 0 if it already ate)
  swat: () => void;                                // the swat game
  crumb: () => void;                               // the crumb game (issue #59)
  focus: () => void;                               // a 25-minute focus timer
  onSignedOut: () => void;
}): Expeditions {
  let v: ExpView | null = expCached(), busy = false, reveal: ExpClaim | null = null, tab: ExpSlot = "hat", picked: string | null = null;
  let note = "";
  const box = el("div", { class: "tk-exp", hidden: true });

  const itemOf = (id: string) => v?.items.find((i) => i.id === id);
  const placeName = (id: string) => { const p = v?.places.find((x) => x.id === id); return p ? nameOf(p.names) : id; };
  const fail = (e: unknown) => {
    if (e instanceof SignedOut) { hooks.onSignedOut(); return; }
    note = e instanceof Error ? e.message : String(e);
    render();
  };
  const set = (next: ExpView | null) => {
    v = next;
    setExpCached(next);
    hooks.changed(next);
  };

  async function load() {
    try { set(await expRead(prefs().fly)); } catch (e) { if (e instanceof SignedOut) hooks.onSignedOut(); }
    render();
  }

  async function go(place: string, minutes: number) {
    const fly = prefs().fly;
    if (fly == null || busy) return;
    busy = true; note = "";
    try {
      const r = await expStart(fly, place, minutes);
      reveal = null;
      await load();
      hooks.left(place, r.trip.ends_at - Date.now());
    } catch (e) { fail(e); } finally { busy = false; render(); }
  }
  async function claim() {
    if (busy) return;
    busy = true; note = "";
    try {
      reveal = await expClaim();
      await load();
      hooks.claimed(reveal);
    } catch (e) { fail(e); } finally { busy = false; render(); }
  }
  async function feedIt() {
    if (busy) return;
    busy = true; note = "";
    try {
      const r = await expFeed();
      hooks.fed(r.pet_xp);
      await load();
    } catch (e) { fail(e); } finally { busy = false; render(); }
  }
  /** a picture of a rare find to save and share: the fly, the item, its name and where it was found */
  async function shareCard(c: ExpClaim) {
    const best = [...c.items].map((id) => itemOf(id)).filter((i): i is ExpItem => !!i)
      .sort((a, b) => ["common", "uncommon", "rare", "legendary"].indexOf(b.rarity) - ["common", "uncommon", "rare", "legendary"].indexOf(a.rarity))[0];
    if (!best) return;
    const cv = document.createElement("canvas"); cv.width = 1200; cv.height = 630;
    const g = cv.getContext("2d")!;
    g.fillStyle = "#0b0b0b"; g.fillRect(0, 0, 1200, 630);
    g.fillStyle = RARITY_COLOR[best.rarity]; g.fillRect(0, 0, 1200, 10);
    g.imageSmoothingEnabled = false;
    const load_ = (src: string) => new Promise<HTMLImageElement | null>((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
    const [fly, art] = await Promise.all([load_("avatars/default/idle.gif"), load_(`items/${best.id}.png`)]);
    if (fly) g.drawImage(fly, 90, 150, 360, 360);
    if (art) g.drawImage(art, 520, 170, 192, 192); else { g.font = "160px 'Segoe UI Emoji'"; g.fillText(best.glyph, 520, 330); }
    g.fillStyle = "#9a9a9a"; g.font = "600 30px 'Segoe UI', system-ui, sans-serif";
    g.fillText(t("x.cardFound"), 520, 120);
    g.fillStyle = RARITY_COLOR[best.rarity]; g.font = "800 58px 'Segoe UI', system-ui, sans-serif";
    g.fillText(nameOf(best.names), 520, 440);
    g.fillStyle = "#ffffff"; g.font = "500 30px 'Segoe UI', system-ui, sans-serif";
    g.fillText(`${t(`x.r.${best.rarity}` as Key)} · ${placeName(c.place)}`, 520, 490);
    g.fillStyle = "#7cf5c4"; g.font = "700 28px 'Segoe UI', system-ui, sans-serif";
    g.fillText("flyaiworld.com/flypet", 520, 560);
    const url = cv.toDataURL("image/png");
    if (native) await native.saveImage(url);
    else { const a = document.createElement("a"); a.href = url; a.download = `flypet-${best.id}.png`; a.click(); }
  }
  async function wear(item: ExpItem, on: boolean) {
    if (busy || item.slot === "junk") return;
    busy = true; note = "";
    try {
      const r = await expEquip(item.slot, on ? item.id : null);
      if (v) set({ ...v, me: { ...v.me, equipped: r.equipped, sets: r.sets } });
    } catch (e) { fail(e); } finally { busy = false; render(); }
  }
  async function recycle(item: ExpItem) {
    if (busy) return;
    busy = true; note = "";
    try {
      await expRecycle(item.id, 1);
      await load();
    } catch (e) { fail(e); } finally { busy = false; render(); }
  }

  // ---- drawing ------------------------------------------------------------------------------------------------------
  const glyph = (item: ExpItem | undefined, big = false) => itemArt(item, big ? 32 : 20);
  function head() {
    const me = v!.me, span_ = Math.max(1, me.next_xp - me.level_xp), pct = Math.min(100, Math.round(((me.pet_xp - me.level_xp) / span_) * 100));
    return el("div", { class: "xp-head" },
      el("div", { class: "tk-row" }, el("b", {}, t("x.level", { n: me.level })), el("span", { class: "tk-mute tk-grow" }, ` ${t("x.xpBar", { xp: me.pet_xp, next: me.next_xp })}`)),
      el("div", { class: "xp-bar" }, el("i", { style: `width:${pct}%` })),
      el("div", { class: "tk-mute" }, t("x.trips", { left: me.stamina.left, max: me.stamina.max }), me.stamina.streak > 1 ? ` · ${t("x.streak", { n: me.stamina.streak })}` : ""),
      v!.stats ? el("div", { class: "tk-mute xp-stats", title: t("x.statsHelp") }, t("x.stats", v!.stats as any)) : null);
  }
  function trip() {
    const tr = v!.me.trip!;
    const { left, done, pct } = tripState(tr, Date.now());
    return el("div", { class: "tk-card xp-trip" },
      el("b", {}, done ? t("x.back", { place: placeName(tr.place) }) : t("x.away", { place: placeName(tr.place) })),
      done ? el("button", { class: "tk-btn", type: "button", disabled: busy, onclick: () => void claim() }, t("x.open"))
        : el("div", {}, el("div", { class: "xp-bar" }, el("i", { style: `width:${pct}%` })), el("span", { class: "tk-mute xp-left" }, t("x.backIn", { time: span(left) }))),
      // phase 2: bring it home now with a $FLYAI burn, made on the site (the pet holds no key)
      !done && v!.me.speedup && v!.me.speedup.flyai != null && v!.me.speedup.used < v!.me.speedup.max
        ? el("div", { class: "tk-actions" }, el("button", { class: "tk-btn sm plain", type: "button", onclick: () => void openUrl(`${SITE}/flypet-boost`) },
            t("x.speed", { n: v!.me.speedup.flyai.toLocaleString() })),
          el("span", { class: "tk-mute" }, t("x.speedNote", { left: v!.me.speedup.max - v!.me.speedup.used, max: v!.me.speedup.max })))
        : null);
  }
  function swarm() {
    const sw = v!.swarm;
    if (!sw) return null;
    const next = sw.tiers.find((x) => !x.reached), top = next ?? sw.tiers[sw.tiers.length - 1]!;
    const pct = Math.min(100, Math.round((sw.trips / Math.max(1, top.trips)) * 100));
    return el("div", { class: "xp-swarm" },
      el("div", { class: "tk-row" }, el("b", { class: "tk-grow" }, t("x.swarm", { n: sw.trips.toLocaleString(), goal: top.trips.toLocaleString() })),
        ...sw.tiers.map((x) => el("span", { class: `xp-tier${x.reached ? " on" : ""}`, title: nameOf(itemOf(x.item)?.names ?? ["", "", "", "", "", ""] as any) }, glyph(itemOf(x.item))))),
      el("div", { class: "xp-bar" }, el("i", { style: `width:${pct}%` })),
      el("span", { class: "tk-mute" }, t(sw.took_part ? "x.swarmIn" : "x.swarmJoin")));
  }
  function toys() {
    const fed = !!v!.me.fed_today;
    return el("div", { class: "tk-actions xp-toys" },
      el("button", { class: "tk-chip", type: "button", disabled: busy || fed, onclick: () => void feedIt() }, fed ? t("x.fed") : t("x.feed", { n: 5 })),
      el("button", { class: "tk-chip", type: "button", disabled: !!v!.me.trip, onclick: () => hooks.swat() }, t("x.swat")),
      el("button", { class: "tk-chip", type: "button", disabled: !!v!.me.trip, onclick: () => hooks.crumb() }, t("x.crumb")),
      el("button", { class: "tk-chip", type: "button", disabled: !!v!.me.trip, onclick: () => hooks.focus() }, t("x.focus")));
  }
  function revealCard() {
    const r = reveal!;
    return el("div", { class: "tk-card xp-reveal" },
      el("b", {}, r.swatted ? t("x.swatted") : t("x.found")),
      el("div", { class: "xp-finds" }, ...r.items.map((id) => {
        const it = itemOf(id);
        return el("span", { class: "xp-find", style: `border-color:${RARITY_COLOR[it?.rarity ?? "common"]}`, title: it ? t(`x.r.${it.rarity}` as Key) : "" },
          glyph(it), el("span", {}, it ? nameOf(it.names) : id));
      })),
      r.green && !r.swatted ? el("span", { class: "tk-up" }, t("x.green")) : null,
      ...(r.swarm ?? []).map((id) => el("b", { class: "tk-up" }, t("x.swarmTier", { item: itemOf(id) ? nameOf(itemOf(id)!.names) : id }))),
      r.items.some((id) => ["rare", "legendary"].includes(itemOf(id)?.rarity ?? "")) || (r.swarm ?? []).length
        ? el("button", { class: "tk-btn sm plain", type: "button", onclick: () => void shareCard({ ...r, items: [...r.items, ...(r.swarm ?? [])] }) }, t("x.share")) : null,
      el("span", { class: "tk-mute" }, t("x.gained", { n: r.pet_xp }), r.xp ? ` · ${t("x.season", { n: r.xp })}` : ""),
      r.leveled ? el("b", { class: "tk-up" }, t("x.levelUp", { n: r.level }), ...r.opened.map((p) => ` ${t("x.opened", { place: placeName(p) })}`)) : null);
  }
  function places() {
    const noTrips = v!.me.stamina.left <= 0;
    return el("div", { class: "xp-places" }, el("b", {}, t("x.places")),
      noTrips ? el("span", { class: "tk-mute" }, t("x.noTrips")) : null,
      ...v!.places.map((p) => el("div", { class: `xp-place${p.open ? "" : " locked"}` },
        el("span", { class: "tk-grow" }, nameOf(p.names), el("br"),
          el("span", { class: "tk-mute" }, !p.open ? t("x.locked", { n: p.level }) : p.risk > 0 ? `⚠ ${t("x.risky")}` : "")),
        ...(p.open ? p.lengths.map((m) => el("button", { class: "tk-btn sm", type: "button", disabled: busy || noTrips || prefs().fly == null,
          onclick: () => void go(p.id, m) }, length(m))) : []))));
  }
  function bag() {
    const me = v!.me;
    const has = new Map(me.bag.map((b) => [b.item, b.n]));
    const items = v!.items.filter((i) => i.slot === tab && has.has(i.id));
    const sel = picked ? itemOf(picked) : undefined;
    const worn = (i: ExpItem) => i.slot !== "junk" && me.equipped[i.slot as Exclude<ExpSlot, "junk">] === i.id;
    return el("div", { class: "xp-bag" },
      el("div", { class: "tk-row" }, el("b", { class: "tk-grow" }, t("x.bag")),
        ...me.sets.map((s) => { const set_ = v!.sets.find((x) => x.id === s); return el("span", { class: "tk-up tk-mute" }, t("x.setOn", { set: set_ ? nameOf(set_.names) : s })); })),
      el("div", { class: "tk-chips xp-tabs" }, ...BAG_SLOTS.map((s) => el("button", { class: `tk-chip${tab === s ? " on" : ""}`, type: "button",
        onclick: () => { tab = s; picked = null; render(); } }, t(`x.slot.${s}` as Key)))),
      items.length ? el("div", { class: "xp-grid" }, ...items.map((i) => el("button", {
        class: `xp-tile${worn(i) ? " worn" : ""}${picked === i.id ? " picked" : ""}`, type: "button", title: nameOf(i.names),
        style: `border-color:${RARITY_COLOR[i.rarity]}`, onclick: () => { picked = picked === i.id ? null : i.id; render(); } },
        glyph(i, true), (has.get(i.id) ?? 0) > 1 ? el("small", {}, `×${has.get(i.id)}`) : null)))
        : el("p", { class: "tk-mute" }, t("x.empty")),
      sel && has.has(sel.id) ? el("div", { class: "tk-card" },
        el("div", { class: "tk-row" }, glyph(sel, true), el("span", { class: "tk-grow" }, el("b", {}, nameOf(sel.names)), el("br"),
          el("span", { style: `color:${RARITY_COLOR[sel.rarity]}` }, t(`x.r.${sel.rarity}` as Key)))),
        el("div", { class: "tk-actions" },
          sel.slot !== "junk" ? el("button", { class: "tk-btn sm", type: "button", disabled: busy, onclick: () => void wear(sel, !worn(sel)) }, t(worn(sel) ? "x.takeOff" : "x.wear")) : null,
          el("button", { class: "tk-btn sm plain", type: "button", disabled: busy, onclick: () => void recycle(sel) }, t("x.recycle", { n: RECYCLE_XP[sel.rarity] })))) : null);
  }
  function render() {
    if (box.hidden) return;
    const keep = box.scrollTop;
    if (!v) { box.replaceChildren(el("p", { class: "tk-mute" }, prefs().fly == null ? t("x.needFly") : t("p.loading"))); return; }
    if (!v.on) { box.replaceChildren(el("p", { class: "tk-mute" }, t("x.off"))); return; }
    const parts: (HTMLElement | null)[] = [head(), toys(), reveal ? revealCard() : null, v.me.trip ? trip() : places(), swarm(), bag(),
      note ? el("p", { class: "tk-down tk-mute" }, note) : null];
    box.replaceChildren(...parts.filter((n): n is HTMLElement => !!n));
    box.scrollTop = keep;
  }
  // while the card shows a trip in flight, a fresh read every 20 s: a speed-up made on the site shows here
  setInterval(() => { if (!box.hidden && v?.me.trip && v.me.trip.ends_at > Date.now() && !busy) void load(); }, 20_000);
  // the countdown, only while the card is on screen: the time and the bar in place; a full redraw once it's back
  let wasDone = false;
  setInterval(() => {
    const tr = v?.me.trip;
    if (box.hidden || !tr) return;
    const { left, done, pct } = tripState(tr, Date.now());
    if (done !== wasDone) { wasDone = done; render(); return; }
    const txt = box.querySelector(".xp-left"), bar = box.querySelector<HTMLElement>(".xp-trip .xp-bar i");
    if (txt) txt.textContent = t("x.backIn", { time: span(left) });
    if (bar) bar.style.width = `${pct}%`;
  }, 1000);

  return { box, view: () => v, load, render, feed: feedIt };
}
