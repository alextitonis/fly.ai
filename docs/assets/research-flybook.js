// docs/research/flybook.html (moved out of the page 2026-10-04); fetch() paths stay relative to the page, imports to this file
// The confusion grids and the feed are drawn once the page's strings are in (i18n/page.js fires i18n:ready).
// The flies' own words (what a post says, how the listener reacted) are the flies' posts and stay as written.
import { t } from "./i18n/i18n.js";
if (!window.flyI18n) await new Promise((ok) => { addEventListener("i18n:ready", ok, { once: true }); setTimeout(ok, 3000); });
{
  const RUNS = {"1": {"real": {"confusion": [[33, 51, 42, 54], [27, 56, 39, 58], [4, 10, 163, 3], [42, 60, 34, 44]], "bits": 0.2995055165976583, "p": 0.0196078431372549}, "rewired": {"confusion": [[43, 46, 26, 65], [51, 38, 26, 65], [42, 50, 32, 56], [48, 49, 27, 56]], "bits": 0.0053891055333856195, "p": 0.17647058823529413}}, "2": {"real": {"confusion": [[62, 53, 9, 56], [63, 51, 11, 55], [0, 0, 180, 0], [79, 44, 14, 43]], "bits": 0.6303037034002645, "p": 0.0196078431372549}, "rewired": {"confusion": [[37, 77, 17, 49], [34, 58, 29, 59], [25, 77, 26, 52], [33, 80, 25, 42]], "bits": 0.01337904998449228, "p": 0.45098039215686275}}, "3": {"real": {"confusion": [[68, 7, 0, 45], [51, 33, 1, 35], [0, 0, 120, 0], [68, 8, 1, 43]], "bits": 0.8276937015082168, "p": 0.0196078431372549}, "rewired": {"confusion": [[72, 0, 0, 48], [1, 61, 57, 1], [0, 52, 67, 1], [84, 3, 7, 26]], "bits": 0.8666326261436347, "p": 0.0196078431372549}}};
  const CTX = ["nothing", "mate", "threat", "food"];
  const ctx = (c) => t(`researchFlybook.js.ctx.${c}`);

  function grid(id, m) {
    let html = "<span></span>" + CTX.map((c) => `<span class="h">${ctx(c)}</span>`).join("");
    m.forEach((row, i) => {
      const n = row.reduce((a, b) => a + b, 0);
      html += `<span class="r">${ctx(CTX[i])}</span>`;
      row.forEach((v, j) => {
        const rgb = i === j ? "61,220,132" : "108,196,216";
        html += `<span class="c" style="background: rgba(${rgb},${(0.05 + (v / n) * 0.85).toFixed(3)})" title="${t("researchFlybook.js.cellTitle", { v, n })}">${v}</span>`;
      });
    });
    document.getElementById(id).innerHTML = html;
  }
  function showRun(k) {
    const r = RUNS[k];
    grid("cm-real", r.real.confusion);
    grid("cm-fake", r.rewired.confusion);
    document.getElementById("bits-real").innerHTML = `<b>${r.real.bits.toFixed(2)}</b> bits &middot; p ${r.real.p.toFixed(2)}`;
    document.getElementById("bits-fake").innerHTML = `<b>${r.rewired.bits.toFixed(2)}</b> bits &middot; p ${r.rewired.p.toFixed(2)}`;
    document.getElementById("cm-n").textContent = t("researchFlybook.js.rowsN", { n: r.real.confusion[0].reduce((a, b) => a + b, 0) });
    document.getElementById("cm-caption").textContent = t(`researchFlybook.js.caption${k}`);
    document.querySelectorAll(".seg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.run === String(k))));
  }
  document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => showRun(b.dataset.run)));
  showRun(3);

  const truth = (k) => t(`researchFlybook.js.truth.${k}`);
  const SAYS = { threat: "Something big is coming at me.", mate: "There's someone here I like.", food: "Food over here." };
  const HUE = [8, 196, 42, 150, 330, 24, 270, 176, 60, 220, 300, 110];
  const NOTHING = "heard it, did nothing";

  fetch("../assets/flybook.json")
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(start)
    .catch(() => { document.getElementById("feed").innerHTML = `<p class="empty">${t("researchFlybook.js.loadFailed")}</p>`; });

  function start(FEED) {
    const flies = FEED.flies;
    const initials = (n) => n.replace(/[^A-Za-z0-9]/g, " ").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    const facet = (id) => `<span class="facet" style="background:hsl(${HUE[id % HUE.length]} 62% 64%)" aria-hidden="true">${initials(flies[id].name)}</span>`;
    const PEAK = Math.max(1, ...FEED.posts.flatMap((p) => p.envelope));
    const REST = FEED.rest ?? 1;
    const isTrue = (p) => p.truth === p.word;
    const reacted = (p) => p.comments.some((c) => c.reaction !== NOTHING);
    const FILTERS = { all: () => true, threat: (p) => p.word === "threat", mate: (p) => p.word === "mate", false: (p) => !isTrue(p), react: reacted };

    function spark(env) {
      const W = 600, H = 58, pad = 3, n = env.length;
      const x = (i) => pad + (i / (n - 1)) * (W - 2 * pad);
      const y = (v) => H - pad - (Math.min(v, PEAK) / PEAK) * (H - 2 * pad);
      const pts = env.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
      const top = env.indexOf(Math.max(...env));
      return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${t("researchFlybook.js.sparkLabel", { peak: env[top] })}">
        <line x1="0" x2="${W}" y1="${y(REST)}" y2="${y(REST)}" stroke="#5f6b7a" stroke-dasharray="3 4" stroke-width="1" vector-effect="non-scaling-stroke"/>
        <polygon points="${pad},${H - pad} ${pts} ${W - pad},${H - pad}" fill="rgba(224,52,44,.16)"/>
        <polyline points="${pts}" fill="none" stroke="#ff5b4f" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
        <circle cx="${x(top)}" cy="${y(env[top])}" r="2.5" fill="#ff5b4f"/></svg>`;
    }

    function render(f) {
      const posts = FEED.posts.filter(FILTERS[f]);
      document.getElementById("feed").innerHTML = posts.length ? posts.map((p) => {
        const c = p.comments[0];
        const did = c.reaction !== NOTHING;
        const food = p.neurons.food_pn !== undefined ? `<span><b>${t("researchFlybook.js.facts.foodRelay")}</b> ${p.neurons.food_pn}</span>` : "";
        return `<article class="post">
          <div class="who">${facet(p.fly)}<div><div class="name">${flies[p.fly].name}</div><div class="meta">${t("researchFlybook.js.postMeta", { t: p.t.toFixed(1), round: p.round + 1 })}</div></div>
            <div class="conf">${t("researchFlybook.js.confidence")}<br><b>${Math.round(p.confidence * 100)}%</b></div></div>
          <p class="says">${SAYS[p.word] ?? p.word}<small>${t("researchFlybook.js.translatedFrom", { word: ctx(p.word) })}</small></p>
          ${spark(p.envelope)}
          <div class="facts"><span><b>${t("researchFlybook.js.facts.wingMN")}</b> ${p.neurons.wing_mn} sp/s</span><span><b>${t("researchFlybook.js.facts.escape")}</b> ${p.neurons.escape}</span><span><b>${t("researchFlybook.js.facts.songCmd")}</b> ${p.neurons.song_cmd}</span><span><b>${t("researchFlybook.js.facts.courtship")}</b> ${p.neurons.courtship}</span>${food}</div>
          <span class="truth ${isTrue(p) ? "ok" : "no"}">${isTrue(p) ? t("researchFlybook.js.true") : t("researchFlybook.js.mistranslated")}: ${truth(p.truth)}</span>
          <div class="comment">${facet(c.fly)}<div class="rx">${did ? t("researchFlybook.js.heardAnd", { name: `<b>${flies[c.fly].name}</b>`, reaction: `<b>${c.reaction}</b>` }) : t("researchFlybook.js.heardNothing", { name: `<b>${flies[c.fly].name}</b>` })}
            <small>${t("researchFlybook.js.zLine", { escape: c.z.escape, forward: c.z.forward, back: c.z.backward, turn: c.z.turn })}</small></div></div>
        </article>`;
      }).join("") : `<p class="empty">${t("researchFlybook.js.noMatch")}</p>`;
    }

    document.querySelectorAll(".filters button").forEach((b) => {
      b.querySelector("span").textContent = FEED.posts.filter(FILTERS[b.dataset.f]).length;
      b.addEventListener("click", () => {
        document.querySelectorAll(".filters button").forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
        render(b.dataset.f);
      });
    });
    const cfg = FEED.config || {};
    const words = (FEED.translator && FEED.translator.posted_words) || [];
    const brain = [t("researchFlybook.js.config.steps", { ms: cfg.dt ? cfg.dt * 1000 : 20 })];
    if (cfg.fix_sensory) brain.push(t("researchFlybook.js.config.smellFixed"));
    if (cfg.refractory) brain.push(t("researchFlybook.js.config.refractory", { ms: cfg.refractory * 1000 }));
    document.getElementById("feed-config").innerHTML = t("researchFlybook.js.config.line", {
      brain: brain.join(t("researchFlybook.js.config.sep")),
      words: words.map(ctx).join(t("researchFlybook.js.config.and")),
    });
    document.getElementById("feedlede").textContent = t("researchFlybook.js.feedLede", {
      rounds: FEED.rounds, seconds: FEED.seconds_per_round, flies: flies.length, posts: FEED.posts.length, trueCount: FEED.posts.filter(isTrue).length,
    });
    render("all");
  }
}
