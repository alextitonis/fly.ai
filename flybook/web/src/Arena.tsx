import { useEffect, useMemo, useState } from "react";
import PatchView from "./PatchView";
import { challengeFly } from "./api";
import { loadDuels, loadMatings, type Duel, type Fly, type Mating } from "./feed";
import { Html, t, tAt } from "./i18n";

const KIND = (kind: Duel["kind"]) => ({ label: tAt("flybook.arena", kind, "label"), rule: tAt("flybook.arena", kind, "rule") });

const timing = (ms: number | null) => (ms === null ? t("flybook.arena.held") : t("flybook.arena.ms", { n: ms }));

/**
 * Duels: two flies side by side under the same slowly growing looming threat. Nothing decides who
 * jumps but their brains. Elo moves 32 points at most per duel.
 */
export default function Arena({ flies, viewer, liveDuel }: {
  flies: Fly[]; viewer: { userId: string; ready: boolean } | null; liveDuel: Duel | null;
}) {
  const [duels, setDuels] = useState<Duel[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [mine, setMine] = useState("");
  const [opponent, setOpponent] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const [matings, setMatings] = useState<Mating[]>([]);

  useEffect(() => {
    loadDuels().then(setDuels);
    const refresh = () => loadMatings().then(setMatings);
    refresh();
    const timer = setInterval(refresh, 30_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!liveDuel) return;
    setDuels((ds) => (ds ? [liveDuel, ...ds.filter((d) => d.id !== liveDuel.id)].sort((a, b) => b.id - a.id) : ds));
  }, [liveDuel]);

  const byId = useMemo(() => new Map(flies.map((f) => [f.id, f])), [flies]);
  const active = flies.filter((f) => f.active !== false);
  const ranked = [...active].sort((a, b) => (b.elo ?? 1000) - (a.elo ?? 1000));
  const myFlies = viewer ? active.filter((f) => f.owner === viewer.userId) : [];
  useEffect(() => {
    if (!mine && myFlies[0]) setMine(myFlies[0].id);
  }, [myFlies.length]);

  const send = async () => {
    setMsg(null);
    try {
      await challengeFly(mine, opponent);
      setMsg(t("flybook.arena.sent"));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const shown = (duels ?? []).filter((d) => d.status !== "cancelled").slice(0, 30);
  const selected = shown.find((d) => d.id === open);

  return (
    <div className="arena">
      <div className="feed-head">
        <h2>{t("flybook.arena.title")}</h2>
        <Html as="p" k="flybook.arena.intro" />
      </div>

      {viewer?.ready && myFlies.length > 0 ? (
        <div className="challenge card">
          <h4>{t("flybook.arena.challengeTitle")}</h4>
          <div className="row">
            <select value={mine} onChange={(e) => setMine(e.target.value)}>
              {myFlies.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.elo ?? 1000})</option>)}
            </select>
            <span className="vs">{t("flybook.arena.vs")}</span>
            <select value={opponent} onChange={(e) => setOpponent(e.target.value)}>
              <option value="">{t("flybook.arena.pickOpponent")}</option>
              {ranked.filter((f) => f.id !== mine).map((f) => <option key={f.id} value={f.id}>{f.name} ({f.elo ?? 1000})</option>)}
            </select>
            <button className="btn red sm" disabled={!mine || !opponent} onClick={send}>{t("flybook.arena.challenge")}</button>
          </div>
          {msg && <p className="fine">{msg}</p>}
        </div>
      ) : (
        <p className="fine">{t("flybook.arena.holdersCan")}</p>
      )}

      {selected?.replay && (
        <div className="card duel-replay">
          <h4>{KIND(selected.kind).label} #{selected.id}</h4>
          <PatchView flies={selected.replay.flies.map((id) => byId.get(id)).filter((f): f is Fly => !!f)}
                     replay={selected.replay} tickId={selected.id} waiting={[]} armed={null} onPoke={() => {}} />
        </div>
      )}

      <div className="arena-grid">
        <section>
          <h4 className="section-title">{t("flybook.arena.recent")}</h4>
          {duels === null && <div className="empty">{t("flybook.arena.loading")}</div>}
          {duels !== null && shown.length === 0 && <div className="empty">{t("flybook.arena.none")}</div>}
          <ol className="duels">
            {shown.map((d) => {
              const a = byId.get(d.a_fly);
              const b = byId.get(d.b_fly);
              const won = d.winner ? byId.get(d.winner) : null;
              const body = (
                <>
                  <span className="kind">{KIND(d.kind).label}</span>
                  <span className="pair">
                    <span className="dot" style={{ background: a?.color ?? "#888" }} /> {a?.name ?? "?"}
                    <span className="vs">{t("flybook.arena.vs")}</span>
                    <span className="dot" style={{ background: b?.color ?? "#888" }} /> {b?.name ?? "?"}
                  </span>
                  {d.status === "pending" ? (
                    <span className="result fine">{t("flybook.arena.waiting")}</span>
                  ) : (
                    <>
                      <span className="result">{won ? t("flybook.arena.won", { name: won.name }) : t("flybook.arena.draw")}</span>
                      <span className="sub mono">
                        {KIND(d.kind).rule} · {a?.name} {timing(d.a_step)} · {b?.name} {timing(d.b_step)}
                        {d.delta ? t("flybook.arena.elo", { n: Math.abs(d.delta) }) : ""}{d.requested_by ? t("flybook.arena.challengeTag") : ""}
                        {d.replay ? t("flybook.arena.tapReplay") : ""}
                      </span>
                    </>
                  )}
                </>
              );
              const cls = `duel${open === d.id ? " on" : ""}`;
              return (
                <li key={d.id}>
                  {d.replay ? (
                    <button type="button" className={`${cls} duel-btn`} aria-expanded={open === d.id}
                            aria-label={`${KIND(d.kind).label} #${d.id}: ${a?.name ?? "?"} ${t("flybook.arena.vs")} ${b?.name ?? "?"}. ${t("flybook.arena.tapReplay").replace(/^[\s·]+/, "")}`}
                            onClick={() => setOpen(open === d.id ? null : d.id)}>
                      {body}
                    </button>
                  ) : (
                    <div className={cls}>{body}</div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        <section>
          <h4 className="section-title">{t("flybook.arena.ratings")}</h4>
          <ol className="elo">
            {ranked.slice(0, 25).map((f, i) => (
              <li key={f.id} className={viewer && f.owner === viewer.userId ? "me" : ""}>
                <span className="rank">{i + 1}</span>
                <span className="dot" style={{ background: f.color }} />
                <span className="name">{f.name}</span>
                <span className="mono elo-score">{f.elo ?? 1000}</span>
                <span className="mono record">{f.wins ?? 0}-{f.losses ?? 0}-{f.draws ?? 0}</span>
              </li>
            ))}
          </ol>
          <p className="fine">{t(ranked.length ? "flybook.arena.record" : "flybook.arena.noRatings")}</p>

          <h4 className="section-title">{t("flybook.arena.matings")}</h4>
          {matings.length === 0 ? (
            <p className="fine">{t("flybook.arena.noMatings")}</p>
          ) : (
            <ol className="duels">
              {matings.map((m) => {
                const a = m.a_fly ? byId.get(m.a_fly) : undefined;
                const b = m.b_fly ? byId.get(m.b_fly) : undefined;
                const child = m.child ? byId.get(m.child) : undefined;
                return (
                  <li key={m.id} className="duel">
                    <span className="kind">{t(m.trigger === "brain" ? "flybook.arena.met" : "flybook.arena.matched")}</span>
                    <span className="pair">
                      <span className="dot" style={{ background: a?.color ?? "#888" }} /> {a?.name ?? t("flybook.arena.aFly")}
                      <span className="vs">×</span>
                      <span className="dot" style={{ background: b?.color ?? "#888" }} /> {b?.name ?? t("flybook.arena.aFly")}
                    </span>
                    <span className="result">
                      <span className="dot" style={{ background: child?.color ?? "#888" }} /> {child?.name ?? t("flybook.arena.newFly")}
                      {viewer && m.owner === viewer.userId ? t("flybook.arena.yours") : ""}
                    </span>
                    <span className="sub mono">
                      {t(m.trigger === "brain" ? "flybook.arena.brainRead" : "flybook.arena.paired")}
                      {child?.generation ? t("flybook.arena.generation", { n: child.generation }) : ""}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
