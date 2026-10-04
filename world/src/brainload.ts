/**
 * Loading the connectome in a Web Worker: the `flybrain export --web` files (brain.json, meta.bin and the weight
 * parts), the same for the Simulation, Fly Radio and every game's brain worker (2026-10-04: one copy instead of six).
 * Progress goes to the page as {type: "progress", text}: "labels 3 MB", "fly brain 40 / 210 MB", then "wiring 25 M
 * synapses" (i18n.ts progress() translates those).
 */
import { parseMeta, parseWeights, type ConnectomeMeta, type ConnectomeWeights } from "./connectome.ts";

/** the worker's own global, as far as loading needs it */
export interface WorkerCtx { postMessage(message: unknown): void }

/**
 * Fetch one gzip stream stored in one or more parts, join the parts in order and decompress.
 * A server may already have unpacked a part (Content-Encoding: gzip), so decompress only if the
 * gzip magic bytes are still at the start. A part is fetched again from its start if it fails (up to 3 tries, as
 * mine/web/download.ts): Chrome fails one of two readers that hit the same large file while its cache entry is
 * still being written.
 */
export async function fetchGz(urls: string[], label: string, totalMb: number, report: (text: string) => void): Promise<ArrayBuffer> {
  const chunks: Uint8Array[] = [];
  let got = 0, lastReport = 0;
  for (const url of urls) {
    for (let attempt = 1; ; attempt++) {
      const part: Uint8Array[] = [];
      let partBytes = 0;
      try {
        const res = await fetch(url);
        if (!res.ok || !res.body) throw new Error(`${url}: HTTP ${res.status}`);
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          part.push(value);
          partBytes += value.length;
          if (got + partBytes - lastReport > 1_000_000) {
            lastReport = got + partBytes;
            report(`${label} ${(lastReport / 1e6).toFixed(0)}${totalMb ? ` / ${totalMb.toFixed(0)}` : ""} MB`);
          }
        }
      } catch (err) {
        if (attempt === 3) throw err;
        await new Promise((r) => setTimeout(r, 500 * attempt));
        continue;
      }
      chunks.push(...part);
      got += partBytes;
      break;
    }
  }
  const blob = new Blob(chunks as BlobPart[]);
  if (!(chunks[0]?.[0] === 0x1f && chunks[0]?.[1] === 0x8b)) return blob.arrayBuffer();
  return new Response(blob.stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
}

/**
 * The labels and the weights from `base` (a URL ending in "/"). `label` names the weights in the progress lines;
 * `check` sees the labels before the big download (Fly Radio checks the time step there).
 */
export async function loadConnectome(base: string, ctx: WorkerCtx, opts: { label?: string; check?: (meta: ConnectomeMeta) => void } = {}):
    Promise<{ meta: ConnectomeMeta; weights: ConnectomeWeights }> {
  const report = (text: string) => ctx.postMessage({ type: "progress", text });
  const res = await fetch(`${base}brain.json`);
  if (!res.ok) throw new Error(`${base}brain.json: HTTP ${res.status}`);
  const info: { parts: string[]; weights_mb: number } = await res.json();
  const meta = parseMeta(await fetchGz([`${base}meta.bin`], "labels", 0, report));
  opts.check?.(meta);
  const buf = await fetchGz(info.parts.map((p) => base + p), opts.label ?? "fly brain", info.weights_mb, report);
  report("wiring 25 M synapses");
  return { meta, weights: parseWeights(buf) };
}
