import posthog from "posthog-js";

const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;

declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
    dataLayer: unknown[];
  }
}

export const COOKIE_CONSENT_KEY = "shit-cookie-consent";
export type CookieConsent = "accept_all" | "essential_only" | "reject_all";

export function getStoredConsent(): CookieConsent | null {
  try {
    return localStorage.getItem(COOKIE_CONSENT_KEY) as CookieConsent | null;
  } catch {
    return null;
  }
}

function updateConsent(granted: boolean): void {
  if (typeof window.gtag !== "function") return;
  const state = granted ? "granted" : "denied";
  window.gtag("consent", "update", {
    ad_storage: state,
    ad_user_data: state,
    ad_personalization: state,
    analytics_storage: state,
  });
}

export function applyAnalyticsConsent(choice: CookieConsent): void {
  try {
    localStorage.setItem(COOKIE_CONSENT_KEY, choice);
  } catch {}
  if (choice === "accept_all") {
    updateConsent(true);
    posthog.opt_in_capturing();
  } else {
    updateConsent(false);
    posthog.opt_out_capturing();
  }
}

export function initializeAnalytics(): void {
  const consent = getStoredConsent();
  if (consent === "accept_all") {
    updateConsent(true);
  } else if (consent === "essential_only" || consent === "reject_all") {
    updateConsent(false);
  }

  const posthogKey = import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const posthogHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
  const posthogIngestHost = import.meta.env.VITE_PUBLIC_POSTHOG_INGEST_HOST ?? posthogHost;

  if (posthogKey) {
    posthog.init(posthogKey, {
      api_host: posthogIngestHost,
      ui_host: posthogHost,
      // Hash-router-aware: PostHog's "history_change" diffs window.location.pathname,
      // which never changes under createHashRouter. We capture $pageview manually from
      // a useLocation listener instead.
      capture_pageview: false,
      person_profiles: "identified_only",
      capture_pageleave: true,
      ip: false,
      cross_subdomain_cookie: true,
      capture_exceptions: true,
      opt_out_capturing_by_default: false,
      // Minimum recording duration (5s) is configured server-side under
      // PostHog → Project Settings → Session Replay (this version of
      // posthog-js does not expose minimumDurationMilliseconds at init).
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: "*",
        maskTextFn: (text, element) => {
          if (element?.dataset["capture"] === "true") return text;
          return "*".repeat(text.trim().length);
        },
      },
    });

    if (consent === "essential_only" || consent === "reject_all") {
      posthog.opt_out_capturing();
    }

    captureFirstTouch();
  }
}

// ─── First-touch attribution ──────────────────────────────────────────────────

const FIRST_TOUCH_KEY = "ph_first_touch";

interface FirstTouch {
  source: string;
  utm_campaign?: string;
  utm_medium?: string;
  landing_page: string;
}

function getUtmParams(): Record<string, string> {
  const params = new URLSearchParams(window.location.search);
  const utm: Record<string, string> = {};
  for (const key of ["utm_source", "utm_campaign", "utm_medium", "utm_content", "utm_term"]) {
    const val = params.get(key);
    if (val) utm[key] = val;
  }
  return utm;
}

function computeFirstTouchSource(utm: Record<string, string>, referrer: string): string {
  if (utm.utm_source) return utm.utm_source.toLowerCase();
  if (!referrer) return "direct";
  if (/twitter\.com|t\.co|x\.com/.test(referrer)) return "twitter";
  if (/discord/.test(referrer)) return "discord";
  if (/forum\.shitfinance/.test(referrer)) return "forum";
  if (/app\.shit\.finance/.test(referrer)) return "dapp-internal";
  if (/shit\.finance/.test(referrer)) return "website";
  if (/google\.|bing\.|duckduckgo\.|yahoo\./.test(referrer)) return "organic";
  return "referral-other";
}

function captureFirstTouch(): void {
  if (sessionStorage.getItem(FIRST_TOUCH_KEY)) return;
  const utm = getUtmParams();
  const data: FirstTouch = {
    source: computeFirstTouchSource(utm, document.referrer),
    utm_campaign: utm.utm_campaign,
    utm_medium: utm.utm_medium,
    landing_page: window.location.hash || window.location.pathname,
  };
  sessionStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(data));
}

function getFirstTouch(): FirstTouch | null {
  const raw = sessionStorage.getItem(FIRST_TOUCH_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FirstTouch;
  } catch {
    return null;
  }
}

