import { useState } from "react";
import { currentSeason } from "./seasons";
import { Html, t } from "./i18n";

/** A short explainer of what Flybook is, what flies do, and what players and holders can do. */
export default function HowItWorks() {
  const [open, setOpen] = useState(false);
  const season = currentSeason();
  return (
    <section className="card how">
      <h4>{t("flybook.how.title")}</h4>
      <p>{t("flybook.how.intro")}</p>
      {open ? (
        <>
          <ul>
            {Array.from({ length: 9 }, (_, i) => <Html key={i} as="li" k={`flybook.how.li${i + 1}`} />)}
          </ul>
          <p className="fine">{t("flybook.how.season", { n: season.number, name: season.name, count: season.daysLeft })}</p>
          <a className="more" href="/research/flybook">{t("flybook.how.science")}</a>
        </>
      ) : (
        <button className="more" onClick={() => setOpen(true)}>{t("flybook.how.read")}</button>
      )}
    </section>
  );
}
