import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { breedFly } from "./api";
import { tuning, type Fly, type Patch } from "./feed";
import { t, tn } from "./i18n";

const COLORS = ["#e0342c", "#3ddc84", "#6cc4d8", "#f2b544", "#c77dff", "#ff7eb6", "#8bd450", "#ff9f5a"];

/** Breed a new fly from one of yours and another of yours, or a house fly. */
export default function BreedDialog({ mine, house, patches, onClose, onCreated }: {
  mine: Fly[]; house: Fly[]; patches: Patch[]; onClose: () => void; onCreated: () => void;
}) {
  const [a, setA] = useState(mine[0]?.id ?? "");
  const [b, setB] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[4]);
  const [patch, setPatch] = useState(patches[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [child, setChild] = useState<Fly | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const candidates = [...mine.filter((f) => f.id !== a), ...house];
  const parentA = mine.find((f) => f.id === a);
  const parentB = candidates.find((f) => f.id === b);

  const hatch = async () => {
    setBusy(true);
    setError(null);
    try {
      const made = await breedFly({ parent_a: a, parent_b: b, name: name.trim(), color, patch_id: patch });
      setChild(made as Fly);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const describe = (f?: Fly) => (f ? tuning(f).join(", ") || t("flybook.breed.standard") : "");

  return createPortal(
    <div className="modal-bg" onMouseDown={onClose}>
      <div className="modal breed" role="dialog" aria-modal="true" aria-labelledby="breed-title" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h3 id="breed-title">{t("flybook.breed.title")}</h3>
          <button className="more" type="button" onClick={onClose}>{t("flybook.breed.close")}</button>
        </header>
        <div className="modal-scroll">
          <p className="modal-lede">{t("flybook.breed.lede")}</p>
          {child ? (
            <div className="bred">
              <p>{tn("flybook.breed.hatched", { name: <b>{child.name}</b>, gen: child.generation ?? 1 })}</p>
              <p className="fine">{t("flybook.breed.settings", { list: describe(child) })}</p>
              <button className="btn red" onClick={onClose}>{t("flybook.breed.done")}</button>
            </div>
          ) : (
            <>
              <div className="identity">
                <label className="field">
                  <span>{t("flybook.breed.parent1")}</span>
                  <select value={a} onChange={(e) => setA(e.target.value)}>
                    {mine.map((f) => <option key={f.id} value={f.id}>{t("flybook.breed.gen", { name: f.name, gen: f.generation ?? 1 })}</option>)}
                  </select>
                  <small>{describe(parentA)}</small>
                </label>
                <label className="field">
                  <span>{t("flybook.breed.parent2")}</span>
                  <select value={b} onChange={(e) => setB(e.target.value)}>
                    <option value="">{t("flybook.breed.pickParent")}</option>
                    {candidates.map((f) => <option key={f.id} value={f.id}>{f.name}{f.owner ? "" : t("flybook.breed.house")}</option>)}
                  </select>
                  <small>{describe(parentB)}</small>
                </label>
                <label className="field">
                  <span>{t("flybook.breed.homePatch")}</span>
                  <select value={patch} onChange={(e) => setPatch(e.target.value)}>
                    {patches.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="identity">
                <label className="field">
                  <span>{t("flybook.breed.name")}</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder={t("flybook.breed.namePlaceholder")} />
                </label>
                <div className="field">
                  <span>{t("flybook.breed.colour")}</span>
                  <div className="swatches">
                    {COLORS.map((c) => (
                      <button type="button" key={c} className={c === color ? "on" : ""} style={{ background: c }}
                              onClick={() => setColor(c)} aria-label={t("flybook.breed.colourLabel", { c })} />
                    ))}
                  </div>
                </div>
              </div>
              {error && <p className="err">{error}</p>}
            </>
          )}
        </div>
        {!child && (
          <footer className="modal-foot">
            <span className="fine">{t("flybook.breed.counts")}</span>
            <button className="btn red" disabled={busy || !a || !b || !name.trim()} onClick={hatch}>{t(busy ? "flybook.breed.hatching" : "flybook.breed.hatchChild")}</button>
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
