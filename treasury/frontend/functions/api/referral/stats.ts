import { getDb } from "./_db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const onRequestGet = async (context: any) => {
  const db = getDb(context.env as Record<string, unknown>);

  try {
    const url = new URL(context.request.url);
    const address = url.searchParams.get("address");

    if (!address) {
      return new Response(JSON.stringify({ ok: false, error: "Missing address parameter" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const addr = address.toLowerCase();

    // Get total recorded fees per token
    const recordedFees = await db
      .prepare(
        `SELECT token_address, SUM(fee_amount) as total
         FROM fee_records
         WHERE referrer_address = ?
         GROUP BY token_address`,
      )
      .bind(addr)
      .all<{ token_address: string; total: string }>();

    // Get total claimed per token
    const claimedFees = await db
      .prepare(
        `SELECT token_address, SUM(amount_claimed) as total
         FROM fee_claims
         WHERE referrer_address = ?
         GROUP BY token_address`,
      )
      .bind(addr)
      .all<{ token_address: string; total: string }>();

    // Calculate pending = recorded - claimed
    const claimedMap = new Map<string, bigint>();
    for (const c of claimedFees.results) {
      claimedMap.set(c.token_address, BigInt(c.total));
    }
    const pendingFees = recordedFees.results.map((r) => ({
      token_address: r.token_address,
      total: (BigInt(r.total) - (claimedMap.get(r.token_address) ?? 0n)).toString(),
    })).filter((f) => BigInt(f.total) > 0n);

    // Get total claimed
    const totalClaimed = claimedFees.results;

    // Get referral count
    const referralCount = await db
      .prepare("SELECT COUNT(*) as count FROM referrals WHERE referrer_address = ?")
      .bind(addr)
      .first<{ count: number }>();

    // Get list of referred users
    const referredUsers = await db
      .prepare(
        `SELECT user_address, bound_at FROM referrals WHERE referrer_address = ? ORDER BY bound_at DESC LIMIT 50`,
      )
      .bind(addr)
      .all<{ user_address: string; bound_at: number }>();

    // Check if this address is bound to a referrer
    const myReferrer = await db
      .prepare("SELECT referrer_address FROM referrals WHERE user_address = ?")
      .bind(addr)
      .first<{ referrer_address: string }>();

    return new Response(
      JSON.stringify({
        ok: true,
        pendingFees,
        totalClaimed,
        referralCount: referralCount?.count ?? 0,
        referredUsers: referredUsers.results,
        myReferrer: myReferrer?.referrer_address ?? null,
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
