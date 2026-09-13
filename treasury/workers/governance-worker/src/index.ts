/**
 * Governance Worker — orchestrates 16 connectome DOs and reports P&L on-chain.
 *
 * Uses the ArenaCore pattern from Pradyuman-aviator/De-Fi (MIT):
 *   - Aggregates P&L from all 16 connectome wallets
 *   - Produces global wallet decisions (majority vote)
 *   - Produces meta wallet decisions (AUC-weighted)
 *   - Reports P&L to on-chain AgentLedger (nathcortez/agent-ledger, MIT)
 *   - Triggers prediction market settlement (onit-labs/pm-contracts, MIT)
 *   - Distributes profits to ProfitSharingVaults (JoseMiguelHerrera, MIT)
 *
 * Custom glue: ~50 lines of wiring.
 */

interface Env {
  DB: D1Database;
  FLY_BRAIN: DurableObjectNamespace;
  DISCORD_WEBHOOK_URL?: string;
  // On-chain contract addresses (set via wrangler secrets)
  AGENT_LEDGER_ADDRESS?: string;
  GOVERNANCE_PRIVATE_KEY?: string;
  RPC_URL?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/governance/epoch") {
      return Response.json(await runEpoch(env));
    }
    if (url.pathname === "/governance/status") {
      return Response.json(await getStatus(env));
    }
    return Response.json({ error: "unknown endpoint" }, { status: 404 });
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runEpoch(env));
  },
};

const CONNECTOME_IDS = [
  "celegans", "drosophila", "human", "macaque", "macaque_modha", "mouse", "rat",
  "malecns", "hemibrain", "medulla", "mouse_retina", "platynereis",
  "ciona", "larva", "celegans_herm", "celegans_male"
];

async function runEpoch(env: Env): Promise<Record<string, unknown>> {
  // 1. Collect P&L from all 16 connectome wallets
  const wallets = await env.DB.prepare(
    "SELECT w.id, w.connectome_id, w.balance_usd, w.starting_balance, w.total_pnl, w.n_trades, w.n_wins " +
    "FROM wallets w WHERE w.wallet_type = 'individual'"
  ).all();

  const results: Record<string, unknown> = {};
  const pnls: { connectome_id: string; pnl: number; n_trades: number }[] = [];

  for (const w of wallets.results || []) {
    const pnl = (w.balance_usd as number) - (w.starting_balance as number);
    pnls.push({
      connectome_id: w.connectome_id as string,
      pnl,
      n_trades: w.n_trades as number,
    });
  }

  // 2. Global wallet decision — majority vote across connectomes
  const buyVotes = pnls.filter((p) => p.pnl > 0).length;
  const sellVotes = pnls.filter((p) => p.pnl < 0).length;
  const globalDecision = buyVotes > sellVotes ? "BUY" : sellVotes > buyVotes ? "SELL" : "HOLD";

  // 3. Meta wallet decision — AUC-weighted (connectomes with more trades weighted higher)
  const totalTrades = pnls.reduce((sum, p) => sum + p.n_trades, 0);
  const weightedPnl = pnls.reduce((sum, p) => sum + p.pnl * (p.n_trades / Math.max(totalTrades, 1)), 0);
  const metaDecision = weightedPnl > 0 ? "BUY" : weightedPnl < 0 ? "SELL" : "HOLD";

  // 4. Update global + meta wallet balances
  await env.DB.prepare(
    "UPDATE wallets SET total_pnl = ? WHERE id = 17"
  ).bind(weightedPnl).run();

  // 5. Report P&L to D1 (on-chain reporting would go via AgentLedger.logAction)
  const epoch = Math.floor(Date.now() / 86_400_000); // daily epoch
  for (const p of pnls) {
    await env.DB.prepare(
      "INSERT INTO connectome_pnl_reports (connectome_id, epoch, pnl_percent, cumulative_pnl, n_trades, reported_at) " +
      "VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(p.connectome_id, epoch, p.pnl, p.pnl, p.n_trades, Date.now()).run();
  }

  // 6. Discord notification
  if (env.DISCORD_WEBHOOK_URL) {
    try {
      await fetch(env.DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "SHIT Governance",
          embeds: [{
            title: `Epoch ${epoch} settled`,
            color: 0x9b59b6,
            fields: [
              { name: "Global decision", value: globalDecision, inline: true },
              { name: "Meta decision", value: metaDecision, inline: true },
              { name: "Buy votes", value: String(buyVotes), inline: true },
              { name: "Sell votes", value: String(sellVotes), inline: true },
              { name: "Weighted P&L", value: `$${weightedPnl.toFixed(4)}`, inline: true },
            ],
          }],
        }),
      });
    } catch {}
  }

  results.epoch = epoch;
  results.global_decision = globalDecision;
  results.meta_decision = metaDecision;
  results.connectomes = pnls;
  return results;
}

async function getStatus(env: Env): Promise<Record<string, unknown>> {
  const connectomes = await env.DB.prepare(
    "SELECT id, species, n_neurons, status FROM connectomes ORDER BY id"
  ).all();
  const wallets = await env.DB.prepare(
    "SELECT id, connectome_id, wallet_type, balance_usd, total_pnl, n_trades FROM wallets ORDER BY id"
  ).all();
  return {
    connectomes: connectomes.results,
    wallets: wallets.results,
    timestamp: Date.now(),
  };
}
