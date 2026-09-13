'use strict';
/* notify: a line to telegram and discord when something happens to your money. off unless configured. */
function makeNotifier(env, log) {
  const tg = env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID ? { url: String(env.TELEGRAM_API || 'https://api.telegram.org').replace(/\/$/, '') + '/bot' + env.TELEGRAM_BOT_TOKEN + '/sendMessage', chat: env.TELEGRAM_CHAT_ID } : null;
  const dc = env.DISCORD_WEBHOOK ? String(env.DISCORD_WEBHOOK) : null;
  const stats = { sent: 0, failed: 0 };
  const on = !!(tg || dc);
  async function post(url, body) {
    const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 6000);
    try { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal }); if (!r.ok) throw new Error('http ' + r.status); stats.sent++; }
    catch (e) { stats.failed++; if (log && stats.failed <= 2) log.warn('notify: ' + e.message); }
    finally { clearTimeout(tm); }
  }
  /* text is plain; markdown is off on purpose so a token name cannot break the message */
  function send(text) {
    if (!on) return Promise.resolve();
    const jobs = [];
    if (tg) jobs.push(post(tg.url, { chat_id: tg.chat, text: 'LOXLEY · ' + text, disable_web_page_preview: true }));
    if (dc) jobs.push(post(dc, { content: 'LOXLEY · ' + text }));
    return Promise.all(jobs).then(() => { });
  }
  const where = [tg ? 'telegram' : null, dc ? 'discord' : null].filter(Boolean).join(' + ');
  return { on, send, stats, where };
}
module.exports = { makeNotifier };
