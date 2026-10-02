# Site languages

Every page on flyaiworld.com (the docs pages, Simulation, Fly Radio, Fly Roulette, Flinder, Flybook, Compute)
takes its text from the JSON files here. English is the default and the fallback. Content the flies write
(Flybook posts, comments, radio chatter) is never translated.

```
i18n.js        the runtime (ES module): LANGUAGES, init, t, translateDOM, the nav/footer, the language menu
i18n.d.ts      its types, for the TypeScript apps that bundle it
boot.js        <head> script for pages with static text: hides a non-English page until it is translated
page.js        the docs pages' setup (<html data-i18n-ns="token"> names the page's strings file)
en/            English, the source of truth: one file per part of the site ("namespace")
zh-Hans/ zh-Hant/ ko/ tr/ es/    the same files, translated
```

The language is chosen in the menu at the end of the site nav (or in each app's header). It is saved in
localStorage `flyai.lang`; with nothing saved the site is English and `"en"` is saved. `?lang=ko` in a link
opens a page in that language and saves it. Changing language reloads the page.

## Add a language

1. Add a line to `LANGUAGES` in `i18n.js`: `{ code: "ja", name: "日本語" }` (a BCP 47 code; `name` in the
   language itself).
2. Copy `en/` to `ja/` and translate the values. Keep the keys, the `{placeholders}` and any HTML tags
   exactly as they are; translate only the words.
3. `node scripts/i18n-check.mjs` lists anything missing or broken. A missing string shows in English, so a
   language can go live half done.

## Add or change a string

Keys are `<namespace>.<path>`: `t("roulette.bet.spin")` reads `bet.spin` from `<lang>/roulette.json`.

- **In code**: `import { t } from ".../docs/assets/i18n/i18n.js"` and use `t("ns.key", { name })`. A value
  like `"{count} flies"` is filled from vars; a plural is written `{ "one": "{count} fly", "other": "{count} flies" }`
  and picked by `vars.count`.
- **In HTML**: `data-i18n="ns.key"` (text), `data-i18n-html="ns.key"` (text with links or `<b>` in it),
  `data-i18n-attr="title:ns.key; placeholder:ns.other"` (attributes). The English stays in the HTML too, so
  English pages need no script at all.
- Add the English to `en/<namespace>.json`, then the other languages (or leave them: they fall back to English).

The shared top nav (one copy, in `assets/nav.js`, which every page renders into its empty `<nav aria-label="Main">`)
and the footer are translated by where their links go (`common.nav.<route>`), so they need no i18n markup.

## Wiring a page

- Docs page: `<html lang="en" data-i18n-ns="mypage">`, `<script src="assets/i18n/boot.js"></script>` in
  `<head>`, `<script type="module" src="assets/i18n/page.js"></script>` at the end of `<body>`.
- App (Vite/TypeScript): bundle English with `import en from ".../en/myapp.json"` (and `en/common.json`),
  then before rendering `await setupPage({ ns: ["myapp"], bundled: { common, myapp: en }, base: "/assets/i18n/" })`
  (or `init` + your own language menu with `languagePicker(host)` when the app has no site nav). Build
  constant label lists inside functions, not at module level: module code runs before `init`.

## Check

`node scripts/i18n-check.mjs`: missing strings are warnings (they show in English); a broken placeholder or
HTML tag, a key the code uses that English lacks, or bad JSON is an error.
