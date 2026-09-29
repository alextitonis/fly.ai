/**
 * Fly Race's strings (docs/assets/i18n/<lang>/race.json). English is bundled; another language is fetched from the
 * site's /assets/i18n/ before the page shows any text (main.ts awaits setupI18n()).
 */
import { setupPage, t, type Strings } from "../../../docs/assets/i18n/i18n.js";
import common from "../../../docs/assets/i18n/en/common.json";
import race from "../../../docs/assets/i18n/en/race.json";

export { t };

export const setupI18n = () => setupPage({ ns: ["race"], bundled: { common, race } as unknown as Record<string, Strings>, base: "/assets/i18n/" });

/** "1st", "2nd"… in the page's language */
export const placeText = (place: number) => t(`race.place.${place}`);
