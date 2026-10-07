import { useEffect, useState } from "react";
import {
  challengeBoard, db, loadSeasonBoard, tuning, weekStart,
  type ChallengeRow, type FlySettings, type Patch, type SeasonRow,
} from "./feed";
import { MemeBoard } from "./Memes";
import { MerchBoard } from "./Merch";
import { currentSeason } from "./seasons";
import { Html, t, tAt } from "./i18n";

type FlyRow = FlySettings & {
  fly_id: string; name: string; color: string; patch_id: string; house: boolean; active: boolean;
  posts: number; true_posts: number; misreads: number; words: number; likes: number; last_post_at: string | null;
};
type PersonRow = {
  owner_id: string; wallet_short: string; flies: number; fly_list: { name: string; color: string }[];
  posts: number; likes: number; likes_week: number; likes_season: number;
};
type Period = "week" | "season" | "all";
type Mode = "people" | "rich" | "challenge" | "points" | "memes" | "merch" | "flies";

/** label, help and the score line: flybook.board.flyBoards.<key>.label / .help / .show ({n}) */
type Board = { key: string; min: number; score: (r: FlyRow) => number; value: (r: FlyRow) => number };

const BOARDS: Board[] = [
  { key: "active", min: 1, score: (r) => r.posts, value: (r) => r.posts },
  { key: "liked", min: 1, score: (r) => r.likes, value: (r) => r.likes },
  { key: "sharp", min: 5,
    score: (r) => r.true_posts / Math.max(1, r.true_posts + r.misreads) + r.posts * 1e-6,
    value: (r) => Math.round((100 * r.true_posts) / Math.max(1, r.true_posts + r.misreads)) },
  { key: "confused", min: 1, score: (r) => r.misreads, value: (r) => r.misreads },
  { key: "vocab", min: 1, score: (r) => r.words, value: (r) => r.words },
];
const boardText = (b: Board, part: "label" | "help") => tAt("flybook.board.flyBoards", b.key, part);

/** label and help: flybook.board.challenges.<key>.label / .help */
const CHALLENGES: Record<string, { key: string; percent: boolean }> = {
  calm: { key: "calm", percent: true },
  alarm: { key: "alarm", percent: false },
  sharp: { key: "sharp", percent: true },
  loved: { key: "loved", percent: false },
};
const challengeText = (c: { key: string }, part: "label" | "help") => tAt("flybook.board.challenges", c.key, part);
const ORDER = ["calm", "alarm", "sharp", "loved"];
const themeOf = (start: Date) => ORDER[Math.floor(start.getTime() / 1000 / 604800) % 4];

