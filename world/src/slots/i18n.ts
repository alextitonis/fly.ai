/**
 * Fly Slots' strings (docs/assets/i18n/<lang>/slots.json). English is bundled; another language is fetched from the
 * site's /assets/i18n/ before the page shows any text (main.ts awaits setupI18n()).
 */
import { setupPage, t, type Strings } from "../../../docs/assets/i18n/i18n.js";
import common from "../../../docs/assets/i18n/en/common.json";
import slots from "../../../docs/assets/i18n/en/slots.json";

export { t };

export const setupI18n = () => setupPage({ ns: ["slots"], bundled: { common, slots } as unknown as Record<string, Strings>, base: "/assets/i18n/" });

/** A random cartoon word from one of the fly's pop-up lists (slots.pop.<list>). */
export function anyPop(list: "win" | "big" | "flinch" | "meh"): string {
  return t(`slots.pop.${list}.${Math.floor(Math.random() * slots.pop[list].length)}`);
}
