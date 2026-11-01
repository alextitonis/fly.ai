// The share card: the fly and how its day went, drawn on a canvas in the X card size. The picture is what people post,
// so it carries the site's name; it never shows a wallet address.
import { t } from "./i18n.ts";
import { dayMood, type Mood } from "./mood.ts";

export const CARD_W = 1200, CARD_H = 675;
const BG = "#0b0b0b", MINT = "#7cf5c4", RED = "#ff8d8d", MUTE = "#9a9a9a";
const FONT = '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", "Malgun Gothic", Arial, sans-serif';

export interface CardData {
  name: string;
  day: number;
  /** the followed flies with money in them; none = the fly on its own */
  flies: number[];
  today: number;
  all: number;
  value: number;
}

const signedUsd = (n: number) => `${n >= 0 ? "+" : "-"}$${Math.abs(n) >= 100 ? Math.abs(n).toFixed(0) : Math.abs(n).toFixed(2)}`;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error(`no picture: ${src}`));
    im.src = src;
  });
}

/** the biggest size up to `size` at which the text fits the width */
function fit(c: CanvasRenderingContext2D, text: string, weight: number, size: number, width: number) {
  for (; size > 20; size -= 4) {
    c.font = `${weight} ${size}px ${FONT}`;
    if (c.measureText(text).width <= width) break;
  }
}

export async function drawCard(canvas: HTMLCanvasElement, d: CardData, moods: Partial<Record<Mood, string>>, base: string): Promise<void> {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const c = canvas.getContext("2d")!;
  const trading = d.flies.length > 0;
  const mood = trading ? dayMood(d.today, d.value) : "wave";
  const up = d.today >= 0;

  c.fillStyle = BG;
  c.fillRect(0, 0, CARD_W, CARD_H);
  const glow = c.createRadialGradient(880, 340, 40, 880, 340, 400);
  glow.addColorStop(0, trading && !up ? "rgba(255,141,141,.22)" : "rgba(124,245,196,.22)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = glow;
  c.fillRect(480, 0, 720, CARD_H);

  const file = moods[mood] ?? moods.idle;
  if (file) {
    const im = await loadImage(`${base}${file}`);
    c.imageSmoothingEnabled = false;
    c.drawImage(im, 640, 100, 480, 480);       // a GIF draws its first frame
  }

  const left = 72, width = 560;
  c.textBaseline = "alphabetic";
  c.fillStyle = "#fff";
  fit(c, d.name, 700, 44, width);
  c.fillText(d.name, left, 120);
  c.fillStyle = MUTE;
  c.font = `500 26px ${FONT}`;
  c.fillText(t("card.day", { day: d.day }), left, 162);

  if (trading) {
    const big = signedUsd(d.today);
    c.fillStyle = up ? MINT : RED;
    fit(c, big, 800, 128, width);
    c.fillText(big, left, 340);
    c.fillStyle = "#fff";
    c.font = `600 32px ${FONT}`;
    c.fillText(t("card.today"), left, 392);
    c.fillStyle = MUTE;
    c.font = `500 26px ${FONT}`;
    c.fillText(t("card.all", { all: signedUsd(d.all) }), left, 440);
    const list = d.flies.slice(0, 5).map((id) => `#${id}`).join(" ") + (d.flies.length > 5 ? " …" : "");
    c.fillText(list, left, 480);
  } else {
    c.fillStyle = MINT;
    const line = t("card.hello");
    fit(c, line, 800, 72, width);
    c.fillText(line, left, 340);
  }

  c.fillStyle = "#fff";
  c.font = `700 30px ${FONT}`;
  c.fillText("flyaiworld.com", left, CARD_H - 64);
}
