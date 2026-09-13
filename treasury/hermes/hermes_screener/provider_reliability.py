"""
Provider Reliability Tracker
=============================

Tracks per-provider success/failure rates, detects drift/degradation,
and auto-quarantines degraded providers. Enables adaptive weight adjustment
so the pipeline degrades gracefully rather than failing hard.

Adapted from memecoin-bot's runtime.py provider reliability and drift detection patterns.

Usage:
    from hermes_screener.provider_reliability import ProviderTracker

    tracker = ProviderTracker()

    if health.quarantined:
        # Skip this provider
        pass
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any


# ─── Configuration ──────────────────────────────────────────────────────────────

# Error rate thresholds for status transitions
WARNING_ERROR_RATE = 0.25
CRITICAL_ERROR_RATE = 0.50

# Response time drift: if p95 > baseline * DRIFT_MULT, flag as degraded
DRIFT_MULTIPLIER = 3.0

# Minimum samples before drift detection kicks in
DRIFT_MIN_SAMPLES = 5

# How many recent records to keep per provider
MAX_RECORDS = 100

# Quarantine duration in seconds (auto-recovery)
QUARANTINE_DURATION_SEC = 300  # 5 minutes


@dataclass(slots=True)
class ProviderRecord:
    timestamp: float
    success: bool
    elapsed_ms: float
    error: str | None = None


@dataclass(slots=True)
class ProviderHealth:
    provider_name: str
    total_requests: int
    success_count: int
    error_count: int
    error_rate: float
    p50_ms: float
    p95_ms: float
    status: str  # "healthy", "warning", "critical", "quarantined"
    quarantined: bool
    quarantine_reason: str | None
    quarantine_until: float | None
    last_error: str | None
    last_success_at: float | None
    last_failure_at: float | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "provider_name": self.provider_name,
            "total_requests": self.total_requests,
            "success_count": self.success_count,
            "error_count": self.error_count,
            "error_rate": round(self.error_rate, 4),
            "p50_ms": round(self.p50_ms, 1),
            "p95_ms": round(self.p95_ms, 1),
            "status": self.status,
            "quarantined": self.quarantined,
            "quarantine_reason": self.quarantine_reason,
            "quarantine_until": self.quarantine_until,
            "last_error": self.last_error,
            "last_success_at": self.last_success_at,
            "last_failure_at": self.last_failure_at,
        }


class ProviderTracker:
    """
    Tracks reliability metrics per provider and manages quarantine state.
    """

    def __init__(
        self,
        *,
        warning_error_rate: float = WARNING_ERROR_RATE,
        critical_error_rate: float = CRITICAL_ERROR_RATE,
        drift_multiplier: float = DRIFT_MULTIPLIER,
        drift_min_samples: int = DRIFT_MIN_SAMPLES,
        quarantine_duration: float = QUARANTINE_DURATION_SEC,
    ) -> None:
        self.warning_error_rate = warning_error_rate
        self.critical_error_rate = critical_error_rate
        self.drift_multiplier = drift_multiplier
        self.drift_min_samples = drift_min_samples
        self.quarantine_duration = quarantine_duration
        self._records: dict[str, list[ProviderRecord]] = {}
        self._quarantine: dict[str, float] = {}  # provider_name -> until_timestamp
        self._quarantine_reasons: dict[str, str] = {}
        self._baselines: dict[str, float] = {}  # provider_name -> baseline_p50_ms

    def record(
        self,
        provider_name: str,
        *,
        success: bool,
        elapsed_ms: float = 0.0,
        error: str | None = None,
    ) -> None:
        """Record a provider request outcome."""
        now = time.time()
        record = ProviderRecord(
            timestamp=now,
            success=success,
            elapsed_ms=elapsed_ms,
            error=error,
        )

        if provider_name not in self._records:
            self._records[provider_name] = []
            self._baselines[provider_name] = elapsed_ms

        records = self._records[provider_name]
        records.append(record)

        # Trim to max
        if len(records) > MAX_RECORDS:
            records[:] = records[-MAX_RECORDS:]

        # Update baseline (exponential moving average)
        baseline = self._baselines.get(provider_name, elapsed_ms)
        self._baselines[provider_name] = baseline * 0.9 + elapsed_ms * 0.1

        # Auto-quarantine check
        health = self._compute_health(provider_name)
        if health.status == "critical" and not health.quarantined:
            self._quarantine[provider_name] = now + self.quarantine_duration
            self._quarantine_reasons[provider_name] = f"error_rate={health.error_rate:.2f}"
        elif self._detect_drift(provider_name):
            self._quarantine[provider_name] = now + self.quarantine_duration
            self._quarantine_reasons[provider_name] = f"latency_drift p95={health.p95_ms:.0f}ms"

    def health(self, provider_name: str) -> ProviderHealth:
        """Get current health status for a provider."""
        return self._compute_health(provider_name)

    def all_health(self) -> dict[str, ProviderHealth]:
        """Get health for all tracked providers."""
        return {name: self._compute_health(name) for name in self._records}

    def active_providers(self) -> list[str]:
        """Return list of non-quarantined providers."""
        now = time.time()
        active = []
        for name in self._records:
            until = self._quarantine.get(name, 0)
            if until < now:
                active.append(name)
        return active

    def quarantined_providers(self) -> list[str]:
        """Return list of currently quarantined providers."""
        now = time.time()
        return [name for name, until in self._quarantine.items() if until >= now]

    def weight(self, provider_name: str) -> float:
        """
        Get reliability weight for a provider (0.0-1.0).
        Used for weighted averaging of multi-provider results.
        """
        health = self._compute_health(provider_name)
        if health.quarantined:
            return 0.0
        if health.status == "healthy":
            return 1.0
        if health.status == "warning":
            return 0.5
        return 0.1  # critical but not quarantined

    def release_quarantine(self, provider_name: str) -> None:
        """Manually release a provider from quarantine."""
        self._quarantine.pop(provider_name, None)
        self._quarantine_reasons.pop(provider_name, None)

    def reset(self, provider_name: str | None = None) -> None:
        """Reset tracking for a provider or all providers."""
        if provider_name:
            self._records.pop(provider_name, None)
            self._quarantine.pop(provider_name, None)
            self._quarantine_reasons.pop(provider_name, None)
            self._baselines.pop(provider_name, None)
        else:
            self._records.clear()
            self._quarantine.clear()
            self._quarantine_reasons.clear()
            self._baselines.clear()

    def summary(self) -> dict[str, Any]:
        """Operator-facing summary of all provider health."""
        all_h = self.all_health()
        return {
            "total_providers": len(all_h),
            "healthy": sum(1 for h in all_h.values() if h.status == "healthy"),
            "warning": sum(1 for h in all_h.values() if h.status == "warning"),
            "critical": sum(1 for h in all_h.values() if h.status == "critical"),
            "quarantined": sum(1 for h in all_h.values() if h.quarantined),
            "providers": {name: h.to_dict() for name, h in all_h.items()},
        }

    def _compute_health(self, provider_name: str) -> ProviderHealth:
        """Compute health metrics for a provider."""
        records = self._records.get(provider_name, [])
        now = time.time()

        if not records:
            return ProviderHealth(
                provider_name=provider_name,
                total_requests=0,
                success_count=0,
                error_count=0,
                error_rate=0.0,
                p50_ms=0.0,
                p95_ms=0.0,
                status="healthy",
                quarantined=False,
                quarantine_reason=None,
                quarantine_until=None,
                last_error=None,
                last_success_at=None,
                last_failure_at=None,
            )

        total = len(records)
        errors = sum(1 for r in records if not r.success)
        successes = total - errors
        error_rate = errors / total if total > 0 else 0.0

        # Latency percentiles
        latencies = sorted(r.elapsed_ms for r in records)
        p50_idx = int(total * 0.5)
        p95_idx = int(total * 0.95)
        p50_ms = latencies[p50_idx] if latencies else 0.0
        p95_ms = latencies[min(p95_idx, total - 1)] if latencies else 0.0

        # Last success/failure timestamps
        last_success = max((r.timestamp for r in records if r.success), default=None)
        last_failure = max((r.timestamp for r in records if not r.success), default=None)
        last_error = next((r.error for r in reversed(records) if r.error), None)

        # Quarantine check
        quarantine_until = self._quarantine.get(provider_name, 0)
        quarantined = quarantine_until > now
        quarantine_reason = self._quarantine_reasons.get(provider_name)

        # Status determination
        if quarantined:
            status = "quarantined"
        elif error_rate >= self.critical_error_rate and total >= 3:
            status = "critical"
        elif error_rate >= self.warning_error_rate and total >= 3:
            status = "warning"
        else:
            status = "healthy"

        return ProviderHealth(
            provider_name=provider_name,
            total_requests=total,
            success_count=successes,
            error_count=errors,
            error_rate=error_rate,
            p50_ms=p50_ms,
            p95_ms=p95_ms,
            status=status,
            quarantined=quarantined,
            quarantine_reason=quarantine_reason,
            quarantine_until=quarantine_until if quarantined else None,
            last_error=last_error,
            last_success_at=last_success,
            last_failure_at=last_failure,
        )

    def _detect_drift(self, provider_name: str) -> bool:
        """
        Detect if provider latency has drifted significantly from baseline.
        Returns True if p95 latency > baseline * drift_multiplier.
        """
        records = self._records.get(provider_name, [])
        if len(records) < self.drift_min_samples:
            return False

        baseline = self._baselines.get(provider_name, 0)
        if baseline <= 0:
            return False

        recent = records[-self.drift_min_samples :]
        recent_latencies = sorted(r.elapsed_ms for r in recent)
        p95_idx = int(len(recent_latencies) * 0.95)
        p95 = recent_latencies[min(p95_idx, len(recent_latencies) - 1)]

        return p95 > baseline * self.drift_multiplier
