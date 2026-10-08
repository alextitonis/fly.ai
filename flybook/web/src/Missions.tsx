import { useEffect, useState } from "react";
import { loadSeasonBoard, myMissions, type Mission } from "./feed";
import { currentSeason } from "./seasons";
import { t, tOr } from "./i18n";

/** Daily and weekly missions for the signed-in user, and where they stand this season. */
export default function Missions({ viewer }: { viewer: { userId: string } | null }) {
  const [missions, setMissions] = useState<Mission[] | null>(null);
  const [standing, setStanding] = useState<{ points: number; rank: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const season = currentSeason();

  useEffect(() => {
    if (!viewer) return;
    const refresh = () => {
      myMissions().then(setMissions).catch((e) => setError(e?.message ?? String(e)));
      loadSeasonBoard().then((rows) => {
        const i = rows.findIndex((r) => r.user_id === viewer.userId);
        setStanding({ points: i >= 0 ? rows[i].points : 0, rank: i >= 0 ? i + 1 : null });
      }, () => undefined);                          // (the board unread: the standing waits for the next refresh)
    };
    refresh();
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, [viewer?.userId]);

  if (!viewer) {
    return (
      <section className="card missions">
        <h4>{t("flybook.missions.title", { n: season.number })}</h4>
        <p>{t("flybook.missions.signIn")}</p>
      </section>
    );
  }

  const group = (period: "daily" | "weekly") => (missions ?? []).filter((m) => m.period === period);
  return (
    <section className="card missions">
      <h4>{t("flybook.missions.title", { n: season.number })}</h4>
      <p className="fine season-line">
        {t("flybook.missions.daysLeft", { name: season.name, count: season.daysLeft })}
        {standing && t("flybook.missions.you", { points: standing.points }) + (standing.rank ? t("flybook.missions.rank", { rank: standing.rank }) : "")}
      </p>
      <p className="fine reward-line">{t("flybook.missions.reward")}</p>
      {error && <p className="err">{error}</p>}
      {missions === null && !error && <p className="fine">{t("flybook.missions.loading")}</p>}
      {(["daily", "weekly"] as const).map((period) => (
        group(period).length > 0 && (
          <div key={period}>
            <h5>{t(period === "daily" ? "flybook.missions.today" : "flybook.missions.week")}</h5>
            <ul>
              {group(period).map((m) => {
                const done = m.progress >= m.target;
                return (
                  <li key={m.key} className={done ? "done" : ""}>
                    <span className="m-label">{done ? "✓ " : ""}{tOr(`flybook.missions.m.${m.key}`, m.label)}</span>
                    <span className="m-pts mono">+{m.points}</span>
                    <span className="bar"><i style={{ width: `${Math.min(100, (100 * m.progress) / m.target)}%` }} /></span>
                    <span className="m-count mono">{Math.min(m.progress, m.target)}/{m.target}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )
      ))}
    </section>
  );
}
