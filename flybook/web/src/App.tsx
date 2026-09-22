import { useCallback, useEffect, useMemo, useState } from "react";
import Account, { type Viewer } from "./Account";
import Arena from "./Arena";
import HowItWorks from "./HowItWorks";
import Leaderboard from "./Leaderboard";
import { MemeCard, MemeGallery, MemeMaker } from "./Memes";
import Missions from "./Missions";
import Market from "./Market";
import Merch, { ClaimWelcome, setStoredClaim } from "./Merch";
import MyFlies from "./MyFlies";
import PatchView from "./PatchView";
import Relationships from "./Relationships";
import { Caption, Comments } from "./PostSocial";
import { pokePatch, setLike, setMemeLike } from "./api";
import { badgesFor, type Badge, type BoardRow } from "./badges";
import {
  BASE, coinImage, fetchPost, loadMerchAwards, type MerchAward, likeCount, load, loadBoard, loadCoinLogos, loadComments, loadDuels, loadFlies, loadMatings, loadMemes, loadPokes,
  loadPositions, loadReplays, loadSocial, myLikes, myMemeLikes, subscribe, tuning, type Duel, type Fly, type FlyCoin, type MarketSocial,
  type Mating, type Meme, type Patch, type Poke, type Post, type Replay, type Snapshot,
} from "./feed";
import { postUrl, saveCard, shareOnX } from "./share";
import { SLOW, loadTrace, play, useVoiceStyle } from "./voice";
import { POKES, WORDS, actionText, causeText, joinActions, line, ordinal, pick, strongest, word } from "./words";
import { LanguageMenu, ago, locale, t, tAt, tOr, tn } from "./i18n";

const SCIENCE_URL = "/research/flybook";
const SITE_URL = "/";
type View = "feed" | "board" | "arena" | "mine" | "market" | "friends" | "merch";
const CLAIM_HASH = /^#claim-([A-Za-z0-9-]{4,16})$/;

const pct = (x: number) => `${Math.round(x * 100)}%`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const viewOf = (hash: string): View =>
  hash === "#leaderboard" ? "board" : hash === "#arena" ? "arena" : hash === "#mine" ? "mine" : hash === "#market" ? "market" : hash === "#friends" ? "friends" : hash === "#merch" ? "merch" : "feed";

/** Extra context about a post from the rest of the feed: the same word several times in a row, a round-number post. */
type PostContext = { streak: number; number?: number };

/** Patch names and blurbs come from the server in English: show them in the page's language when we have it. */
const localize = (s: Snapshot): Snapshot => ({
  ...s,
  patches: s.patches.map((p) => ({
    ...p, name: tOr(`flybook.patches.${p.id}.name`, p.name), blurb: tOr(`flybook.patches.${p.id}.blurb`, p.blurb),
  })),
});

const MILESTONES = new Set([10, 50, 100, 250, 500, 1000, 2500, 5000, 10000]);

/** A post's headline and detail line, from what the brain read, what the fly did, and what caused it. */
function describe(post: Post, flies: Map<string, Fly>, ctx: PostContext = { streak: 1 }):
  { headline: string; detail: string; tone: "ok" | "miss" | "dream" | "plain" } {
  const did = joinActions(strongest(post.actions));
  const really = post.cause
    ? causeText(post.cause.channel, flies.get(post.cause.from_fly_id)?.name ?? "a neighbour", post.cause.strength)
    : WORDS[post.truth]?.really ?? post.truth;
  const streak = ctx.streak >= 3 && post.word !== "nothing" ? ` ${cap(ordinal(ctx.streak))} ${word(post.word).tag} read in a row.` : "";
  switch (post.kind) {
    case "hallucination":
      return {
        headline: line(post.word, false, post.id),
        detail: pick([`Hallucination: nothing was there${did ? `, but it ${did}` : ""}.`,
                      `Nothing happened. Its brain made that up${did ? `, and it ${did}` : ""}.`,
                      `No ${word(post.word).tag} anywhere${did ? `. It ${did} anyway` : ""}.`], post.id, 1) + streak,
        tone: "dream",
      };
    case "misread":
      return {
        headline: line(post.word, false, post.id),
        detail: pick([`Misread: really ${really}${did ? `. It ${did}` : ""}.`,
                      `Not quite: it was ${really}${did ? `. It ${did}` : ""}.`,
                      `Wrong guess. Really ${really}${did ? `, and it ${did}` : ""}.`], post.id, 1) + streak,
        tone: "miss",
      };
    case "action":
      return {
        headline: `${cap(did || "moved")}.`,
        detail: post.cause ? pick([`Reacting to ${really}.`, `Set off by ${really}.`], post.id, 1)
          : post.truth === "nothing" ? pick(["Nothing happened. Its brain did this on its own.", "No reason at all. Just its neurons."], post.id, 1)
          : `Really: ${really}. It didn't put a word to it.`,
        tone: "plain",
      };
    default:
      return {
        headline: line(post.word, true, post.id),
        detail: pick([`Really: ${really}${did ? `. Then it ${did}` : ""}.`,
                      `Right: ${really}${did ? `. It ${did}` : ""}.`,
                      `Read it right, ${really}${did ? `. It ${did}` : ""}.`], post.id, 1) + streak,
        tone: "ok",
      };
  }
}

/** One row of the feed: a post (with any identical posts folded into it), or something that happened. */
type FeedItem =
  | { type: "post"; at: string; post: Post; folded: Post[] }
  | { type: "duels"; at: string; duels: Duel[] }        // duels that finished within DUEL_ROUND_MS of each other
  | { type: "mating"; at: string; mating: Mating }
  | { type: "hatch"; at: string; fly: Fly }
  | { type: "meme"; at: string; meme: Meme }
  | { type: "launch"; at: string; event: MarketSocial }      // a fly launched its own coin
  | { type: "drama"; at: string; events: MarketSocial[] };   // one market round's shills, FUD, buybacks and dumps

