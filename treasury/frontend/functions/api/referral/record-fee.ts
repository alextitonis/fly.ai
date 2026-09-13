import { getDb } from "./_db";

interface RecordFeeBody {
  user_address: string;
  token_address: string;
  fee_amount: string;
  source: string;
  tx_hash?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const onRequestPost = async (context: any) => {
  const db = getDb(context.env as Record<string, unknown>);

  try {
    const body = (await context.request.json()) as RecordFeeBody;

    if (!body.user_address || !body.token_address || !body.fee_amount || !body.source) {
      return new Response(JSON.stringify({ ok: false, error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Look up the user's referrer
    const referral = await db
      .prepare("SELECT referrer_address FROM referrals WHERE user_address = ?")
      .bind(body.user_address.toLowerCase())
      .first<{ referrer_address: string }>();

    if (!referral) {
      // No referrer bound — nothing to record
      return new Response(JSON.stringify({ ok: true, recorded: false, reason: "no_referrer" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    await db
      .prepare(
        "INSERT INTO fee_records (user_address, referrer_address, token_address, fee_amount, source, tx_hash) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(
        body.user_address.toLowerCase(),
        referral.referrer_address,
        body.token_address.toLowerCase(),
        body.fee_amount,
        body.source,
        body.tx_hash ?? null,
      )
      .run();

    return new Response(JSON.stringify({ ok: true, recorded: true, referrer: referral.referrer_address }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
