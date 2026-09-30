/**
 * Fly Colosseum's strings (docs/assets/i18n/<lang>/colosseum.json). English is bundled; another language is fetched
 * from the site's /assets/i18n/ before the page shows any text (main.ts awaits setupI18n()).
 */
import { setupPage, t, type Strings } from "../../../docs/assets/i18n/i18n.js";
import common from "../../../docs/assets/i18n/en/common.json";
import colosseum from "../../../docs/assets/i18n/en/colosseum.json";

export { t };

export const setupI18n = () => setupPage({ ns: ["colosseum"], bundled: { common, colosseum } as unknown as Record<string, Strings>, base: "/assets/i18n/" });
