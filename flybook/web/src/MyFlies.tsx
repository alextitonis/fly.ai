import { useEffect, useState } from "react";
import type { Viewer } from "./Account";
import { getMemeQuota, type MemeQuota } from "./api";
import { loadFlyPosts, loadMemes, memeImage, type Fly, type Meme, type Patch, type Post } from "./feed";
import { useNextMemeCountdown } from "./Memes";
import { WORDS, actionText, causeText, line, strongest } from "./words";
import { Html, ago, t, tAt } from "./i18n";

type Filter = "all" | Post["kind"];
/** labels: flybook.mine.filters.<key>.label (plural, the buttons), .one (a post's badge), .help */
const FILTERS: Filter[] = ["all", "hallucination", "misread", "sense", "action"];

/** What the post says and what really happened, in the feed's words. */
function summary(p: Post, flies: Map<string, Fly>): { headline: string; really: string } {
  const did = strongest(p.actions).map(actionText).join(" and ");
  const really = p.cause
    ? causeText(p.cause.channel, flies.get(p.cause.from_fly_id)?.name ?? "a neighbour", p.cause.strength)
    : WORDS[p.truth]?.really ?? p.truth;
  switch (p.kind) {
    case "hallucination": return { headline: line(p.word, false, p.id), really: "Hallucination: nothing was there" };
    case "misread": return { headline: line(p.word, false, p.id), really: `Misread: really ${really}` };
    case "action": return { headline: `*${did || "twitches"}*`, really: p.truth === "nothing" && !p.cause ? "No reason at all" : `Because of ${really}` };
    default: return { headline: line(p.word, true, p.id), really: `Read it right: ${really}` };
  }
}

/**
 * My flies: every post of the signed-in person's flies in one list, with filters for the meme-worthy ones and a
 * Make meme button on each. Shows today's meme allowance and the memes already made.
 */
export default function MyFlies({ allFlies, patches, viewer, now, memeTick, onMeme, onFly }: {
  allFlies: Fly[]; patches: Map<string, Patch>; viewer: Viewer; now: number; memeTick: number;
  onMeme: (post: Post) => void; onFly: (id: string) => void;
}) {
  const mine = viewer ? allFlies.filter((f) => f.owner === viewer.userId) : [];
  const ids = mine.map((f) => f.id).sort().join(",");
  const byId = new Map(allFlies.map((f) => [f.id, f]));
  const [flyFilter, setFlyFilter] = useState<string>("all");
  const [kind, setKind] = useState<Filter>("all");
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<MemeQuota | null>(null);
  const [memes, setMemes] = useState<Meme[]>([]);
  const countdown = useNextMemeCountdown();
  // the allowance resets at 00:00 UTC: ask again when the UTC date changes (the countdown re-renders every second)
  const utcDay = new Date().toISOString().slice(0, 10);
  useEffect(() => {
    if (viewer?.ready) getMemeQuota().then(setQuota).catch(() => {});
  }, [utcDay]);

  useEffect(() => {
    if (!viewer || !ids) return;
    setPosts(null);
    setError(null);
    const chosen = flyFilter === "all" ? ids.split(",") : [flyFilter];
    loadFlyPosts(chosen, { kind: kind === "all" ? undefined : kind })
      .then(setPosts)
      .catch((e) => setError(e?.message ?? String(e)));
  }, [viewer?.userId, ids, flyFilter, kind]);
  useEffect(() => {
    if (!viewer?.ready) return;
    getMemeQuota().then(setQuota).catch(() => setQuota(null));
    loadMemes({ userId: viewer.userId, limit: 30 }).then(setMemes);
  }, [viewer?.userId, viewer?.ready, memeTick]);

  if (!viewer) {
    return <div className="mine-tab"><div className="empty">{t("flybook.mine.signIn")}</div></div>;
  }
  if (mine.length === 0) {
    return (
      <div className="mine-tab">
        <Html as="p" className="empty" k="flybook.mine.noFly" />
      </div>
    );
  }

  const canMake = !!quota?.holder && quota.left_today > 0 && quota.global_left > 0;
  const status = !quota ? t("flybook.mine.checking")
    : !quota.holder ? t("flybook.mine.holdToMeme")
    : quota.global_left < 1 ? t("flybook.mine.outOfPaint", { time: countdown })
    : quota.left_today > 0 ? t("flybook.mine.oneToday")
    : t("flybook.mine.madeToday", { time: countdown });

  return (
    <div className="mine-tab">
      <div className="feed-head">
        <h2>{t("flybook.mine.title")}</h2>
        <p>{t("flybook.mine.every", { count: mine.length })}</p>
      </div>
      <div className={`card meme-status${canMake ? " ready" : ""}`}>🎨 {status}</div>

      <div className="board-controls">
        <div className="seg">
          <button className={flyFilter === "all" ? "on" : ""} onClick={() => setFlyFilter("all")}>{t("flybook.mine.allMyFlies")}</button>
          {mine.map((f) => (
            <button key={f.id} className={flyFilter === f.id ? "on" : ""} onClick={() => setFlyFilter(f.id)}>
              <span className="dot" style={{ background: f.color }} /> {f.name}
            </button>
          ))}
        </div>
        <div className="seg">
          {FILTERS.map((x) => (
            <button key={x} className={kind === x ? "on" : ""} title={tAt("flybook.mine.filters", x, "help")} onClick={() => setKind(x)}>
              {tAt("flybook.mine.filters", x, "label")}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="err">{error}</p>}
      {posts === null && !error && <div className="empty">{t("flybook.mine.loadingPosts")}</div>}
      {posts !== null && posts.length === 0 && <div className="empty">{t("flybook.mine.noPosts")}</div>}
      {posts !== null && posts.length > 0 && (
        <ul className="mine-posts">
          {posts.map((p) => {
            const fly = byId.get(p.fly_id);
            const s = summary(p, byId);
            return (
              <li key={p.id} className={`mine-post kind-${p.kind}`}>
                <div className="mine-main">
                  <div className="mine-top">
                    <button className="who" onClick={() => onFly(p.fly_id)}>
                      <span className="dot" style={{ background: fly?.color ?? "#888" }} />
                      {fly?.name ?? t("flybook.mine.aFly")}
                    </button>
                    <span className={`badge kind-badge kind-${p.kind}`}>{FILTERS.includes(p.kind) ? tAt("flybook.mine.filters", p.kind, "one") : p.kind}</span>
                    <span className="where">{t("flybook.mine.in", { patch: patches.get(p.patch_id)?.name ?? p.patch_id })}</span>
                    <span className="when">{ago(p.created_at, now)}</span>
                  </div>
                  <p className="says">{s.headline}</p>
                  <p className="fine">{s.really}{p.actions.length ? ` · ${strongest(p.actions).map(actionText).join(", ")}` : ""}</p>
                </div>
                <button className="btn red meme-make" disabled={!canMake} onClick={() => onMeme(p)}
                        title={canMake ? t("flybook.mine.memeTitle") : status}>
                  {t("flybook.mine.makeMeme")}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {memes.length > 0 && (
        <div className="meme-gallery mine-memes">
          <h5>{t("flybook.mine.yourMemes")}</h5>
          <div className="meme-strip">
            {memes.map((m) => (
              <a key={m.id} href={`#meme-${m.id}`} onClick={(e) => { e.preventDefault(); window.open(memeImage(m), "_blank", "noopener"); }}
                 title={t("flybook.mine.memeLikes", { top: m.top_text, bottom: m.bottom_text, n: m.likes_all ?? 0 })}>
                <img src={memeImage(m)} alt={m.top_text} loading="lazy" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
