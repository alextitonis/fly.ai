/**
 * Text completion jobs ("complete", src/orders.ts COMPLETE_MODELS): one long-lived worker per model, so the weights
 * load once (the browser caches them after the first download) and each job is a batch of prompts answered greedily
 * (temperature 0) on WebGPU. MLC WebLLM comes from jsDelivr at the version the server names.
 *
 * in:  {type: "load", model, version}                  → {type: "progress", text}* · {type: "ready"} · {type: "error", text}
 *      {type: "run", job, input, input_url, max_tokens} → {type: "done", job, output (base64 of JSON {texts})} · {type: "error", job, text}
 * A job's input (a JSON array of prompts) is checked against its SHA-256 before it runs.
 */
const ctx = self as unknown as { postMessage(message: unknown): void; onmessage: ((e: MessageEvent) => void) | null };

interface Engine {
  chat: { completions: { create(req: Record<string, unknown>): Promise<{ choices: { message: { content: string | null } }[] }> } };
  resetChat?(): Promise<void>;
}
let engine: Engine | null = null;

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function load(m: { model: string; version: string }): Promise<void> {
  if (!(self.navigator as Navigator & { gpu?: unknown }).gpu) throw new Error("no WebGPU here");
  const lib = await import(/* @vite-ignore */ `https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@${m.version}/+esm`);
  engine = await lib.CreateMLCEngine(m.model, {
    initProgressCallback: (r: { text?: string }) => ctx.postMessage({ type: "progress", text: String(r.text ?? "").slice(0, 120) }),
  });
}

ctx.onmessage = (e: MessageEvent) => {
  const m = e.data;
  if (m.type === "load") {
    load(m).then(() => ctx.postMessage({ type: "ready" }), (err) => ctx.postMessage({ type: "error", text: String(err).slice(0, 300) }));
    return;
  }
  if (m.type !== "run") return;
  void (async () => {
    try {
      if (!engine) throw new Error("the model isn't loaded");
      const res = await fetch(m.input_url);
      if (!res.ok) throw new Error(`couldn't fetch the input: HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (hex(await crypto.subtle.digest("SHA-256", bytes)) !== m.input) throw new Error("the input doesn't match its hash");
      const prompts = (JSON.parse(new TextDecoder().decode(bytes)) as (string | { system?: string; prompt: string })[])
        .map((p) => (typeof p === "string" ? { prompt: p } : p));
      const texts: string[] = [];
      for (const p of prompts) {
        await engine.resetChat?.();
        const messages = [...(p.system ? [{ role: "system", content: p.system }] : []), { role: "user", content: p.prompt }];
        // greedy: every honest GPU should write the same words, give or take float rounding late in a long text
        const out = await engine.chat.completions.create({ messages, temperature: 0, top_p: 1, max_tokens: m.max_tokens, seed: 0, stream: false });
        texts.push(out.choices[0]?.message.content ?? "");
      }
      ctx.postMessage({ type: "done", job: m.job, output: base64(new TextEncoder().encode(JSON.stringify({ texts }))) });
    } catch (err) {
      ctx.postMessage({ type: "error", job: m.job, text: String(err).slice(0, 300) });
    }
  })();
};
