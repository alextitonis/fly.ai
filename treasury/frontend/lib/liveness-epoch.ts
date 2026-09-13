import { EPOCH_DURATION_HOURS } from "@/lib/constants";

/**
 * Get the next epoch boundary (00:00, 08:00, or 16:00 UTC)
 */
export function getNextEpochTime(): Date {
  const now = new Date();
  const utcHours = now.getUTCHours();
  const nextEpochHour = Math.ceil((utcHours + 1) / EPOCH_DURATION_HOURS) * EPOCH_DURATION_HOURS;

  const next = new Date(now);
  if (nextEpochHour >= 24) {
    next.setUTCDate(next.getUTCDate() + 1);
    next.setUTCHours(0, 0, 0, 0);
  } else {
    next.setUTCHours(nextEpochHour, 0, 0, 0);
  }
  return next;
}

/**
 * Get remaining time until next epoch
 */
export function getEpochTimeRemaining(): {
  hours: number;
  minutes: number;
  seconds: number;
  progress: number;
} {
  const now = Date.now();
  const next = getNextEpochTime().getTime();
  const diff = Math.max(0, next - now);
  const totalMs = EPOCH_DURATION_HOURS * 60 * 60 * 1000;
  const elapsed = totalMs - diff;

  return {
    hours: Math.floor(diff / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
    progress: (elapsed / totalMs) * 100,
  };
}

/**
 * Get Monday 00:00 UTC of the current week
 */
export function getWeekStartUTC(): Date {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? 6 : day - 1; // Monday = 0
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

/**
 * Get the current epoch number within the week (1-21)
 */
export function getCurrentWeekEpoch(): number {
  const weekStart = getWeekStartUTC();
  const now = Date.now();
  const elapsedMs = now - weekStart.getTime();
  const epochMs = EPOCH_DURATION_HOURS * 60 * 60 * 1000;
  return Math.min(21, Math.floor(elapsedMs / epochMs) + 1);
}