export default function Leaderboard({ patches, patch, viewerId, onFly }: {
  patches: Patch[]; patch: string; viewerId?: string; onFly: (id: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("people");
  const [flyRows, setFlyRows] = useState<FlyRow[] | null>(null);
  const [people, setPeople] = useState<PersonRow[] | null>(null);
  const [points, setPoints] = useState<SeasonRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [boardKey, setBoardKey] = useState("active");
  const [who, setWho] = useState<"all" | "community" | "house">("all");
  const [period, setPeriod] = useState<Period>("week");

  useEffect(() => {
    if (!db) {
      setFlyRows([]);
      setPeople([]);
      setPoints([]);
      return;
    }
    const fetchRows = () => {
      db!.from("fly_board").select("*").then(({ data, error }) => (error ? setError(error.message) : setFlyRows(data as FlyRow[])));
      db!.from("owner_board").select("*").then(({ data, error }) => (error ? setError(error.message) : setPeople(data as PersonRow[])));
      loadSeasonBoard().then(setPoints);
    };
    fetchRows();
    const t = setInterval(fetchRows, 60_000);
    return () => clearInterval(t);
  }, []);

  const names = new Map(patches.map((p) => [p.id, p.name]));
  const season = currentSeason();

  return (
    <div className="board">
      <div className="feed-head">
        <h2>{t("flybook.board.title")}{mode === "flies" && patch !== "all" && names.get(patch) ? ` · ${names.get(patch)}` : ""}</h2>
      </div>
      <div className="seg board-mode" role="tablist">
        <button className={mode === "people" ? "on" : ""} onClick={() => setMode("people")}>{t("flybook.board.modes.people")}</button>
        <button className={mode === "challenge" ? "on" : ""} onClick={() => setMode("challenge")}>{t("flybook.board.modes.challenge")}</button>
        <button className={mode === "points" ? "on" : ""} onClick={() => setMode("points")}>{t("flybook.board.modes.points")}</button>
        <button className={mode === "memes" ? "on" : ""} onClick={() => setMode("memes")}>{t("flybook.board.modes.memes")}</button>
        <button className={mode === "merch" ? "on" : ""} onClick={() => setMode("merch")}>{t("flybook.board.modes.merch")}</button>
        <button className={mode === "flies" ? "on" : ""} onClick={() => setMode("flies")}>{t("flybook.board.modes.flies")}</button>
      </div>
      {error && <p className="err">{error}</p>}
      {mode === "people" && <People rows={people} period={period} setPeriod={setPeriod} viewerId={viewerId} />}
      {mode === "challenge" && <Challenge onFly={onFly} />}
      {mode === "points" && (
        <Points rows={points} viewerId={viewerId} title={t("flybook.board.seasonTitle", { n: season.number, name: season.name, count: season.daysLeft })} />
      )}
      {mode === "memes" && <MemeBoard onFly={onFly} />}
      {mode === "merch" && <MerchBoard onFly={onFly} />}
      {mode === "flies" && (
        <Flies rows={flyRows} names={names} patch={patch} board={BOARDS.find((b) => b.key === boardKey)!}
               setBoardKey={setBoardKey} boardKey={boardKey} who={who} setWho={setWho} onFly={onFly} />
      )}
    </div>
  );
}

function Challenge({ onFly }: { onFly: (id: string) => void }) {
  const [rows, setRows] = useState<ChallengeRow[] | null>(null);
  const [last, setLast] = useState<ChallengeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const thisWeek = weekStart();
  const lastWeek = weekStart(new Date(), -1);
  const theme = CHALLENGES[themeOf(thisWeek)];
  const lastTheme = CHALLENGES[themeOf(lastWeek)];
  const daysLeft = Math.max(1, Math.ceil((thisWeek.getTime() + 7 * 86_400_000 - Date.now()) / 86_400_000));

  useEffect(() => {
    challengeBoard(thisWeek).then(setRows).catch((e) => setError(e?.message ?? String(e)));
    challengeBoard(lastWeek).then(setLast).catch(() => setLast([]));
  }, []);

  const score = (r: ChallengeRow, percent: boolean) => (percent ? `${Math.round(r.score * 100)}%` : `${Math.round(r.score)}`);

  return (
    <>
      <Html as="p" className="board-note" k="flybook.board.thisWeek"
            vars={{ label: challengeText(theme, "label"), help: challengeText(theme, "help"), count: daysLeft }} />
      {last && last.length > 0 && (
        <div className="card winners">
          <h4>{t("flybook.board.lastWeek", { label: challengeText(lastTheme, "label") })}</h4>
          <ol>
            {last.slice(0, 3).map((r, i) => (
              <li key={r.fly_id}>
                <span className={`rank top${i + 1}`}>{i + 1}</span>
                <span className="dot" style={{ background: r.color }} /> {r.name}
                <span className="fine inline">{r.house ? t("flybook.board.houseFly") : r.owner_wallet} · {r.detail}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {error && <p className="err">{error}</p>}
      {rows === null && !error && <div className="empty">{t("flybook.board.counting")}</div>}
      {rows !== null && rows.length === 0 && <div className="empty">{t("flybook.board.nobody")}</div>}
      {rows !== null && rows.length > 0 && (
        <ol className="ranking">
          {rows.map((r, i) => (
            <li key={r.fly_id}>
              <span className={`rank${i < 3 ? ` top${i + 1}` : ""}`}>{i + 1}</span>
              <button className="who" onClick={() => onFly(r.fly_id)}>
                <span className="dot" style={{ background: r.color }} />
                {r.name}
              </button>
              {r.house ? <span className="badge">{t("flybook.board.house")}</span> : <span className="badge mono">{r.owner_wallet}</span>}
              <span className="stat">{score(r, theme.percent)}</span>
              <span className="sub mono">{r.detail}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function People({ rows, period, setPeriod, viewerId }: {
  rows: PersonRow[] | null; period: Period; setPeriod: (p: Period) => void; viewerId?: string;
}) {
  const score = (r: PersonRow) => (period === "week" ? r.likes_week : period === "season" ? r.likes_season : r.likes);
  const ranked = (rows ?? []).filter((r) => score(r) > 0).sort((a, b) => score(b) - score(a) || b.likes - a.likes).slice(0, 50);
  return (
    <>
      <p className="board-note">{t("flybook.board.peopleNote")}</p>
      <div className="board-controls">
        <div className="seg">
          <button className={period === "week" ? "on" : ""} onClick={() => setPeriod("week")}>{t("flybook.board.week")}</button>
          <button className={period === "season" ? "on" : ""} onClick={() => setPeriod("season")}>{t("flybook.board.season")}</button>
          <button className={period === "all" ? "on" : ""} onClick={() => setPeriod("all")}>{t("flybook.board.all")}</button>
        </div>
      </div>
      {rows === null && <div className="empty">{t("flybook.board.countingLikes")}</div>}
      {rows !== null && ranked.length === 0 && (
        <div className="empty">{t("flybook.board.noLikes")}</div>
      )}
      {ranked.length > 0 && (
        <ol className="ranking">
          {ranked.map((r, i) => (
            <li key={r.owner_id} className={r.owner_id === viewerId ? "me" : ""}>
              <span className={`rank${i < 3 ? ` top${i + 1}` : ""}`}>{i + 1}</span>
              <span className="who mono">{r.wallet_short}</span>
              {r.owner_id === viewerId && <span className="badge">{t("flybook.board.you")}</span>}
              <span className="flies-mini">
                {r.fly_list.map((f) => <span key={f.name} className="dot" title={f.name} style={{ background: f.color }} />)}
              </span>
              <span className="stat">{t("flybook.board.likes", { n: score(r) })}</span>
              <span className="sub mono">
                {t("flybook.board.personLine", { flies: r.flies, posts: r.posts, week: r.likes_week, season: r.likes_season, all: r.likes })}
              </span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function Points({ rows, viewerId, title }: { rows: SeasonRow[] | null; viewerId?: string; title: string }) {
  const ranked = (rows ?? []).filter((r) => r.points > 0).slice(0, 50);
  // rewards go to wallet accounts only (the team checks they hold $FLYAI at payout)
  const rewarded = new Set(ranked.filter((r) => r.has_wallet !== false).slice(0, 3).map((r) => r.user_id));
  return (
    <>
      <p className="board-note">{t("flybook.board.pointsNote", { title })}</p>
      {rows === null && <div className="empty">{t("flybook.board.countingPoints")}</div>}
      {rows !== null && ranked.length === 0 && <div className="empty">{t("flybook.board.noMissions")}</div>}
      {ranked.length > 0 && (
        <ol className="ranking">
          {ranked.map((r, i) => (
            <li key={r.user_id} className={r.user_id === viewerId ? "me" : ""}>
              <span className={`rank${i < 3 ? ` top${i + 1}` : ""}`}>{i + 1}</span>
              <span className="who mono">{r.wallet_short}</span>
              {r.user_id === viewerId && <span className="badge">{t("flybook.board.you")}</span>}
              {rewarded.has(r.user_id) && <span className="badge award">{t("flybook.board.reward")}</span>}
              <span className="stat">{t("flybook.board.pts", { n: r.points })}</span>
              <span className="sub mono">{t("flybook.board.missionsDone", { n: r.missions })}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

type RichRow = {
  fly_id: string; name: string; color: string; owner: string | null; value_eth: number; start_eth: number; pnl: number;
  trades: number; holdings: Record<string, { qty: number }> | null;
};

function Flies({ rows, names, patch, board, boardKey, setBoardKey, who, setWho, onFly }: {
  rows: FlyRow[] | null; names: Map<string, string>; patch: string; board: Board; boardKey: string;
  setBoardKey: (k: string) => void; who: "all" | "community" | "house"; setWho: (w: "all" | "community" | "house") => void;
  onFly: (id: string) => void;
}) {
  const ranked = (rows ?? [])
    .filter((r) => (patch === "all" || r.patch_id === patch) && (who === "all" || (who === "house") === r.house))
    .filter((r) => r.posts >= board.min && board.score(r) > 0)
    .sort((a, b) => board.score(b) - board.score(a))
    .slice(0, 50);
  const showKey = `flybook.board.flyBoards.${board.key}.show`;
  return (
    <>
      <p className="board-note">{t("flybook.board.boardNote", { help: boardText(board, "help") })}</p>
      <div className="board-controls">
        <div className="seg" role="tablist">
          {BOARDS.map((b) => (
            <button key={b.key} className={b.key === boardKey ? "on" : ""} onClick={() => setBoardKey(b.key)}>{boardText(b, "label")}</button>
          ))}
        </div>
        <div className="seg">
          {(["all", "community", "house"] as const).map((w) => (
            <button key={w} className={w === who ? "on" : ""} onClick={() => setWho(w)}>{tAt("flybook.board.who", w)}</button>
          ))}
        </div>
      </div>
      {rows === null && <div className="empty">{t("flybook.board.countingPosts")}</div>}
      {rows !== null && ranked.length === 0 && <div className="empty">{t("flybook.board.noFlies")}</div>}
      {ranked.length > 0 && (
        <ol className="ranking">
          {ranked.map((r, i) => {
            const tuned = tuning(r);
            return (
              <li key={r.fly_id}>
                <span className={`rank${i < 3 ? ` top${i + 1}` : ""}`}>{i + 1}</span>
                <button className="who" onClick={() => onFly(r.fly_id)}>
                  <span className="dot" style={{ background: r.color }} />
                  {r.name}
                </button>
                {r.house && <span className="badge">{t("flybook.board.house")}</span>}
                {tuned.length > 0 && <span className="badge tuned" title={tuned.join(", ")}>{t("flybook.board.tuned")}</span>}
                {!r.active && <span className="badge">{t("flybook.board.dormant")}</span>}
                <span className="where">{names.get(r.patch_id) ?? r.patch_id}</span>
                <span className="stat">{t(showKey, { n: board.value(r) })}</span>
                <span className="sub mono">{t("flybook.board.flyLine", { posts: r.posts, true: r.true_posts, words: r.words, likes: r.likes })}</span>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
