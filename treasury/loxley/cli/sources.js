'use strict';
/* sources: the explorer (blockscout) and dexscreener. every function returns null on any failure; the caller
   prints n/a and moves on. */
function makeSources(env, stats) {
  stats = stats || { calls: 0, fails: 0 };
  const timeout = env.num('HTTP_TIMEOUT_MS');
  const down = {};   /* host → until: two timeouts in a row and the host is skipped for twenty seconds */
  const why = {};    /* host → why it last refused, so doctor can say more than 'no answer' */
  /* a request with no user agent is what most edge filters in front of a public explorer refuse first, so send
     an honest one. HTTP_USER_AGENT overrides it for a host that wants something else. */
  const UA = env.HTTP_USER_AGENT || 'loxley/' + require('../package.json').version + ' (+https://github.com/shmidtqq65/loxley)';
  const reason = (host, r) => {
    if ((r.status === 403 || r.status === 401) && host === BS_HOST) return 'http ' + r.status + (KEY ? ': the key was refused. check it at dev.blockscout.com' : ': this api wants a key. a free one at dev.blockscout.com, then EXPLORER_API_KEY= in .env');
    if (r.status === 403 || r.status === 401) return 'http ' + r.status + ': the host refused this client. a vpn or proxy exit is the usual cause, and a browser on the same address often still opens it';
    if (r.status === 429) return 'http 429: rate limited, back off or use your own endpoint';
    if (r.status === 404) return 'http 404: nothing at that path. check the url';
    if (r.status >= 500) return 'http ' + r.status + ': the host is having a bad time';
    return 'http ' + r.status;
  };
  /* a reservation spacer: the free tier of the explorer's api is five a second, so calls to that host are handed
     out at least EXPLORER_SPACING_MS apart even when the callers ask all at once */
  const lastAt = {};
  const space = async host => {
    const ms = host === BS_HOST ? env.num('EXPLORER_SPACING_MS') : 0;
    if (!ms) return;
    const now = Date.now(), wait = Math.max(0, (lastAt[host] || 0) + ms - now);
    lastAt[host] = now + wait;
    if (wait) await new Promise(r => setTimeout(r, wait));
  };
  async function getJson(url) {
    const host = url.split('/')[2];
    if (down[host] && Date.now() < down[host].until) { stats.fails++; return null; }
    await space(host);
    const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), timeout);
    try {
      stats.calls++;
      const r = await fetch(keyed(url), { headers: { accept: 'application/json', 'user-agent': UA }, signal: ctrl.signal });
      down[host] = { n: 0, until: 0 };
      if (!r.ok) { stats.fails++; why[host] = reason(host, r); return null; }
      delete why[host];
      return await r.json();
    } catch (e) {
      stats.fails++;
      /* node's fetch says only 'fetch failed'; what happened is one or two levels down in .cause */
      let c = e, code = e.code || '', deep = '';
      for (let i = 0; i < 3 && c; i++) { if (c.code) code = c.code; if (c.errors && c.errors[0] && c.errors[0].code) code = c.errors[0].code; if (c !== e && c.message) deep = c.message; c = c.cause; }
      why[host] = /abort/i.test(e.name || '') ? 'timed out after ' + timeout + ' ms (HTTP_TIMEOUT_MS)'
        : code === 'ENOTFOUND' ? 'dns does not know that host'
        : code === 'ECONNREFUSED' ? 'nothing is listening there'
        : code === 'ECONNRESET' ? 'the connection was cut, which a filter in the middle often does'
        : code === 'CERT_HAS_EXPIRED' || /certificate/i.test(e.message || '') ? 'tls refused: ' + e.message
        : (code ? code + ': ' : '') + (deep || e.message || 'network error');
      const d = down[host] = down[host] || { n: 0, until: 0 }; d.n++; if (d.n >= 2) d.until = Date.now() + 20000;
      return null;
    }
    finally { clearTimeout(tm); }
  }
  /* why the last call to that host failed, for the messages a person has to act on. redacted on the way out:
     no message the terminal prints may ever carry the key, whatever a driver put in an error string. */
  const redact = t => String(t).replace(/apikey=[^&\s]+/gi, 'apikey=…').replace(/proapi_[A-Za-z0-9_-]+/g, 'proapi_…');
  const whyFor = u => redact(why[String(u).split('/')[2]] || 'no answer');
  /* the api the terminal reads and the explorer a person clicks are two different things: blockscout moved this
     chain's api onto api.blockscout.com behind a free key, while the web explorer stayed where it was. Overriding
     EXPLORER_URL (your own blockscout, or the mock in test/) moves the api with it, so nothing self-hosted breaks. */
  const D = require('./env.js').DEFAULTS;
  const ownExplorer = env.EXPLORER_URL !== D.EXPLORER_URL;
  const apiRoot = (ownExplorer && (env.EXPLORER_API || D.EXPLORER_API) === D.EXPLORER_API) ? env.EXPLORER_URL : (env.EXPLORER_API || env.EXPLORER_URL);
  const BS = String(apiRoot).replace(/\/$/, '') + '/api/v2';
  const BS_HOST = BS.split('/')[2];
  const KEY = String(env.EXPLORER_API_KEY || '').trim();
  /* the key rides as a query parameter, the way blockscout's pro api takes it. it is never printed: no message in
     the tree carries a url, only a host and a status. */
  const keyed = u => (KEY && u.indexOf(BS) === 0 ? u + (u.indexOf('?') >= 0 ? '&' : '?') + 'apikey=' + encodeURIComponent(KEY) : u);
  const hasKey = () => !!KEY;
  const DEX = env.DEX_URL.replace(/\/$/, '');
  const chain = env.CHAIN_SLUG;

  const ex = {
    stats: () => getJson(BS + '/stats'),
    token: a => getJson(BS + '/tokens/' + a),
    holders: a => getJson(BS + '/tokens/' + a + '/holders'),
    transfers: a => getJson(BS + '/tokens/' + a + '/transfers'),
    contract: a => getJson(BS + '/smart-contracts/' + a),
    address: a => getJson(BS + '/addresses/' + a),
    counters: a => getJson(BS + '/addresses/' + a + '/counters'),
    txs: a => getJson(BS + '/addresses/' + a + '/transactions'),
    tx: h => getJson(BS + '/transactions/' + h),
    block: n => getJson(BS + '/blocks/' + n),
    blocks: () => getJson(BS + '/blocks?type=block'),
    logs: a => getJson(BS + '/addresses/' + a + '/logs')
  };
  const dex = {
    pairs: async a => { const j = await getJson(DEX + '/latest/dex/tokens/' + a); if (!j || !j.pairs) return null; return j.pairs.filter(p => p.chainId === chain).sort((x, y) => ((y.liquidity && y.liquidity.usd) || 0) - ((x.liquidity && x.liquidity.usd) || 0)); },
    boosts: () => getJson(DEX + '/token-boosts/top/v1'),
    profiles: () => getJson(DEX + '/token-profiles/latest/v1'),
    /* the best pool for each of many tokens: one batch call per 30 addresses, one call per token when the batch endpoint is not served */
    pairsMany: async addrs => {
      const out = {};
      const take = list => (list || []).forEach(p => { if (!p || p.chainId !== chain || !p.baseToken) return; const k = String(p.baseToken.address).toLowerCase(); const liq = (p.liquidity && p.liquidity.usd) || 0; if (!out[k] || liq > ((out[k].liquidity && out[k].liquidity.usd) || 0)) out[k] = p; });
      for (let i = 0; i < addrs.length; i += 30) {
        const batch = addrs.slice(i, i + 30);
        const j = await getJson(DEX + '/tokens/v1/' + chain + '/' + batch.join(','));
        if (Array.isArray(j)) take(j);
        else for (const a of batch) { const one = await getJson(DEX + '/latest/dex/tokens/' + a); take(one && one.pairs); }
      }
      return out;
    }
  };

  /* the explorer's view of a token: supply, holders, verification, the same shape the desk uses */
  async function chainView(token) {
    const [tok, hold, sc] = await Promise.all([ex.token(token), ex.holders(token), ex.contract(token)]);
    const out = { supply: null, decimals: null, top: null, top10: null, holdersKnown: false, verified: undefined, holdersCount: null, icon: null, explorer: !!tok };
    if (tok) {
      out.decimals = tok.decimals != null ? parseInt(tok.decimals, 10) : 18;
      if (tok.total_supply != null) out.supply = parseFloat(tok.total_supply) / Math.pow(10, out.decimals || 18);
      const hc = tok.holders != null ? tok.holders : tok.holders_count; if (hc != null) out.holdersCount = parseInt(hc, 10);
      if (tok.icon_url) out.icon = tok.icon_url;
      out.symbol = tok.symbol || null; out.name = tok.name || null;
    }
    out.verified = sc ? !!(sc.is_verified || sc.is_fully_verified) : (tok ? false : undefined);
    const items = hold && hold.items;
    if (items && items.length && out.supply) {
      let s0 = 0; out.top = [];
      for (let i = 0; i < Math.min(20, items.length); i++) {
        const it = items[i], amt = parseFloat(it.value) / Math.pow(10, out.decimals || 18), ad = (it.address && (it.address.hash || it.address)) || '';
        if (i < 10) s0 += amt;
        out.top.push({ address: String(ad).toLowerCase(), amount: amt, pct: amt / out.supply * 100 });
      }
      out.top10 = s0 / out.supply * 100; out.holdersKnown = true;
    }
    return out;
  }

  /* the deployer x-ray, the same reads the desk makes */
  async function xray(token, known) {
    let dep = known && known.deployer, born = known && known.born, ctx = null;
    if (!dep) {
      const a = await ex.address(token);
      ctx = a && (a.creation_transaction_hash || a.creation_tx_hash);
      if (ctx) { const t = await ex.tx(ctx); dep = (t && t.from && t.from.hash) || (a && a.creator_address_hash) || null; born = t && t.timestamp ? Date.parse(t.timestamp) : null; }
      else dep = (a && a.creator_address_hash) || null;
    }
    if (!dep) return null;
    dep = String(dep).toLowerCase();
    const [a, c, txs] = await Promise.all([ex.address(dep), ex.counters(dep), ex.txs(dep)]);
    const items = (txs && txs.items) || [];
    const launchTo = {}; [env.FACTORY, env.LAUNCH_ROUTER, env.LAUNCH_DEPLOYER].forEach(x => { launchTo[x.toLowerCase()] = 1; });
    let launches = 0, lastT = null, firstT = null;
    items.forEach(t => {
      const to = ((t.to && t.to.hash) || '').toLowerCase(), m = String(t.method || '').toLowerCase();
      if (launchTo[to] || /launch/.test(m) || !t.to || t.created_contract) launches++;
      const ts = t.timestamp ? Date.parse(t.timestamp) : null; if (ts) { if (lastT == null || ts > lastT) lastT = ts; if (firstT == null || ts < firstT) firstT = ts; }
    });
    return { dep, balance: a && a.coin_balance != null ? parseFloat(a.coin_balance) / 1e18 : null, ntx: c && c.transactions_count != null ? parseInt(c.transactions_count, 10) : null,
      ntt: c && c.token_transfers_count != null ? parseInt(c.token_transfers_count, 10) : null, launches, sample: items.length, more: !!(txs && txs.next_page_params), lastT, firstT, born: born || null, ctx };
  }
  function xrayTag(d) {
    if (!d || d.sample === 0) return { t: 'NO HISTORY', s: 'na' };
    if (d.launches >= 5) return { t: 'SERIAL', s: 'bad' };
    if (d.launches >= 2) return { t: 'REPEAT', s: 'warn' };
    return { t: 'FRESH HANDS', s: 'ok' };
  }

  return { getJson, why: whyFor, api: BS, hasKey, ex, dex, chainView, xray, xrayTag, stats };
}
module.exports = { makeSources };
