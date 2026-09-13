import { getDb } from "./_db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const onRequestPost = async (context: any) => {
  const db = getDb(context.env as Record<string, unknown>);

  try {
    const body = await context.request.json();
    const { address, signature, twitter, bluesky } = body;

    if (!address || !signature) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing address or signature" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const addr = String(address).toLowerCase();
    const sig = String(signature);
    const tw = String(twitter || "");
    const bs = String(bluesky || "");
    const ts = new Date().toISOString();

    try {
      await db
        .prepare(
          "INSERT INTO whitelist_entries (address, signature, twitter, bluesky, timestamp) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(addr, sig, tw, bs, ts)
        .run();
    } catch (e) {
      if (String(e).includes("UNIQUE")) {
        return new Response(
          JSON.stringify({ ok: false, error: "Already on whitelist" }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        );
      }
      throw e;
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const onRequestGet = async (context: any) => {
  const db = getDb(context.env as Record<string, unknown>);

  try {
    const url = new URL(context.request.url);
    const address = url.searchParams.get("address");

    if (address) {
      const row = await db
        .prepare("SELECT address FROM whitelist_entries WHERE address = ?")
        .bind(String(address).toLowerCase())
        .first<{ address: string }>();

      return new Response(
        JSON.stringify({ ok: true, signed: !!row }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const result = await db
      .prepare(
        "SELECT address, twitter, bluesky, timestamp FROM whitelist_entries ORDER BY timestamp DESC LIMIT 200",
      )
      .all<{ address: string; twitter: string; bluesky: string; timestamp: string }>();

    const count = await db
      .prepare("SELECT COUNT(*) as count FROM whitelist_entries")
      .first<{ count: number }>();

    return new Response(
      JSON.stringify({
        ok: true,
        count: count?.count ?? 0,
        entries: result.results.map((e) => ({
          address: e.address,
          twitter: e.twitter || undefined,
          bluesky: e.bluesky || undefined,
          timestamp: e.timestamp,
        })),
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