const FOLD_MS = 30 * 60_000;
const DUEL_ROUND_MS = 2 * 60_000;
const foldKey = (p: Post) => `${p.kind}|${p.word}|${p.truth}|${strongest(p.actions, 1)[0]?.key ?? ""}`;

export default function App() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [patch, setPatch] = useState("all");
  const [flyId, setFlyId] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const [now, setNow] = useState(Date.now());
  const [viewer, setViewer] = useState<Viewer>(null);
  const [liked, setLiked] = useState<Set<number>>(new Set());
  const [likeError, setLikeError] = useState<string | null>(null);
  const [board, setBoard] = useState<Map<string, BoardRow>>(new Map());
  const [pokes, setPokes] = useState<Poke[]>([]);
  const [pokeMsg, setPokeMsg] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [replays, setReplays] = useState<Map<string, { tickId: number; replay: Replay }>>(new Map());
  const [commentTicks, setCommentTicks] = useState<Map<number, number>>(new Map());
  const [liveDuel, setLiveDuel] = useState<Duel | null>(null);
  const [duels, setDuels] = useState<Duel[]>([]);
  const [matings, setMatings] = useState<Mating[]>([]);
  const [memes, setMemes] = useState<Meme[]>([]);
  const [memeLiked, setMemeLiked] = useState<Set<number>>(new Set());
  const [memeFor, setMemeFor] = useState<Post | null>(null);
  const [bondsFor, setBondsFor] = useState<string | null>(null);   // a fly id, or "*" for everyone's web
  const [social, setSocial] = useState<MarketSocial[]>([]);
  const [coinInfo, setCoinInfo] = useState<Map<string, FlyCoin>>(new Map());
  const [memeTick, setMemeTick] = useState(0);
  const [boardAt, setBoardAt] = useState(0);            // newest post id when the board totals were read
  const [unfolded, setUnfolded] = useState<Set<number>>(new Set());
  const [view, setView] = useState<View>(() => viewOf(location.hash));
  // a merch thank-you card links to #claim-CODE: keep the code (sign-in reloads the page) and say hello
  const [welcome, setWelcome] = useState<string | null>(null);
  const [awards, setAwards] = useState<MerchAward[]>([]);   // Fly of the month winners, for the 🏆 on their profile
  useEffect(() => { loadMerchAwards().then(setAwards); }, []);
  useEffect(() => {
    const take = () => {
      const m = location.hash.match(CLAIM_HASH);
      if (!m) return;
      const code = m[1].replace(/-/g, "").toUpperCase();
      setStoredClaim(code);
      setWelcome(code);
      history.replaceState(null, "", `${location.pathname}${location.search}#feed`);
    };
    take();
    window.addEventListener("hashchange", take);
    return () => window.removeEventListener("hashchange", take);
  }, []);
  const [focus, setFocus] = useState<number | null>(() => {
    const m = location.hash.match(/^#post-(\d+)$/);
    return m ? Number(m[1]) : null;
  });

  useEffect(() => {
    if (!viewer) {
      setMemeLiked(new Set());
      return setLiked(new Set());
    }
    myLikes(viewer.userId).then(setLiked);
    myMemeLikes(viewer.userId).then(setMemeLiked);
  }, [viewer?.userId]);

  useEffect(() => {
    const onHash = () => {
      const post = location.hash.match(/^#post-(\d+)$/);
      if (post) {
        setView("feed");
        setFocus(Number(post[1]));
      } else if (["#leaderboard", "#arena", "#feed", "#mine", "#market", "#friends", "#merch"].includes(location.hash)) setView(viewOf(location.hash));
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const reload = useCallback(() => {
    load().then((s) => setSnap(localize(s))).catch((e) => setError(e?.message ?? String(e)));
  }, []);
  useEffect(reload, [reload]);
  const refreshBoard = useCallback((newestPost: number) => {
    loadBoard().then((b) => {
      setBoard(b);
      setBoardAt(newestPost);
    });
  }, []);
  const refreshEvents = useCallback(() => {
    loadDuels(40).then(setDuels);
    loadMatings(30).then(setMatings);
    loadSocial(80).then(setSocial);
    loadCoinLogos().then(setCoinInfo);
  }, []);
  const refreshMemes = useCallback(() => {
    loadMemes({ limit: 40 }).then(setMemes);
    setMemeTick((n) => n + 1);
  }, []);
  useEffect(refreshMemes, [refreshMemes]);
  useEffect(() => {
    loadPokes().then(setPokes);
    loadReplays().then(setReplays);
    refreshEvents();
  }, [refreshEvents]);
  useEffect(() => {
    if (snap && !boardAt) refreshBoard(snap.posts[0]?.id ?? 0);
  }, [!!snap]);
  useEffect(() => {
    if (!liveDuel) return;
    setDuels((ds) => [liveDuel, ...ds.filter((d) => d.id !== liveDuel.id)]);
  }, [liveDuel]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(
    () =>
      subscribe({
        onPost: (p) => {
          setSnap((s) => s && { ...s, posts: [p, ...s.posts.filter((x) => x.id !== p.id)].slice(0, 300) });
          setFresh((f) => new Set(f).add(p.id));
          setNow(Date.now());
        },
        onTick: (t) => {
          if (!t.finished_at) return;
          const { replay, ...rest } = t;
          setSnap((s) => s && { ...s, tick: rest });
          if (replay) {
            setReplays((m) => {
              const next = new Map(m);
              for (const [pid, r] of Object.entries(replay)) next.set(pid, { tickId: t.id, replay: r });
              return next;
            });
          }
          setSnap((s) => {
            refreshBoard(s?.posts[0]?.id ?? 0);
            return s;
          });
          refreshEvents();
          loadPositions().then((where) =>
            setSnap((s) => s && { ...s, flies: s.flies.map((f) => (where.has(f.id) ? { ...f, ...where.get(f.id) } : f)) }),
          );
        },
        onLike: (postId) => {
          likeCount(postId).then((n) =>
            setSnap((s) => s && { ...s, posts: s.posts.map((p) => (p.id === postId ? { ...p, likes: n } : p)) }),
          );
        },
        onPoke: (poke) => setPokes((ps) => [poke, ...ps.filter((x) => x.id !== poke.id)].slice(0, 50)),
        onComment: (postId) => {
          loadComments(postId).then((items) =>
            setSnap((s) => s && { ...s, posts: s.posts.map((p) => (p.id === postId ? { ...p, comments: items.length } : p)) }),
          );
          setCommentTicks((m) => new Map(m).set(postId, (m.get(postId) ?? 0) + 1));
        },
        onCaption: (postId, body) =>
          setSnap((s) => s && { ...s, posts: s.posts.map((p) => (p.id === postId ? { ...p, caption: body } : p)) }),
        onDuel: (duel) => {
          setLiveDuel(duel);
          if (duel.status === "done") loadFlies().then((fs) => setSnap((s) => s && { ...s, flies: fs }));
        },
        onMeme: refreshMemes,
        onMarket: refreshEvents,
      }),
    [],
  );

  // a link to one post (#post-123): show everything, fetch it if it's older than the feed, scroll to it
  useEffect(() => {
    if (!snap || focus === null) return;
    const target = focus;
    const reveal = () => {
      setPatch("all");
      setFlyId(null);
      setFresh((f) => new Set(f).add(target));
      setTimeout(() => document.getElementById(`post-${target}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 80);
      setFocus(null);
    };
    if (snap.posts.some((p) => p.id === target)) return reveal();
    fetchPost(target).then((p) => {
      if (p) setSnap((s) => s && { ...s, posts: [...s.posts, p].sort((a, b) => b.id - a.id) });
      reveal();
    });
  }, [!!snap, focus]);

  useEffect(() => setArmed(null), [patch]);

  const flies = useMemo(() => new Map((snap?.flies ?? []).map((f) => [f.id, f])), [snap?.flies]);
  const patches = useMemo(() => new Map((snap?.patches ?? []).map((p) => [p.id, p])), [snap?.patches]);
  const stats = useMemo(() => {
    const m = new Map<string, { reads: number; true: number }>();
    for (const p of snap?.posts ?? []) {
      if (p.correct === null || p.correct === undefined) continue;
      const s = m.get(p.fly_id) ?? { reads: 0, true: 0 };
      s.reads += 1;
      s.true += p.correct ? 1 : 0;
      m.set(p.fly_id, s);
    }
    return m;
  }, [snap?.posts]);

  // streaks (the same word several reads in a row) and post numbers (from the board's per-fly total)
  const context = useMemo(() => {
    const out = new Map<number, PostContext>();
    const byFly = new Map<string, Post[]>();
    for (const p of [...(snap?.posts ?? [])].sort((a, b) => a.id - b.id)) {
      const list = byFly.get(p.fly_id) ?? [];
      list.push(p);
      byFly.set(p.fly_id, list);
    }
    for (const [flyId, list] of byFly) {
      const total = board.get(flyId)?.posts;
      const counted = list.filter((p) => p.id <= boardAt).length;
      let streak = 0;
      list.forEach((p, i) => {
        streak = i > 0 && p.word !== "nothing" && list[i - 1].word === p.word ? streak + 1 : 1;
        const number = total !== undefined && boardAt ? total - counted + i + 1 : undefined;
        out.set(p.id, { streak, number: number !== undefined && MILESTONES.has(number) ? number : undefined });
      });
    }
    return out;
  }, [snap?.posts, board, boardAt]);

  if (error) return <Shell><div className="empty">{t("flybook.app.loadError", { error })}</div></Shell>;
  if (!snap) return <Shell><div className="empty">{t("flybook.app.waking")}</div></Shell>;

  const toggleLike = async (post: Post) => {
    if (!viewer?.ready) return;
    const want = !liked.has(post.id);
    const show = (likes: number, on: boolean) => {
      setLiked((l) => {
        const next = new Set(l);
        if (on) next.add(post.id);
        else next.delete(post.id);
        return next;
      });
      setSnap((s) => s && { ...s, posts: s.posts.map((p) => (p.id === post.id ? { ...p, likes } : p)) });
    };
    const before = post.likes ?? 0;
    show(Math.max(0, before + (want ? 1 : -1)), want);
    setLikeError(null);
    try {
      const res = await setLike(post.id, want);
      show(res.likes, res.liked);
    } catch (e) {
      show(before, !want);
      setLikeError(e instanceof Error ? e.message : String(e));
    }
  };

  const toggleMemeLike = async (meme: Meme) => {
    if (!viewer?.ready) return;
    const want = !memeLiked.has(meme.id);
    const mark = (on: boolean) => setMemeLiked((l) => {
      const next = new Set(l);
      if (on) next.add(meme.id);
      else next.delete(meme.id);
      return next;
    });
    mark(want);
    setLikeError(null);
    try {
      const res = await setMemeLike(meme.id, want);
      mark(res.liked);
      setMemes((ms) => ms.map((m) => (m.id === meme.id ? { ...m, likes_all: res.likes } : m)));
    } catch (e) {
      mark(!want);
      setLikeError(e instanceof Error ? e.message : String(e));
    }
  };

  const dropPoke = async (x: number, y: number) => {
    if (patch === "all" || !armed) return;
    setPokeMsg(null);
    try {
      await pokePatch(patch, armed, x, y);
      setPokeMsg(t("flybook.app.pokeSent"));
      setArmed(null);
    } catch (e) {
      setPokeMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const shown = snap.posts.filter((p) => (patch === "all" || p.patch_id === patch) && (!flyId || p.fly_id === flyId));

  // the feed: posts, with a fly's identical posts within FOLD_MS folded into the newest, plus real events
  const items: FeedItem[] = [];
  const open = new Map<string, { key: string; item: Extract<FeedItem, { type: "post" }>; oldest: number }>();
  for (const p of shown) {                                        // newest first
    const key = foldKey(p);
    const group = open.get(p.fly_id);
    const t = Date.parse(p.created_at);
    if (group && group.key === key && group.oldest - t <= FOLD_MS && !unfolded.has(group.item.post.id)) {
      group.item.folded.push(p);
      group.oldest = t;
      continue;
    }
    const item = { type: "post" as const, at: p.created_at, post: p, folded: [] as Post[] };
    open.set(p.fly_id, { key, item, oldest: t });
    items.push(item);
  }
  const oldestShown = shown.length ? shown[shown.length - 1].created_at : new Date(0).toISOString();
  const inView = (ids: (string | null)[], patchId?: string) =>
    (!flyId || ids.includes(flyId)) && (patch === "all" || patchId === patch);
  // the worker settles several duels each tick: one card per round, not one per duel
  const settled = duels
    .filter((d) => d.status === "done" && d.done_at && d.done_at >= oldestShown && inView([d.a_fly, d.b_fly], flies.get(d.a_fly)?.patch_id))
    .sort((a, b) => b.done_at!.localeCompare(a.done_at!));
  let round: Duel[] = [];
  const closeRound = () => {
    if (round.length) items.push({ type: "duels", at: round[0].done_at!, duels: round });
    round = [];
  };
  for (const d of settled) {
    if (round.length && Date.parse(round[round.length - 1].done_at!) - Date.parse(d.done_at!) > DUEL_ROUND_MS) closeRound();
    round.push(d);
  }
  closeRound();
  for (const m of matings) {
    const child = m.child ? flies.get(m.child) : undefined;
    if (m.created_at >= oldestShown && inView([m.a_fly, m.b_fly, m.child], child?.patch_id)) items.push({ type: "mating", at: m.created_at, mating: m });
  }
  for (const f of snap.flies) {
    if (f.owner && !f.auto_born && f.created_at && f.created_at >= oldestShown && inView([f.id], f.patch_id)) {
      items.push({ type: "hatch", at: f.created_at, fly: f });
    }
  }
  for (const m of memes) {
    if (m.created_at >= oldestShown && inView([m.fly_id], flies.get(m.fly_id)?.patch_id)) items.push({ type: "meme", at: m.created_at, meme: m });
  }
  // the fly market's drama: each launch is its own card, a round's shills/FUD/buybacks/dumps share one card
  const rounds = new Map<string, MarketSocial[]>();
  for (const e of social) {
    if (e.created_at < oldestShown || !inView([e.fly_id], e.fly_id ? flies.get(e.fly_id)?.patch_id : undefined)) continue;
    if (e.kind === "launch") items.push({ type: "launch", at: e.created_at, event: e });
    else rounds.set(String(e.round_id ?? e.id), [...(rounds.get(String(e.round_id ?? e.id)) ?? []), e]);
  }
  for (const events of rounds.values()) {
    const newest = events.reduce((a, b) => (a.created_at > b.created_at ? a : b));
    items.push({ type: "drama", at: newest.created_at, events });
  }
  items.sort((a, b) => b.at.localeCompare(a.at));
  const activePatch = patches.get(patch);
  const activeFly = flyId ? flies.get(flyId) : undefined;
  const house = snap.flies.filter((f) => !f.owner);
  const community = snap.flies
    .filter((f) => f.owner && f.active !== false)
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    .slice(0, 30);
  const waiting = pokes.filter((p) => p.patch_id === patch && !p.consumed_at);
  const patchFlies = snap.flies.filter((f) => f.patch_id === patch && f.active !== false);
  const shownReplay = replays.get(patch);

  const flyRow = (f: Fly) => {
    const s = stats.get(f.id);
    const earned = badgesFor(board.get(f.id));
    return (
      <li key={f.id}>
        <button onClick={() => { setFlyId(f.id); location.hash = "feed"; }} className={flyId === f.id ? "on" : ""}>
          <span className="dot" style={{ background: f.color }} />
          <span className="name">{f.name}</span>
          {earned.length > 0 && <span className="stars" title={earned.map((b) => tAt("flybook.badges", b.key, "label")).join(", ")}>★{earned.length}</span>}
          <span className="rate" title={t("flybook.app.rateTitle")}>
            {s ? `${s.true}/${s.reads}` : t("flybook.app.quiet")} · {f.elo ?? 1000}
          </span>
        </button>
      </li>
    );
  };

  return (
    <Shell live={snap.live}>
      <div className="layout">
        <aside className="patches">
          <h4>{t("flybook.app.patches")}</h4>
          <button className={patch === "all" ? "on" : ""} onClick={() => setPatch("all")}>{t("flybook.app.everywhere")}</button>
          {snap.patches.map((p) => (
            <button key={p.id} className={patch === p.id ? "on" : ""} onClick={() => { setPatch(p.id); if (view !== "feed") location.hash = "feed"; }}>
              {p.name}
              {pokes.some((x) => x.patch_id === p.id && !x.consumed_at) && <span className="pending-dot" title={t("flybook.app.pokeOnWay")} />}
            </button>
          ))}
        </aside>

        <main className="feed">
          <div className="views" role="tablist">
            <a href="#feed" role="tab" aria-selected={view === "feed"} className={view === "feed" ? "on" : ""}>{t("flybook.app.tabs.feed")}</a>
            <a href="#arena" role="tab" aria-selected={view === "arena"} className={view === "arena" ? "on" : ""}>{t("flybook.app.tabs.arena")}</a>
            {snap.live && (
              <a href="#friends" role="tab" aria-selected={view === "friends"} className={view === "friends" ? "on" : ""}>{t("flybook.app.tabs.friends")}</a>
            )}
            <a href="#market" role="tab" aria-selected={view === "market"} className={view === "market" ? "on" : ""}>{t("flybook.app.tabs.market")}</a>
            <a href="#merch" role="tab" aria-selected={view === "merch"} className={view === "merch" ? "on" : ""}>{t("flybook.app.tabs.merch")}</a>
            <a href="#leaderboard" role="tab" aria-selected={view === "board"} className={view === "board" ? "on" : ""}>{t("flybook.app.tabs.leaderboard")}</a>
            {viewer && (
              <a href="#mine" role="tab" aria-selected={view === "mine"} className={view === "mine" ? "on" : ""}>{t("flybook.app.tabs.mine")}</a>
            )}
          </div>
          {view === "merch" && <Merch flies={snap.flies} viewer={viewer} onFly={(id) => { setFlyId(id); location.hash = "feed"; }} />}
          {view === "market" && <Market viewer={viewer} onFly={(id) => { setFlyId(id); location.hash = "feed"; }} />}
          {view === "mine" && (
            <MyFlies allFlies={snap.flies} patches={patches} viewer={viewer} now={now} memeTick={memeTick}
                     onMeme={setMemeFor} onFly={(id) => { setFlyId(id); location.hash = "feed"; }} />
          )}
          {view === "board" && (
            <Leaderboard patches={snap.patches} patch={patch} viewerId={viewer?.userId}
                         onFly={(id) => { setFlyId(id); location.hash = "feed"; }} />
          )}
          {view === "arena" && <Arena flies={snap.flies} viewer={viewer} liveDuel={liveDuel} />}
          {view === "friends" && snap.live && (
            <Relationships inline fly={flyId ? flies.get(flyId) ?? null : null} flies={flies} onClose={() => {}}
                           onFly={(id) => { setFlyId(id); location.hash = "feed"; }} />
          )}
          {view === "feed" && (
            <>
              <div className="feed-head">
                <h2>
                  {activeFly ? activeFly.name : activePatch ? activePatch.name : t("flybook.app.everywhere")}
                  {activeFly && awards.filter((a) => a.fly_id === activeFly.id).map((a) => (
                    <a key={a.month} className="trophy" href="#merch" title={t("flybook.app.trophyTitle", { month: new Date(a.month).toLocaleDateString(locale(), { month: "long", year: "numeric", timeZone: "UTC" }) })}>
                      {t("flybook.app.flyOfMonth")}
                    </a>
                  ))}
                </h2>
                <p>
                  {activeFly
                    ? t("flybook.app.flyLine", { gen: activeFly.generation ?? 1, elo: activeFly.elo ?? 1000, w: activeFly.wins ?? 0, l: activeFly.losses ?? 0, d: activeFly.draws ?? 0 }) +
                      (activeFly.parents?.length ? t("flybook.app.childOf", { parents: activeFly.parents.map((id) => flies.get(id)?.name ?? t("flybook.app.aFly")).join(" × ") }) : "")
                    : activePatch?.blurb ?? t("flybook.app.intro")}
                </p>
                {activeFly && <button className="chip clear" onClick={() => setFlyId(null)}>{t("flybook.app.showAll")}</button>}
                {activeFly && snap.live && (
                  <button className="chip clear bonds-btn" onClick={() => setBondsFor(activeFly.id)}>{t("flybook.app.bonds")}</button>
                )}
                {activeFly && snap.live && <MemeGallery flyId={activeFly.id} refreshKey={memeTick} />}
                {snap.live && activePatch && !activeFly && (
                  <>
                    <PatchView flies={patchFlies} replay={shownReplay?.replay} tickId={shownReplay?.tickId}
                               waiting={waiting} armed={armed} onPoke={dropPoke} />
                    <div className="pokebar">
                      <span className="pokebar-label">{t("flybook.app.pokePatch", { patch: activePatch.name })}</span>
                      {POKES.map((pk) => (
                        <button key={pk.stimulus} className={`poke${armed === pk.stimulus ? " on" : ""}`} disabled={!viewer?.ready}
                                onClick={() => setArmed(armed === pk.stimulus ? null : pk.stimulus)}
                                title={viewer?.ready ? tAt("flybook.pokes", pk.stimulus, "hint") : t("flybook.app.signInToPoke")}>
                          {tAt("flybook.pokes", pk.stimulus, "label")}
                        </button>
                      ))}
                      {armed && <span className="fine inline">{t("flybook.app.clickMap")}</span>}
                      {waiting.length > 0 && <span className="fine inline">{t("flybook.app.pokesOnWay", { count: waiting.length })}</span>}
                      {pokeMsg && <span className="fine inline">{pokeMsg}</span>}
                    </div>
                  </>
                )}
                {snap.live && !activePatch && !activeFly && (
                  <p className="fine">{t("flybook.app.pickPatch")}</p>
                )}
              </div>
              {likeError && <p className="err">{likeError}</p>}
              {shown.length === 0 && (
                <div className="empty">
                  {snap.flies.some((f) => f.active !== false)
                    ? t("flybook.app.noPosts")
                    : t("flybook.app.noFlies")}
                </div>
              )}
              {items.map((item) => {
                if (item.type === "meme") {
                  const m = item.meme;
                  return <MemeCard key={`meme-${m.id}`} meme={m} fly={flies.get(m.fly_id)} now={now} viewerId={viewer?.userId}
                                   canLike={!!viewer?.ready} liked={memeLiked.has(m.id)} onLike={() => toggleMemeLike(m)}
                                   onFly={setFlyId} onChanged={refreshMemes} />;
                }
                if (item.type !== "post") {
                  const id = item.type === "duels" ? item.duels[0].id : item.type === "mating" ? item.mating.id
                    : item.type === "launch" ? item.event.id : item.type === "drama" ? item.events[0].id : item.fly.id;
                  return <EventCard key={`${item.type}-${id}`} item={item} flies={flies} patches={patches} now={now} onFly={setFlyId}
                                    coins={coinInfo} />;
                }
                const p = item.post;
                return (
                  <PostCard key={p.id} post={p} flies={flies} patch={patches.get(p.patch_id)} now={now}
                            fresh={fresh.has(p.id)} onFly={setFlyId} liked={liked.has(p.id)} viewer={viewer}
                            onLike={() => toggleLike(p)} badges={badgesFor(board.get(p.fly_id))} commentTick={commentTicks.get(p.id) ?? 0}
                            ctx={context.get(p.id)} folded={item.folded}
                            onUnfold={() => setUnfolded((u) => new Set(u).add(p.id))}
                            onMeme={viewer?.holder && flies.get(p.fly_id)?.owner === viewer.userId ? () => setMemeFor(p) : undefined}
                            onBonds={snap.live ? setBondsFor : undefined}
                            parent={p.cause ? snap.posts.find((q) => q.tick_id === p.tick_id && q.fly_id === p.cause!.from_fly_id) : undefined} />
                );
              })}
            </>
          )}
        </main>

        {memeFor && (
          <MemeMaker post={memeFor} fly={flies.get(memeFor.fly_id)} onClose={() => setMemeFor(null)} onMade={refreshMemes} />
        )}
        {bondsFor && (
          <Relationships fly={bondsFor === "*" ? null : flies.get(bondsFor) ?? null} flies={flies} onClose={() => setBondsFor(null)}
                         onFly={(id) => { setFlyId(id); location.hash = "feed"; }} />
        )}
        <aside className="side">
          {welcome && <ClaimWelcome code={welcome} onClose={() => setWelcome(null)} />}
          <Account patches={snap.patches} live={snap.live} onCreated={reload} onViewer={setViewer} house={house} />
          <HowItWorks />
          {snap.live && <Missions viewer={viewer} />}

          <section className="card">
            <h4>{t("flybook.app.flies")}</h4>
            {snap.live && community.length > 1 && (
              <button className="more bonds-open" onClick={() => setBondsFor("*")}>{t("flybook.app.whoFriends")}</button>
            )}
            {house.length + community.length === 0 ? (
              <p className="fine">{t("flybook.app.noFliesSide")}</p>
            ) : (
              <>
                {house.length > 0 && <ul className="flies">{house.map(flyRow)}</ul>}
                {community.length > 0 && <ul className="flies">{community.map(flyRow)}</ul>}
              </>
            )}
          </section>

          {snap.tick && (
            <section className="card">
              <h4>{t("flybook.app.vocab")}</h4>
              <ul className="vocab">
                {Object.entries(snap.tick.translator.precision)
                  .filter(([w]) => w !== "nothing")
                  .sort((a, b) => b[1] - a[1])
                  .map(([w, q]) => (
                    <li key={w} className={snap.tick!.translator.postable.includes(w) ? "" : "muted"}>
                      <span className="chip">{word(w).tag}</span>
                      <span className="bar"><i style={{ width: pct(q) }} /></span>
                      <span className="mono">{pct(q)}</span>
                    </li>
                  ))}
              </ul>
              <p className="fine">
                {t("flybook.app.vocabNote", { tick: snap.tick.id, flies: snap.tick.flies, posts: snap.tick.posts })}
              </p>
            </section>
          )}
        </aside>
      </div>
    </Shell>
  );
}

/** Something that happened to flies, not a read: a duel settled, two flies had a baby, a holder hatched a fly. */
function EventCard({ item, flies, patches, now, onFly, coins }: {
  item: Exclude<FeedItem, { type: "post" } | { type: "meme" }>; flies: Map<string, Fly>; patches: Map<string, Patch>; now: number;
  onFly: (id: string) => void; coins: Map<string, FlyCoin>;
}) {
  const who = (id: string | null) => {
    const f = id ? flies.get(id) : undefined;
    return f ? <button className="who inline" onClick={() => onFly(f.id)}><span className="dot" style={{ background: f.color }} />{f.name}</button>
      : <b>{t("flybook.event.aFly")}</b>;
  };
  const flyName = (id: string) => flies.get(id)?.name ?? t("flybook.event.aFly");
  let icon = "", body: React.ReactNode = null, detail = "";
  const ms = (step: number | null) => (step === null ? t("flybook.event.held") : t("flybook.event.ms", { n: step }));
  const result = (d: Duel) => {
    const loser = d.winner === d.a_fly ? d.b_fly : d.a_fly;
    const kind = t(d.kind === "quickdraw" ? "flybook.event.quickdraw" : "flybook.event.stare");
    return d.winner ? tn("flybook.event.beat", { winner: who(d.winner), loser: who(loser), kind })
      : tn("flybook.event.drew", { a: who(d.a_fly), b: who(d.b_fly), kind });
  };
  const market = <a className="more inline-link" href="#market">{t("flybook.event.seeMarket")}</a>;
  if (item.type === "launch") {
    const e = item.event;
    const coin = coins.get(e.symbol);
    return (
      <article className="post event event-launch">
        {coin?.image_path && <img className="feed-coin" src={coinImage(coin.image_path)} alt={t("flybook.event.logoAlt", { symbol: e.symbol })} loading="lazy" />}
        <div>
          <p className="event-line">
            <span className="event-icon">🚀</span> {tn("flybook.event.launched", { who: who(e.fly_id), coin: <b>${e.symbol}</b> })}
            {coin?.name ? <> · {coin.name}</> : null}{(e.detail.number ?? 1) > 1 ? t("flybook.event.secondCoin") : ""}
            <span className="when">{ago(item.at, now)}</span>
          </p>
          <p className="fine">
            {e.detail.tagline ? `“${e.detail.tagline}” ` : ""}
            {e.reach > 0 ? t("flybook.event.reach", { count: e.reach }) : ""}{market}
          </p>
        </div>
      </article>
    );
  }
  if (item.type === "drama") {
    const ONE: Record<string, string> = { enemies: t("flybook.event.enemy"), frenemies: t("flybook.event.frenemy"), rivals: t("flybook.event.rival") };
    const order = ["dump", "buyback", "fud", "shill"];
    const events = [...item.events].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
    return (
      <article className="post event event-drama">
        <p className="event-line">
          <span className="event-icon">📈</span> {t("flybook.event.drama", { count: events.length })}
          <span className="when">{ago(item.at, now)}</span>
        </p>
        <ul className="round">
          {events.map((e) => (
            <li key={e.id}>
              {e.kind === "shill" && <>{tn("flybook.event.shilling", { who: who(e.fly_id), coin: <b>${e.symbol}</b> })}{e.reach > 0 ? t("flybook.event.shillReach", { n: e.reach }) : ""}</>}
              {e.kind === "fud" && <>{tn("flybook.event.fud", { who: who(e.fly_id), coin: <b>${e.symbol}</b> })}
                {e.detail.creator && e.detail.bond && ONE[e.detail.bond] ? tn("flybook.event.madeBy", { bond: ONE[e.detail.bond], creator: who(e.detail.creator) }) : null}</>}
              {e.kind === "buyback" && tn("flybook.event.buyback", { who: who(e.fly_id), coin: <b>${e.symbol}</b> })}
              {e.kind === "dump" && tn("flybook.event.dump", { who: who(e.fly_id), coin: <b>${e.symbol}</b> })}
            </li>
          ))}
        </ul>
        <p className="fine">{market}</p>
      </article>
    );
  }
  if (item.type === "duels" && item.duels.length === 1) {
    const d = item.duels[0];
    icon = "⚔";
    body = result(d);
    detail = `${flyName(d.a_fly)} ${ms(d.a_step)} · ${flyName(d.b_fly)} ${ms(d.b_step)}` +
      (d.delta ? t("flybook.event.eloDelta", { n: Math.abs(d.delta) }) : "") + (d.requested_by ? t("flybook.event.playerChallenge") : "");
  } else if (item.type === "duels") {
    icon = "⚔";
    body = <>{t("flybook.event.duelsRound", { n: item.duels.length })}</>;
    return (
      <article className="post event event-duels">
        <p className="event-line"><span className="event-icon">{icon}</span> {body} <span className="when">{ago(item.at, now)}</span></p>
        <ul className="round">
          {item.duels.map((d) => (
            <li key={d.id}>{result(d)} <span className="fine">{t("flybook.event.vs", { a: ms(d.a_step), b: ms(d.b_step) })}{d.requested_by ? t("flybook.event.challenge") : ""}</span></li>
          ))}
        </ul>
      </article>
    );
  } else if (item.type === "mating") {
    const m = item.mating;
    const child = m.child ? flies.get(m.child) : undefined;
    icon = "🥚";
    body = tn("flybook.event.baby", { a: who(m.a_fly), b: who(m.b_fly), child: who(m.child) });
    detail = t(m.trigger === "brain" ? "flybook.event.metInPatch" : "flybook.event.pairedByWorker") +
      (child?.generation ? t("flybook.event.generation", { n: child.generation }) : "") +
      (child?.patch_id ? t("flybook.event.hatchedIn", { patch: patches.get(child.patch_id)?.name ?? child.patch_id }) : "");
  } else {
    const f = item.fly;
    icon = "🐣";
    body = tn("flybook.event.hatched", { who: who(f.id), patch: patches.get(f.patch_id)?.name ?? f.patch_id });
    detail = f.parents?.length ? t("flybook.event.bredFrom", { parents: f.parents.map(flyName).join(" × ") }) : t("flybook.event.newFly");
  }
  return (
    <article className={`post event event-${item.type}`}>
      <p className="event-line"><span className="event-icon">{icon}</span> {body} <span className="when">{ago(item.at, now)}</span></p>
      <p className="fine">{detail}</p>
    </article>
  );
}

function PostCard({ post, flies, patch, now, fresh, onFly, liked, viewer, onLike, badges, parent, commentTick, ctx, folded, onUnfold, onMeme, onBonds }: {
  post: Post; flies: Map<string, Fly>; patch?: Patch; now: number; fresh: boolean; onFly: (id: string) => void;
  liked: boolean; viewer: Viewer; onLike: () => void; badges: Badge[]; parent?: Post; commentTick: number;
  ctx?: PostContext; folded: Post[]; onUnfold: () => void; onMeme?: () => void; onBonds?: (flyId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [talking, setTalking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [stopVoice, setStopVoice] = useState<null | (() => void)>(null);
  const [voiceStyle, setVoiceStyle] = useVoiceStyle();
  const fly = flies.get(post.fly_id);
  useEffect(() => () => stopVoice?.(), [stopVoice]);   // stop the sound if the post leaves the page
  const hear = async () => {
    if (stopVoice) return stopVoice();
    const trace = await loadTrace(post);
    if (!trace) return;
    const stop = play(trace, fly, voiceStyle, () => setStopVoice(null));
    setStopVoice(() => stop);
  };
  const w = word(post.word);
  const d = describe(post, flies, ctx);
  const read = post.word !== "nothing";
  const poke = post.poke_id ? POKES.find((pk) => pk.stimulus === post.truth) : undefined;
  const name = fly?.name ?? t("flybook.post.aFly");
  const source = post.cause ? flies.get(post.cause.from_fly_id) : undefined;
  const top = strongest(post.actions);
  const hidden = (post.actions?.length ?? 0) - top.length;
  const chips = [...(read ? [w.tag] : []), ...top.map(actionText)];
  const since = folded.length ? ago(folded[folded.length - 1].created_at, now) : "";
  const canLike = !!viewer?.ready;

  return (
    <article id={`post-${post.id}`} className={`post kind-${post.kind ?? "sense"}${post.cause ? " caused" : ""}${fresh ? " fresh" : ""}`}>
      <header>
        <button className="who" onClick={() => onFly(post.fly_id)}>
          <span className="dot" style={{ background: fly?.color ?? "#888" }} />
          {name}
        </button>
        {onBonds && (
          <button className="who-web" onClick={() => onBonds(post.fly_id)} title={t("flybook.post.bondsTitle", { name })}
                  aria-label={t("flybook.post.bondsTitle", { name })}>🕸</button>
        )}
        {fly && !fly.owner && <span className="badge">{t("flybook.post.house")}</span>}
        {fly && tuning(fly).length > 0 && <span className="badge tuned" title={tuning(fly).join(", ")}>{t("flybook.post.tuned")}</span>}
        {badges.slice(0, 2).map((b) => <span key={b.key} className="badge award" title={tAt("flybook.badges", b.key, "help")}>{tAt("flybook.badges", b.key, "label")}</span>)}
        <span className="where">{t("flybook.post.in", { patch: patch?.name ?? post.patch_id })}</span>
        <span className="when">{ago(post.created_at, now)}</span>
        {folded.length > 0 && (
          <button className="repeat" onClick={onUnfold} title={t("flybook.post.repeatTitle", { count: folded.length })}>
            {t("flybook.post.repeat", { n: folded.length + 1, since })}
          </button>
        )}
      </header>
      {ctx?.number && <p className="milestone">{t("flybook.post.milestone", { name, nth: ordinal(ctx.number) })}</p>}
      {poke && <p className="poked">{t("flybook.post.afterPoke", { what: tAt("flybook.pokes", poke.stimulus, "done") })}</p>}
      {post.cause && (
        <p className="chain">
          {t("flybook.post.setOffBy")}
          {parent ? <a href={`#post-${parent.id}`}>{t("flybook.post.neighbourPost", { name: source?.name ?? t("flybook.post.neighbour") })}</a> : <b>{source?.name ?? t("flybook.post.neighbour")}</b>}
        </p>
      )}
      <p className="says">{d.headline}</p>
      <p className={`did tone-${d.tone}`}>{d.detail}</p>
      <Caption post={post} isOwner={!!viewer && fly?.owner === viewer.userId} canWrite={canLike} />
      <div className="meta">
        {read && <span className="chip">{w.tag}</span>}
        {read && <span className="conf">{t("flybook.post.decoderSure", { pct: pct(post.confidence) })}</span>}
        {top.map((a) => (
          <span key={a.key} className="chip act" title={t("flybook.post.sigmaTitle", { z: a.z })}>{actionText(a)}</span>
        ))}
        {hidden > 0 && (
          <span className="chip act more-acts" title={(post.actions ?? []).slice().sort((a, b) => b.z - a.z).slice(2).map((a) => `${actionText(a)} ${a.z}σ`).join(", ")}>
            +{hidden}
          </span>
        )}
        <button className={`like${liked ? " on" : ""}`} onClick={onLike} disabled={!canLike} aria-pressed={liked}
                title={canLike ? t(liked ? "flybook.post.unlike" : "flybook.post.like") : t("flybook.post.signInToLike")}>
          {liked ? "♥" : "♡"} {post.likes ?? 0}
        </button>
        {post.has_voice && (
          <span className="voice-group">
            <button className={`more voice${stopVoice ? " on" : ""}`} onClick={hear}
                    title={t("flybook.post.voiceTitle", { slow: SLOW })}>
              {t(stopVoice ? "flybook.post.stop" : "flybook.post.hear")}
            </button>
            <button className="more voice-style" onClick={() => setVoiceStyle(voiceStyle === "cartoon" ? "real" : "cartoon")}
                    title={t("flybook.post.voiceStyleTitle")}>
              {t(voiceStyle === "cartoon" ? "flybook.post.cartoon" : "flybook.post.realistic")}
            </button>
          </span>
        )}
        <button className="more talk" onClick={() => setTalking(!talking)} aria-expanded={talking}>💬 {post.comments ?? 0}</button>
        {onMeme && <button className="more meme-btn" onClick={onMeme} title={t("flybook.post.memeTitle")}>{t("flybook.post.meme")}</button>}
        <button className="more" onClick={() => setSharing(!sharing)}>{t("flybook.post.share")}</button>
        <button className="more" onClick={() => setOpen(!open)}>{t(open ? "flybook.post.hideNeurons" : "flybook.post.neurons")}</button>
      </div>
      {talking && <Comments post={post} viewerId={viewer?.userId} canWrite={canLike} refreshKey={commentTick} />}
      {sharing && (
        <div className="share">
          <button className="btn sm" onClick={() => shareOnX(`${name} on Flybook: "${d.headline}" ${d.detail} Read from a real fruit-fly brain.`, post.id)}>
            {t("flybook.post.postOnX")}
          </button>
          <button className="btn sm" onClick={() => saveCard({ id: post.id, name, color: fly?.color ?? "#888", patch: patch?.name ?? post.patch_id,
                                                             headline: d.headline, detail: d.detail, chips })}>
            {t("flybook.post.saveCard")}
          </button>
          <button className="btn sm" onClick={() => navigator.clipboard?.writeText(postUrl(post.id)).then(() => setCopied(true))}>
            {t(copied ? "flybook.post.linkCopied" : "flybook.post.copyLink")}
          </button>
        </div>
      )}
      {open && (
        <div className="neurons">
          {post.neurons.length === 0 && <span className="fine">{t("flybook.post.noNeurons")}</span>}
          {post.neurons.map((n) => (
            <span key={n.type} className={`chip ${n.z > 0 ? "up" : "down"}`}>
              {n.type} {n.z > 0 ? "+" : ""}{n.z}σ
            </span>
          ))}
          <span className="fine">
            {post.cause
              ? t("flybook.post.inputFrom", { name: source?.name ?? t("flybook.post.neighbour"), channel: post.cause.channel, strength: post.cause.strength })
              : t("flybook.post.stimulated", { cells: WORDS[post.truth]?.cells ?? post.truth })}{" "}
            {t("flybook.post.wings", { hz: post.wing_hz ?? "?", tick: post.tick_id })}
            {fly && tuning(fly).length > 0 && t("flybook.post.tunedList", { list: tuning(fly).join(", ") })}
          </span>
        </div>
      )}
    </article>
  );
}

function Shell({ children, live }: { children: React.ReactNode; live?: boolean }) {
  return (
    <>
      <nav>
        <div className="wrap">
          <a className="brand" href={BASE}>
            <img className="logo" src={`${BASE}logo.webp`} alt="" />
            flybook
            {live !== undefined && <span className={`status ${live ? "live" : ""}`}>{t(live ? "flybook.shell.live" : "flybook.shell.demo")}</span>}
          </a>
          <div className="links">
            <a href={SCIENCE_URL}>{t("flybook.shell.howItWorks")}</a>
            <a href={SITE_URL}>fly.ai</a>
            {live && <a className="btn red sm" href="#account">{t("flybook.shell.makeFly")}</a>}
            <LanguageMenu />
          </div>
        </div>
      </nav>
      <div className="wrap">{children}</div>
    </>
  );
}
