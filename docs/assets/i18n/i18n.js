/**
 * The site's languages: one small runtime shared by every page (the docs pages, the Simulation, Fly Radio,
 * Fly Roulette, Flinder, Flybook and compute). English is the default and the fallback.
 *
 * Strings live in JSON files next to this one, one folder per language and one file per part of the site
 * ("namespace"): en/common.json, en/roulette.json, ko/common.json ... A key is "<namespace>.<path>", so
 * t("roulette.spin") reads "spin" from <lang>/roulette.json. A string missing from a language falls back to
 * English, so a half-translated language still works. See README.md here to add a language or a string.
 *
 * The language is picked once per page load (?lang=xx, then the choice saved in localStorage "flyai.lang",
 * then English, which is then saved); changing it saves the choice and reloads, so no app has to re-render
 * on the fly.
 */

/** Every language the site offers. To add one: a line here and a folder of JSON files named by its code. */
export const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "zh-Hans", name: "简体中文" },
  { code: "zh-Hant", name: "繁體中文" },
  { code: "ko", name: "한국어" },
  { code: "tr", name: "Türkçe" },
  { code: "es", name: "Español" },
];

export const DEFAULT_LANG = "en";
const STORAGE_KEY = "flyai.lang";
const known = (code) => LANGUAGES.some((l) => l.code === code);

let lang = DEFAULT_LANG;
/** namespace -> strings, for the page's language and for English */
const dicts = { cur: {}, en: {} };

const store = {
  get() { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } },
  set(v) { try { localStorage.setItem(STORAGE_KEY, v); } catch { /* private mode: the choice lasts this page only */ } },
};

/** The page's language: ?lang=xx (saved for next time), then the saved choice, then English. */
export function detectLang() {
  let q = null;
  try { q = new URLSearchParams(location.search).get("lang"); } catch { /* no location (worker) */ }
  if (q && known(q)) { store.set(q); return q; }
  const saved = store.get();
  if (saved && known(saved)) return saved;
  store.set(DEFAULT_LANG); // nothing (or an unknown code) saved yet: English, saved as the choice
  return DEFAULT_LANG;
}

/** The current language code ("en", "zh-Hans", ...). Valid after init(). */
export const getLang = () => lang;

/** Saves a language and reloads the page in it (dropping any ?lang= so the saved choice wins). */
export function setLang(code) {
  if (!known(code)) return;
  store.set(code);
  const url = new URL(location.href);
  url.searchParams.delete("lang");
  if (url.href === location.href) location.reload();
  else location.replace(url.href);
}

const defaultBase = () => new URL("./", import.meta.url).href;

async function fetchJSON(url) {
  try {
    const r = await fetch(url);
    return r.ok ? await r.json() : {};
  } catch {
    return {};
  }
}

/**
 * Loads the strings a page needs. Await it before rendering text.
 *   ns:      namespaces to load, e.g. ["common", "roulette"]
 *   bundled: English strings already bundled into an app, { roulette: {...} }, so English never needs a fetch
 *   base:    URL of this folder when this file is bundled elsewhere (apps pass "/assets/i18n/")
 */
export async function init({ ns = ["common"], bundled = {}, base } = {}) {
  lang = detectLang();
  const root = base ?? defaultBase();
  const load = (code, name) => fetchJSON(`${root}${code}/${name}.json`);
  await Promise.all(ns.map(async (name) => {
    const [en, cur] = await Promise.all([
      bundled[name] ?? load(DEFAULT_LANG, name),
      lang === DEFAULT_LANG ? null : load(lang, name),
    ]);
    dicts.en[name] = en;
    dicts.cur[name] = cur ?? en;
  }));
  if (typeof document !== "undefined") document.documentElement.lang = lang;
  return lang;
}

const isPlural = (v) => v && typeof v === "object" && typeof v.other === "string";

function lookup(set, key) {
  const parts = key.split(".");
  let v = set[parts[0]];
  for (let i = 1; i < parts.length && v != null; i++) v = v[parts[i]];
  return typeof v === "string" || isPlural(v) ? v : undefined;
}

