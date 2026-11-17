/**
 * PostHog product analytics for the whole site (2026-11-17, the user: "implement posthog in the website in general").
 * nav.js loads this on every page (docs pages, the Trader Flies app, /fights, ...), so one file covers the site.
 *
 * - Off until POSTHOG_KEY is set (the project's public "phc_..." key from PostHog -> Project settings; it is meant to
 *   be public, it can only send events).
 * - Only on flyaiworld.com: local work and Vercel previews send nothing.
 * - Not on /compute: privacy.html (the compute site + browser extension policy) promises no analytics there.
 * - Pageviews follow the app's client-side route changes (history_change), so /traderflies/* counts each page.
 * - A signed-in visitor is identified by wallet address (public, lowercase), so funnels connect visit -> sign-in ->
 *   fly; sign-out resets it.
 * - Browser "Do Not Track" is respected.
 */
(function () {
  const POSTHOG_KEY = "phc_vBKCMpUSN5zQsoKFiCuyubVCXME5TirLTScsBkWxNncD";   // empty = analytics off
  const POSTHOG_HOST = "https://us.i.posthog.com";         // EU project: https://eu.i.posthog.com
  const SESSION_KEY = "flyai.compute.session";            // the site's one wallet session (nav.js, mine/web/account.ts)

  if (!POSTHOG_KEY || window.posthog) return;
  if (!/(^|\.)flyaiworld\.com$/.test(location.hostname)) return;
  if (/^\/compute(\/|$)/.test(location.pathname)) return;

  // PostHog's own loader snippet (queues calls until array.js arrives from its CDN)
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

  let lang = "en";
  try { lang = new URLSearchParams(location.search).get("lang") || localStorage.getItem("flyai.lang") || "en"; } catch {}

  window.posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: "identified_only",   // anonymous visitors stay events only (cheaper); wallets get a profile
    capture_pageview: "history_change",   // SPA route changes count as pageviews
    capture_pageleave: true,
    respect_dnt: true,
  });
  window.posthog.register({ site_lang: lang });

  // wallet identity: the session can change in another tab (sign in / out), so re-check on storage events too
  // (the last identified wallet is kept in localStorage, since sign-out usually reloads the page)
  const ID_KEY = "flyai.ph.wallet";
  let known = null;
  try { known = localStorage.getItem(ID_KEY); } catch {}
  function syncWallet() {
    let w = null;
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      if (s && s.wallet && s.expires_at > Date.now()) w = String(s.wallet).toLowerCase();
    } catch {}
    if (w === known) return;
    if (known) window.posthog.reset();                     // signed out, or another wallet signed in
    if (w) window.posthog.identify(w, { wallet: w });
    known = w;
    try { w ? localStorage.setItem(ID_KEY, w) : localStorage.removeItem(ID_KEY); } catch {}
  }
  syncWallet();
  window.addEventListener("storage", (e) => { if (e.key === SESSION_KEY) syncWallet(); });
  window.addEventListener("focus", syncWallet);
})();