function track(eventName: string, props?: Record<string, unknown>): void {
  if (GA_MEASUREMENT_ID && typeof window.gtag === "function") {
    window.gtag("event", eventName, props);
  }
  posthog.capture(eventName, props);
}

function trackTransaction(product: string, action: string, props?: Record<string, unknown>): void {
  const payload = {
    product,
    action,
    phase: "confirmed",
    $set_once: { first_product: product },
    ...props,
  };
  if (GA_MEASUREMENT_ID && typeof window.gtag === "function") {
    window.gtag("event", `${product}_${action}_confirmed`, props);
  }
  posthog.capture("transaction_confirmed", payload);
}

export function trackTransactionFailed(
  product: string,
  action: string,
  props?: Record<string, unknown>,
): void {
  posthog.capture("transaction_failed", { product, action, phase: "failed", ...props });
}

// ─── Identity ────────────────────────────────────────────────────────────────

async function hashAddress(address: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(address.toLowerCase()),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function identifyWallet(
  address: string,
  context: { walletType?: string; chainId?: number } = {},
): Promise<void> {
  const hashedAddress = await hashAddress(address);
  const firstTouch = getFirstTouch();
  const onboarding = getOnboardingPersonProperties();
  posthog.identify(
    hashedAddress,
    {
      wallet_type: context.walletType,
      connected_chain_id: context.chainId,
      ...onboarding.set,
    },
    {
      first_connect_date: new Date().toISOString(),
      first_touch_source: firstTouch?.source,
      first_touch_utm_campaign: firstTouch?.utm_campaign,
      first_touch_utm_medium: firstTouch?.utm_medium,
      first_touch_landing_page: firstTouch?.landing_page,
      ...onboarding.setOnce,
    },
  );
}

export function resetIdentity(): void {
  posthog.reset();
}

// ─── Navigation ──────────────────────────────────────────────────────────────

export function trackPageView({ pathname, search }: { pathname: string; search: string }): void {
  if (GA_MEASUREMENT_ID && typeof window.gtag === "function") {
    window.gtag("event", "page_view", { page_path: pathname + search });
  }
  posthog.capture("$pageview", {
    $current_url: window.location.href,
    $pathname: pathname,
  });
}

// ─── Wallet ───────────────────────────────────────────────────────────────────

export function trackWalletConnect(params: { walletType?: string; chainId?: number }): void {
  track("wallet_connected", {
    wallet_type: params.walletType,
    chain_id: params.chainId,
  });
}

export function trackWalletDisconnect(): void {
  track("wallet_disconnected");
}

// ─── SHIT ─────────────────────────────────────────────────────────────────────

/** Wrap-page conversions (wrap / wrap_sshit / unwrap / unstake_sshit). */
export function trackWrapFlow(params: { action: string; amount: string; txHash?: string }): void {
  trackTransaction("shit", params.action, { amount: params.amount, tx_hash: params.txHash });
}

export function trackBridgeShit(params: {
  amount: string;
  srcChain: string;
  dstChain: string;
  txHash?: string;
}): void {
  trackTransaction("shit", "bridge", {
    amount: params.amount,
    src_chain: params.srcChain,
    dst_chain: params.dstChain,
    tx_hash: params.txHash,
  });
}

// ─── Cooler V2 ────────────────────────────────────────────────────────────────

export function trackCoolerBorrow(params: {
  borrowAmount: string;
  collateralAmount: string;
  txHash?: string;
}): void {
  trackTransaction("cooler", "borrow", {
    borrow_amount: params.borrowAmount,
    collateral_amount: params.collateralAmount,
    tx_hash: params.txHash,
  });
}

export function trackCoolerRepay(params: { repayAmount: string; txHash?: string }): void {
  trackTransaction("cooler", "repay", { repay_amount: params.repayAmount, tx_hash: params.txHash });
}

// ─── Onboarding (feature tour) ───────────────────────────────────────────────

// Onboarding mostly happens before wallet connect, when the user is anonymous.
// Under `person_profiles: 'identified_only'`, anonymous `$set` mutations do not
// create a person profile, so to be safe we persist outcome to localStorage and
// replay via `identifyWallet`. We also include `$set` on terminal events so
// already-identified users (who complete the tour AFTER connecting) get their
// person record updated immediately, without waiting for a chain/wallet switch.

const ONBOARDING_TOUR_KEY = "shit-feature-tour"; // shared with useFeatureTour
const ONBOARDING_FIRST_SEEN_KEY = "shit-onboarding-first-seen";

type OnboardingOutcome = "skipped_modal" | "skipped_tour" | "completed";

export function recordOnboardingFirstSeen(): void {
  try {
    if (!localStorage.getItem(ONBOARDING_FIRST_SEEN_KEY)) {
      localStorage.setItem(ONBOARDING_FIRST_SEEN_KEY, new Date().toISOString());
    }
  } catch {
    // ignore storage failures
  }
}

function getOnboardingPersonProperties(): {
  set: Record<string, unknown>;
  setOnce: Record<string, unknown>;
} {
  const set: Record<string, unknown> = {};
  const setOnce: Record<string, unknown> = {};

  try {
    const firstSeen = localStorage.getItem(ONBOARDING_FIRST_SEEN_KEY);
    if (firstSeen) setOnce.onboarding_first_seen_at = firstSeen;

    const tourState = localStorage.getItem(ONBOARDING_TOUR_KEY);
    if (tourState === "completed") {
      set.onboarding_outcome = "completed" satisfies OnboardingOutcome;
    } else if (tourState === "skipped") {
      set.onboarding_outcome = "skipped_modal" satisfies OnboardingOutcome;
    } else if (tourState !== null) {
      const step = Number(tourState);
      if (!Number.isNaN(step)) {
        set.onboarding_outcome = "skipped_tour" satisfies OnboardingOutcome;
        set.onboarding_last_step = step;
      }
    }
  } catch {
    // ignore storage failures
  }

  return { set, setOnce };
}

export function trackOnboardingModalShown(viewportWidth: number): void {
  recordOnboardingFirstSeen();
  track("onboarding_modal_shown", {
    device_type: "desktop",
    viewport_width: viewportWidth,
  });
}

export function trackOnboardingModalSkipped(method: "skip_button" | "backdrop"): void {
  track("onboarding_modal_skipped", {
    dismissal_method: method,
    $set: { onboarding_outcome: "skipped_modal" satisfies OnboardingOutcome },
  });
}

export function trackOnboardingTourStarted(): void {
  track("onboarding_tour_started");
}

export function trackOnboardingStepViewed(
  stepIndex: number,
  stepName: string,
  totalSteps: number,
): void {
  track("onboarding_step_viewed", {
    step_index: stepIndex,
    step_name: stepName,
    total_steps: totalSteps,
  });
}

export function trackOnboardingStepAdvanced(fromStep: number): void {
  track("onboarding_step_advanced", {
    from_step: fromStep,
    to_step: fromStep + 1,
  });
}

export function trackOnboardingTourSkipped(stepIndex: number, stepName: string): void {
  track("onboarding_tour_skipped", {
    step_index: stepIndex,
    step_name: stepName,
    $set: {
      onboarding_outcome: "skipped_tour" satisfies OnboardingOutcome,
      onboarding_last_step: stepIndex,
    },
  });
}

export function trackOnboardingTourCompleted(durationMs: number, totalSteps: number): void {
  track("onboarding_tour_completed", {
    total_steps: totalSteps,
    duration_ms: durationMs,
    $set: { onboarding_outcome: "completed" satisfies OnboardingOutcome },
  });
}

export function trackOnboardingSuppressedMobile(viewportWidth: number): void {
  recordOnboardingFirstSeen();
  track("onboarding_suppressed_mobile", { viewport_width: viewportWidth });
}

// ─── Engagement funnels ──────────────────────────────────────────────────────

export function trackCtaClick(params: {
  cta_id: string;
  cta_label: string;
  destination?: string;
}): void {
  track("cta_clicked", params);
}

export function trackSectionView(params: { section_id: string; section_label: string }): void {
  track("section_viewed", params);
}

export function trackShareClick(params: { platform: string; content_type: string }): void {
  track("share_clicked", params);
}

// ─── Network quality ──────────────────────────────────────────────────────────

export function trackNetworkQuality(): void {
  const conn = (
    navigator as Navigator & {
      connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };
    }
  ).connection;
  if (!conn) return;
  track("network_quality", {
    effective_type: conn.effectiveType,
    downlink: conn.downlink,
    rtt: conn.rtt,
    save_data: conn.saveData,
  });
}
