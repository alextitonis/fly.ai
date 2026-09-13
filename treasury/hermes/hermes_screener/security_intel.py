"""
Security Intelligence Aggregator
=================================

Chains multiple security providers (RugCheck, De.Fi, public fallback),
propagating enriched context forward between providers. Uses the highest risk score as
primary and merges all flags from successful providers.

Usage:
    from hermes_screener.security_intel import (
        RugCheckProvider, PublicFallbackProvider, aggregate_security
    )

    result = aggregate_security(token_dict, providers=[
        RugCheckProvider(),
        PublicFallbackProvider(),
    ])
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Protocol


class SecurityProvider(Protocol):
    """Protocol for security intelligence providers."""

    provider_name: str

    def fetch(self, token: dict[str, Any]) -> dict[str, Any]:
        """Fetch security intel for a token. Returns standardized provider result."""
        ...


@dataclass(slots=True)
class ProviderResult:
    provider_name: str
    status: str  # "ok" | "error"
    risk_score: float
    verdict: str
    reasons: list[str]
    security_flags: dict[str, Any]
    raw_data: dict[str, Any] = field(default_factory=dict)
    error: str | None = None
    fetched_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict[str, Any]:
        return {
            "provider_name": self.provider_name,
            "status": self.status,
            "provider_risk_score": round(self.risk_score, 4),
            "provider_verdict": self.verdict,
            "provider_reasons": self.reasons,
            "security_flags": self.security_flags,
            "raw_data": self.raw_data,
            "error": self.error,
            "fetched_at": self.fetched_at,
        }


def _verdict_from_score(score: float) -> str:
    """Map risk score to verdict."""
    if score >= 0.6:
        return "high_risk"
    if score >= 0.3:
        return "medium_risk"
    return "low_risk"


def _dedupe(items: list[str]) -> list[str]:
    """Deduplicate preserving order."""
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        key = item.lower().strip()
        if key not in seen:
            seen.add(key)
            out.append(item)
    return out


# ─── Provider Implementations ──────────────────────────────────────────────────





@dataclass(slots=True)
class RugCheckProvider:
    """RugCheck.xyz security check (Solana)."""

    provider_name: str = "rugcheck"

    def fetch(self, token: dict[str, Any]) -> dict[str, Any]:
        try:
            from hermes_screener.async_enrichment import enrich_rugcheck

            enrich_rugcheck(token)
        except Exception as exc:
            return ProviderResult(
                provider_name=self.provider_name,
                status="error",
                risk_score=0.0,
                verdict="unknown",
                reasons=[],
                security_flags={},
                error=str(exc),
            ).to_dict()

        rugged = bool(token.get("rugcheck_rugged"))
        risk_score_val = token.get("rugcheck_score") or 0
        risk_score = min(1.0, float(risk_score_val) / 10.0)  # Normalize 0-10 to 0-1

        if rugged:
            risk_score = max(risk_score, 0.95)

        reasons: list[str] = []
        if rugged:
            reasons.append("rugged_rugcheck")
        if risk_score_val > 5:
            reasons.append("high_rugcheck_score")
        if not token.get("rugcheck_freeze_renounced", True):
            reasons.append("freeze_not_renounced_rugcheck")
        if not token.get("rugcheck_mint_renounced", True):
            reasons.append("mint_not_renounced_rugcheck")

        return ProviderResult(
            provider_name=self.provider_name,
            status="ok",
            risk_score=round(risk_score, 4),
            verdict=_verdict_from_score(risk_score),
            reasons=reasons,
            security_flags={
                "rugged": rugged,
                "rugcheck_score": risk_score_val,
                "freeze_renounced": token.get("rugcheck_freeze_renounced"),
                "mint_renounced": token.get("rugcheck_mint_renounced"),
                "top_holder_pct": token.get("rugcheck_top_holder_pct"),
            },
        ).to_dict()


@dataclass(slots=True)
class DeFiProvider:
    """De.Fi security scanner (multi-chain)."""

    provider_name: str = "defi_scanner"

    def fetch(self, token: dict[str, Any]) -> dict[str, Any]:
        try:
            from hermes_screener.async_enrichment import enrich_defi

            enrich_defi(token)
        except Exception as exc:
            return ProviderResult(
                provider_name=self.provider_name,
                status="error",
                risk_score=0.0,
                verdict="unknown",
                reasons=[],
                security_flags={},
                error=str(exc),
            ).to_dict()

        scammed = bool(token.get("defi_scammed"))
        risk_score_val = token.get("defi_risk_score") or 0
        risk_score = min(1.0, float(risk_score_val) / 100.0)

        if scammed:
            risk_score = max(risk_score, 0.95)

        reasons: list[str] = []
        if scammed:
            reasons.append("scammed_defi")
        if token.get("defi_honeypot"):
            reasons.append("honeypot_defi")

        return ProviderResult(
            provider_name=self.provider_name,
            status="ok",
            risk_score=round(risk_score, 4),
            verdict=_verdict_from_score(risk_score),
            reasons=reasons,
            security_flags={
                "scammed": scammed,
                "defi_score": risk_score_val,
            },
        ).to_dict()


@dataclass(slots=True)
class PublicFallbackProvider:
    """
    Public fallback that uses already-collected data as security proxy.
    No API calls - purely heuristic from enrichment fields.
    """

    provider_name: str = "public_fallback"

    def fetch(self, token: dict[str, Any]) -> dict[str, Any]:
        dex = token.get("dex") or {}
        liquidity = float(dex.get("liquidity_usd") or 0)
        suspicious = bool(token.get("derived_suspicious_volume"))
        deployer_flagged = bool(token.get("gmgn_dev_token_farmer"))
        has_mint = bool(token.get("derived_has_mint_authority"))
        has_freeze = bool(token.get("derived_has_freeze_authority"))
        bonding_curve = (dex.get("dex") or "").lower() in ("pumpfun", "pump.fun")

        risk_score = 0.0
        reasons: list[str] = []

        if liquidity < 25_000:
            risk_score += 0.30
            reasons.append("low_liquidity_public")
        if has_mint:
            risk_score += 0.25
            reasons.append("mint_authority_present")
        if has_freeze:
            risk_score += 0.20
            reasons.append("freeze_authority_present")
        if suspicious:
            risk_score += 0.15
            reasons.append("suspicious_volume_public")
        if deployer_flagged:
            risk_score += 0.20
            reasons.append("deployer_flagged_public")
        if bonding_curve:
            risk_score += 0.10
            reasons.append("bonding_curve_detected")

        risk_score = min(1.0, round(risk_score, 4))
        return ProviderResult(
            provider_name=self.provider_name,
            status="ok",
            risk_score=risk_score,
            verdict=_verdict_from_score(risk_score),
            reasons=reasons,
            security_flags={
                "liquidity_usd": liquidity,
                "suspicious_volume": suspicious,
                "deployer_flagged": deployer_flagged,
                "mint_authority_present": has_mint,
                "freeze_authority_present": has_freeze,
                "bonding_curve": bonding_curve,
            },
        ).to_dict()


# ─── Aggregator ────────────────────────────────────────────────────────────────


@dataclass(slots=True)
class SecurityVerdict:
    source: str
    risk_score: float
    verdict: str
    reasons: list[str]
    flags: dict[str, Any]
    providers: list[str]
    provider_results: list[dict[str, Any]]
    honeypot_suspected: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "security_source": self.source,
            "security_risk_score": round(self.risk_score, 4),
            "security_verdict": self.verdict,
            "security_reasons": self.reasons,
            "security_flags": self.flags,
            "security_sources": self.providers,
            "security_provider_results": self.provider_results,
            "security_honeypot_suspected": self.honeypot_suspected,
        }


def aggregate_security(
    token: dict[str, Any],
    providers: list[SecurityProvider] | None = None,
) -> SecurityVerdict:
    """
    Run providers in chain, propagating enriched context forward.
    Uses highest risk score as primary verdict. Merges all flags.
    """
    if providers is None:
        providers = [
            RugCheckProvider(),
            DeFiProvider(),
            PublicFallbackProvider(),
        ]

    provider_results: list[dict[str, Any]] = []
    rolling_token = dict(token)

    for provider in providers:
        try:
            result = provider.fetch(rolling_token)
            normalized = {
                **result,
                "provider_name": getattr(provider, "provider_name", provider.__class__.__name__.lower()),
                "status": result.get("status", "ok"),
            }
            provider_results.append(normalized)

            # Propagate security flags forward for next provider
            flags = normalized.get("security_flags") or {}
            rolling_token.update({k: v for k, v in flags.items() if v not in (None, "", [], {})})
        except Exception as exc:
            provider_results.append(
                {
                    "provider_name": getattr(provider, "provider_name", provider.__class__.__name__),
                    "status": "error",
                    "provider_risk_score": None,
                    "provider_verdict": "unknown",
                    "provider_reasons": [],
                    "security_flags": {},
                    "error": str(exc),
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                }
            )

    ok_results = [r for r in provider_results if r.get("status") == "ok"]
    if not ok_results:
        return SecurityVerdict(
            source="unavailable",
            risk_score=0.0,
            verdict="unknown",
            reasons=[],
            flags={},
            providers=[],
            provider_results=provider_results,
            honeypot_suspected=False,
        )

    # Use highest risk score as primary
    primary = max(ok_results, key=lambda r: float(r.get("provider_risk_score", 0) or 0))
    merged_flags: dict[str, Any] = {}
    merged_reasons: list[str] = []
    for item in ok_results:
        for key, value in (item.get("security_flags") or {}).items():
            if value not in (None, "", [], {}):
                merged_flags[key] = value
        merged_reasons.extend(item.get("provider_reasons", []))

    return SecurityVerdict(
        source=primary.get("provider_name", "unknown"),
        risk_score=float(primary.get("provider_risk_score", 0) or 0),
        verdict=primary.get("provider_verdict", "unknown"),
        reasons=_dedupe(merged_reasons),
        flags=merged_flags,
        providers=[r.get("provider_name", "unknown") for r in ok_results],
        provider_results=provider_results,
        honeypot_suspected=bool(merged_flags.get("is_honeypot", False)),
    )


def apply_security_to_token(
    token: dict[str, Any],
    verdict: SecurityVerdict,
) -> dict[str, Any]:
    """Apply aggregated security verdict back to the token dict for scoring."""
    token["security_source"] = verdict.source
    token["security_risk_score"] = verdict.risk_score
    token["security_verdict"] = verdict.verdict
    token["security_reasons"] = verdict.reasons
    token["security_flags"] = verdict.flags
    token["security_sources"] = verdict.providers
    token["security_honeypot_suspected"] = verdict.honeypot_suspected

    # Map to fields used by revised_scoring.py disqualifiers
    # NOTE: goplus_is_honeypot kept as field name for backwards compatibility with scoring
    if verdict.honeypot_suspected:
        token["goplus_is_honeypot"] = True
    if "rugged_rugcheck" in verdict.reasons:
        token["rugcheck_rugged"] = True
    if "scammed_defi" in verdict.reasons:
        token["defi_scammed"] = True
    if "mint_authority_present" in verdict.reasons:
        token["derived_has_mint_authority"] = True

    return token
