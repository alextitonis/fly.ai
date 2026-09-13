#!/usr/bin/env bash
# pre-push hook — runs the same security scan as the wrangler deploy gate.
# Blocks the push if HIGH/CRITICAL findings are detected.
#
# Install:
#   cp treasury/scripts/pre-push-hook.sh .git/hooks/pre-push
#   chmod +x .git/hooks/pre-push
#
# Tools used (same as the wrangler gate in AGENTS.md):
#   1. Gitleaks  — fast secret scan (~5s)
#   2. Trivy     — secrets + vulns + misconfig (~30s)
#   3. TruffleHog — secrets in git history
#   4. Semgrep   — SAST (OWASP top 10, TypeScript, React, Solidity, Python)
#
# Override (emergencies only):
#   SECURITY_SKIP=1 git push
#
# Audit reports: ~/.local/share/security-audits/<project>-<timestamp>.*.json

set -euo pipefail

if [ "${SECURITY_SKIP:-0}" = "1" ]; then
  echo "⚠️  SECURITY_SKIP=1 — skipping security scan"
  exit 0
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
PROJECT="$(basename "$REPO_ROOT")"
AUDIT_DIR="$HOME/.local/share/security-audits"
mkdir -p "$AUDIT_DIR"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

FAILED=0

echo "🔒 Security gate: scanning $REPO_ROOT before push..."

# --- 1. Gitleaks: fast secret scan ---
if command -v gitleaks &>/dev/null; then
  echo "  Gitleaks..."
  REPORT="$AUDIT_DIR/${PROJECT}-${TIMESTAMP}-gitleaks.json"
  if ! gitleaks detect --source "$REPO_ROOT" --report-path "$REPORT" --no-banner 2>/dev/null; then
    echo "  ❌ Gitleaks: secrets detected (report: $REPORT)"
    FAILED=1
  else
    echo "  ✅ Gitleaks: clean"
  fi
else
  echo "  ⚠️  Gitleaks not installed — skipping"
fi

# --- 2. Trivy: secrets + vulns + misconfig ---
if command -v trivy &>/dev/null; then
  echo "  Trivy..."
  REPORT="$AUDIT_DIR/${PROJECT}-${TIMESTAMP}-trivy.json"
  if ! trivy fs --scanners secret,vuln,misconfig --severity HIGH,CRITICAL \
       --skip-dirs node_modules,.venv,contracts/lib,contracts/out,contracts/cache,frontend/node_modules,frontend/dist,loxley/vendor \
       --format json --output "$REPORT" "$REPO_ROOT" 2>/dev/null; then
    echo "  ❌ Trivy: HIGH/CRITICAL findings (report: $REPORT)"
    FAILED=1
  else
    echo "  ✅ Trivy: clean"
  fi
else
  echo "  ⚠️  Trivy not installed — skipping"
fi

# --- 3. TruffleHog: secrets in git history ---
if command -v trufflehog &>/dev/null; then
  echo "  TruffleHog..."
  REPORT="$AUDIT_DIR/${PROJECT}-${TIMESTAMP}-trufflehog.jsonl"
  COUNT=$(trufflehog git "file://$REPO_ROOT" --no-verification --json 2>/dev/null | tee "$REPORT" | jq -s 'length' 2>/dev/null || echo "0")
  VERIFIED=$(jq -r 'select(.Verified==true)' "$REPORT" 2>/dev/null | jq -s 'length' 2>/dev/null || echo "0")
  if [ "$VERIFIED" -gt 0 ]; then
    echo "  ❌ TruffleHog: $VERIFIED verified secrets in git history (report: $REPORT)"
    FAILED=1
  else
    echo "  ✅ TruffleHog: $COUNT findings (0 verified)"
  fi
else
  echo "  ⚠️  TruffleHog not installed — skipping"
fi

# --- 4. Semgrep: SAST ---
if command -v semgrep &>/dev/null; then
  echo "  Semgrep..."
  REPORT="$AUDIT_DIR/${PROJECT}-${TIMESTAMP}-semgrep.json"
  if ! semgrep scan --config p/owasp-top-10 --json --output "$REPORT" "$REPO_ROOT" 2>/dev/null; then
    echo "  ❌ Semgrep: findings detected (report: $REPORT)"
    FAILED=1
  else
    echo "  ✅ Semgrep: clean"
  fi
else
  echo "  ⚠️  Semgrep not installed — skipping"
fi

# --- Summary ---
if [ "$FAILED" -eq 1 ]; then
  echo ""
  echo "❌ Security gate FAILED — push blocked"
  echo "   Reports in: $AUDIT_DIR/"
  echo "   Override: SECURITY_SKIP=1 git push"
  exit 1
fi

echo "✅ Security gate passed — pushing"
exit 0