function format(v, vars, code) {
  if (isPlural(v)) {
    const n = Number(vars?.count ?? 0);
    const form = n === 0 && v.zero != null ? "zero" : new Intl.PluralRules(code).select(n);
    v = v[form] ?? v.other;
  }
  return vars ? v.replace(/\{(\w+)\}/g, (m, name) => (vars[name] != null ? String(vars[name]) : m)) : v;
}

/** Whether the page's language has its own string for this key (not the English fallback). */
export const has = (key) => lookup(dicts.cur, key) !== undefined && lang !== DEFAULT_LANG;

/**
 * The string for a key in the page's language, else English, else the key itself.
 * {name} placeholders are filled from vars; a value written as {"one": ..., "other": ...} picks the plural
 * form for vars.count (with an optional "zero").
 */
export function t(key, vars) {
  const cur = lookup(dicts.cur, key);
  if (cur !== undefined) return format(cur, vars, lang);
  const en = lookup(dicts.en, key);
  return en !== undefined ? format(en, vars, DEFAULT_LANG) : key;
}

/** The language as a locale for Intl (numbers, dates): "zh-Hans", "ko", ... */
export const locale = () => lang;

/**
 * Translates marked-up HTML in place (a no-op in English, whose text is already in the page):
 *   data-i18n="ns.key"                 the element's text
 *   data-i18n-html="ns.key"            the element's HTML (for strings with links or <b> inside)
 *   data-i18n-attr="title:ns.key; placeholder:ns.other"   attributes
 * Elements whose key this language lacks are left in English.
 */
export function translateDOM(root = document) {
  if (lang === DEFAULT_LANG) return;
  const all = (sel) => [...(root.matches?.(sel) ? [root] : []), ...root.querySelectorAll(sel)];
  for (const el of all("[data-i18n]")) {
    const key = el.getAttribute("data-i18n");
    if (lookup(dicts.cur, key) !== undefined) el.textContent = t(key);
  }
  for (const el of all("[data-i18n-html]")) {
    const key = el.getAttribute("data-i18n-html");
    if (lookup(dicts.cur, key) !== undefined) el.innerHTML = t(key);
  }
  for (const el of all("[data-i18n-attr]")) {
    for (const pair of el.getAttribute("data-i18n-attr").split(";")) {
      const [attr, key] = pair.split(":").map((s) => s.trim());
      if (attr && key && lookup(dicts.cur, key) !== undefined) el.setAttribute(attr, t(key));
    }
  }
}

/** The page route an href in the site nav points at: "/research/flybook.html" -> "research/flybook". */
function route(href) {
  let p;
  try { p = new URL(href, location.href).pathname; } catch { return null; }
  p = p.replace(/\.html$/, "").replace(/^\/+|\/+$/g, "");
  // docs pages opened from disk: keep the part after the site folder
  const docs = p.lastIndexOf("docs/");
  if (location.protocol === "file:" && docs >= 0) p = p.slice(docs + 5);
  return p === "" || p === "index" ? "home" : p;
}

/**
 * Translates the site's shared top nav (built by assets/nav.js on every page) by where each link goes, so the
 * nav needs no i18n markup of its own: common.nav.<route>.label / .desc, common.nav.menu.<id>.
 */
