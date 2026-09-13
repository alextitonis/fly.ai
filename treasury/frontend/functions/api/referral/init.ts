import { getDb, SCHEMA } from "./_db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const onRequestGet = async (context: any) => {
  const db = getDb(context.env as Record<string, unknown>);
  try {
    for (const stmt of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) {
      await db.prepare(stmt).run();
    }
    return new Response(JSON.stringify({ ok: true, message: "Schema initialized" }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
