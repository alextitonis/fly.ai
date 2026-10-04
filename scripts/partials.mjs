#!/usr/bin/env node
/**
 * Stamps the shared footer and the compute tab bar into the pages, so each has one source but stays plain HTML
 * (crawlers, no JS). 2026-10-04. A page marks the spot and keeps the current markup between the markers, so it is
 * correct even unbuilt:
 *
 *   <!-- @footer --> ... <!-- /@footer -->          from docs/assets/partials/footer.html
 *   <!-- @tabs:jobs --> ... <!-- /@tabs -->         from mine/web/partials/tabs.html, class="on" on data-tab="jobs"
 *
 * The partial is indented like its opening marker. Idempotent: a second run changes nothing. Pages with a footer of
 * their own (docs/bounties.html, docs/research/flybook.html) carry no markers. scripts/vercel-build.sh runs this
 * before docs/ is copied and mine/scripts/build-web.mjs reads mine/web.
 *
 *   node scripts/partials.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PARTIALS = {
  footer: readFileSync(join(REPO, "docs/assets/partials/footer.html"), "utf8"),
  tabs: readFileSync(join(REPO, "mine/web/partials/tabs.html"), "utf8"),
};
const DIRS = ["docs", "docs/research", "mine/web"];
// <indent><!-- @name[:arg] -->\n ... <indent><!-- /@name -->
const MARKED = /^([ \t]*)<!-- @(footer|tabs)(?::([\w-]+))? -->\r?\n[\s\S]*?^[ \t]*<!-- \/@\2 -->/gm;

function render(name, arg) {
  let html = PARTIALS[name].replace(/\r\n/g, "\n").replace(/\n$/, "");
  if (name === "tabs") {
    if (!html.includes(`data-tab="${arg}"`)) throw new Error(`tabs: no tab "${arg}"`);
    html = html.replace(/<a data-tab="([\w-]+)" /g, (_, tab) => (tab === arg ? '<a class="on" ' : "<a "));
  }
  return html;
}

let changed = 0;
for (const dir of DIRS) {
  for (const f of readdirSync(join(REPO, dir)).filter((n) => n.endsWith(".html"))) {
    const path = join(REPO, dir, f);
    const before = readFileSync(path, "utf8");
    const nl = before.includes("\r\n") ? "\r\n" : "\n";
    const after = before.replace(MARKED, (_, indent, name, arg) => {
      const body = render(name, arg).split("\n").map((l) => (l ? indent + l : l));
      return [`${indent}<!-- @${name}${arg ? `:${arg}` : ""} -->`, ...body, `${indent}<!-- /@${name} -->`].join(nl);
    });
    if (after !== before) { writeFileSync(path, after); changed++; }
  }
}
console.log(`partials: ${changed} page(s) updated`);