export function translateNav(nav = document.querySelector('nav[aria-label="Main"]')) {
  if (!nav || lang === DEFAULT_LANG) return;
  for (const btn of nav.querySelectorAll(".ddbtn[aria-controls]")) {
    const id = btn.getAttribute("aria-controls").replace(/^dd-/, "");
    const text = [...btn.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    if (text && has(`common.nav.menu.${id}`)) text.textContent = `${t(`common.nav.menu.${id}`)} `;
  }
  for (const h of nav.querySelectorAll(".mnav-h[data-menu]")) {      // the phone menu's group titles (nav.js)
    const id = h.dataset.menu;
    if (has(`common.nav.menu.${id}`)) h.textContent = t(`common.nav.menu.${id}`);
  }
  for (const a of nav.querySelectorAll("ul a")) {
    if (a.closest(".acct")) continue;                 // the account menu carries its own words (nav.js ACCT_TEXT)
    const r = a.href.startsWith("https://x.com/") ? "follow"
      : a.href.startsWith("https://opensea.io/") ? "opensea" : route(a.getAttribute("href"));
    if (!r) continue;
    const key = `common.nav.${r.replace(/\//g, "_")}`;
    const text = [...a.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    if (text && has(`${key}.label`)) text.textContent = t(`${key}.label`);
    const small = a.querySelector("small");
    if (small && has(`${key}.desc`)) small.textContent = t(`${key}.desc`);
    const pill = a.querySelector(".nav-new");          // nav.js's "New" pill
    if (pill && has("common.nav.newTag")) pill.textContent = t("common.nav.newTag");
  }
}

/** The site's shared footer: the license link and the standard data-credit line (common.footer.*). */
export function translateFooter(footer = document.querySelector("body > footer")) {
  if (!footer || lang === DEFAULT_LANG) return;
  for (const a of footer.querySelectorAll('a[href$="/LICENSE"]')) if (has("common.footer.license")) a.textContent = t("common.footer.license");
  for (const p of footer.querySelectorAll("p")) {
    if (p.textContent.trim().startsWith("Connectome data: MaleCNS") && has("common.footer.credit")) p.textContent = t("common.footer.credit");
  }
}

/**
 * A language menu: a <select> listing every language by its own name. Picking one saves it and reloads.
 * Returns the element; pass a host to append it there.
 */
export function languagePicker(host) {
  if (!document.getElementById("langpick-style")) {
    // looks at home in the site nav and in the apps' dark headers; a page can restyle .langpick
    const style = document.createElement("style");
    style.id = "langpick-style";
    style.textContent = ":where(.langpick){font:13px/1.2 Inter,system-ui,sans-serif;color:#c9d1db;background:#11161e;"
      + "border:1px solid #2a3340;border-radius:6px;padding:4px 6px;cursor:pointer;max-width:120px}"
      + ":where(.langpick):hover{color:#eef1f5;border-color:#3a4552}"
      + ":where(li.langli){display:flex;align-items:center}";
    document.head.append(style);
  }
  const sel = document.createElement("select");
  sel.className = "langpick";
  sel.setAttribute("aria-label", "Language");
  sel.title = "Language";
  for (const l of LANGUAGES) {
    const o = document.createElement("option");
    o.value = l.code;
    o.textContent = l.name;
    o.lang = l.code;
    if (l.code === lang) o.selected = true;
    sel.append(o);
  }
  sel.addEventListener("change", () => setLang(sel.value));
  host?.append(sel);
  return sel;
}

/** Puts the language menu at the end of the site's shared top nav, if the page has it. */
export function mountNavPicker(nav = document.querySelector('nav[aria-label="Main"]')) {
  const ul = nav?.querySelector(".wrap > ul");
  if (!ul || ul.querySelector(".langpick")) return;
  const li = document.createElement("li");
  li.className = "langli";
  languagePicker(li);
  // before the Follow button, which the pages hide on phones as the nav's last item
  const follow = [...ul.children].find((c) => c.querySelector("a.btn"));
  if (follow) follow.before(li);
  else ul.append(li);
  // phones: the bar has no room for it, so the ☰ panel carries its own (nav.js; the bar's one is hidden there in CSS)
  const panel = nav.querySelector("#mnav");
  if (panel && !panel.querySelector(".langpick")) {
    const box = document.createElement("div");
    box.className = "mnav-lang";
    languagePicker(box);
    panel.append(box);
  }
}

/** Lets the page show itself again once translated (see boot.js, which hides a non-English page until then). */
export function reveal() {
  if (typeof document !== "undefined") document.documentElement.classList.remove("i18n-pending");
}

/**
 * Everything a static page needs in one call: load common + its namespaces, translate the nav and the
 * marked-up HTML, add the language menu, show the page. Returns t for the page's own scripts.
 */
export async function setupPage({ ns = [], bundled, base } = {}) {
  try {
    await init({ ns: ["common", ...ns], bundled, base });
    translateNav();
    translateFooter();
    translateDOM();
    mountNavPicker();
  } finally {
    reveal();
  }
  return t;
}
