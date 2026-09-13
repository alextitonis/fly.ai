import { getDb } from "./_db";

interface BindBody {
  user_address: string;
  referrer_address: string;
  tx_hash?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const onRequestPost = async (context: any) => {
  const db = getDb(context.env as Record<string, unknown>);

  try {
    const body = (await context.request.json()) as BindBody;

    if (!body.user_address || !body.referrer_address) {
      return new Response(JSON.stringify({ ok: false, error: "Missing user_address or referrer_address" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (body.user_address.toLowerCase() === body.referrer_address.toLowerCase()) {
      return new Response(JSON.stringify({ ok: false, error: "Cannot refer self" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Insert or ignore (user can only be bound once)
    await db
      .prepare(
        "INSERT OR IGNORE INTO referrals (user_address, referrer_address, tx_hash) VALUES (?, ?, ?)",
      )
      .bind(body.user_address.toLowerCase(), body.referrer_address.toLowerCase(), body.tx_hash ?? null)
      .run();

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
