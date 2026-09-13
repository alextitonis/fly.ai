"""
Website Intelligence — LLM-powered website analysis for token scoring.

Uses local AI to analyze website content and provide a website_score.
Falls back to algorithmic analysis if LLM is unavailable.

Scoring (0-100) based on LLM analysis of:
  - Website structure and complexity
  - Blog/announcement activity
  - Content quality and professionalism
  - Trendiness (matching current crypto narratives)
  - Traffic/engagement signals

Usage:
    from hermes_screener.website_intelligence import run_website_analysis
    signals = run_website_analysis(tokens, trending_keywords)
"""

from __future__ import annotations

import json
import re

import httpx
import requests

from hermes_screener.logging import get_logger

log = get_logger("website_intelligence")

# ═══════════════════════════════════════════════════════════════════════════════
# LOCAL LLM INTERFACE
# ═══════════════════════════════════════════════════════════════════════════════

# LLM endpoints to try (in order)
LLM_ENDPOINTS = [
    {
        "url": "http://localhost:8082/v1/chat/completions",
        "type": "openai",
        "model": "Bonsai-8B.gguf",
    },
    {
        "url": "http://localhost:11434/api/generate",
        "type": "ollama",
        "model": "llama3.2",
    },
    {
        "url": "http://localhost:8080/v1/chat/completions",
        "type": "openai",
        "model": "Bonsai-8B.gguf",
    },
    {
        "url": "http://localhost:8081/v1/chat/completions",
        "type": "openai",
        "model": "IBM-Grok4-UltraFast-Coder-1B.Q4_K_M.gguf",
    },
]


def _call_llm(prompt: str, system: str = "", max_tokens: int = 300, timeout: int = 60) -> str | None:
    """Call local LLM with fallback chain. Returns response text or None."""
    for endpoint in LLM_ENDPOINTS:
        try:
            if endpoint["type"] == "ollama":
                r = requests.post(
                    endpoint["url"],
                    json={
                        "model": endpoint["model"],
                        "system": system,
                        "prompt": prompt,
                        "stream": False,
                        "options": {"temperature": 0.2, "num_predict": max_tokens},
                    },
                    timeout=timeout,
                )
                if r.status_code == 200:
                    return r.json().get("response", "")  # type: ignore[no-any-return]

            elif endpoint["type"] == "openai":
                messages = []
                if system:
                    messages.append({"role": "system", "content": system})
                messages.append({"role": "user", "content": prompt})
                r = requests.post(
                    endpoint["url"],
                    json={
                        "model": endpoint["model"],
                        "messages": messages,
                        "max_tokens": max_tokens,
                        "temperature": 0.2,
                    },
                    timeout=timeout,
                )
                if r.status_code == 200:
                    data = r.json()
                    # Check for cloud proxy error
                    if "error" in data and "cloud" in data["error"].get("type", ""):
                        continue
                    return (  # type: ignore[no-any-return]
                        data.get("choices", [{}])[0].get("message", {}).get("content", "")
                    )
        except Exception:
            continue
    return None


# ═══════════════════════════════════════════════════════════════════════════════
# WEBSITE FETCHING
# ═══════════════════════════════════════════════════════════════════════════════


async def fetch_website_content(url: str, client: httpx.AsyncClient) -> dict | None:
    """Fetch website and extract clean content for LLM analysis."""
    try:
        resp = await client.get(url, follow_redirects=True, timeout=15)
        if resp.status_code != 200:
            return {"url": url, "error": f"HTTP {resp.status_code}"}

        html = resp.text

        # Clean text for LLM
        text = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL)
        text = re.sub(r"<style[^>]*>.*?</style>", "", html, flags=re.DOTALL)
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"\s+", " ", text).strip()[:4000]  # limit for LLM context

        # Meta description
        meta_match = re.search(
            r'<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']*)["\']',
            html,
            re.I,
        )
        meta_desc = meta_match.group(1) if meta_match else ""

        # Detect structure
        has_blog = bool(re.search(r"blog|news|announc|update", html, re.I))
        has_buy = bool(re.search(r"buy.now|presale|swap|trade", html, re.I))
        has_roadmap = bool(re.search(r"roadmap|tokenomics|whitepaper", html, re.I))
        has_team = bool(re.search(r"team|founder|developer|about.us", html, re.I))
        has_socials = bool(re.search(r"twitter|telegram|discord|instagram", html, re.I))
        image_count = len(re.findall(r"<img", html, re.I))
        word_count = len(text.split())
        page_kb = len(html) / 1024

        # Blog/announcement links
        blog_links = re.findall(r'href=["\']([^"\']*(?:blog|news|post|announc)[^"\']*)["\']', html, re.I)
        recent_dates = re.findall(
            r"(?:202[5-6][-/]\d|january|february|march|april|may|june|july|august|september|october|november|december).{0,20}202[5-6]",
            html,
            re.I,
        )

        return {
            "url": url,
            "text": text,
            "meta_description": meta_desc,
            "word_count": word_count,
            "page_kb": round(page_kb, 1),
            "image_count": image_count,
            "has_blog": has_blog,
            "has_buy": has_buy,
            "has_roadmap": has_roadmap,
            "has_team": has_team,
            "has_socials": has_socials,
            "blog_links": blog_links[:5],
            "recent_date_mentions": len(recent_dates),
            "blog_link_count": len(blog_links),
        }
    except Exception as e:
        return {"url": url, "error": str(e)}


# ═══════════════════════════════════════════════════════════════════════════════
# LLM WEBSITE ANALYSIS
# ═══════════════════════════════════════════════════════════════════════════════


def analyze_website_with_llm(
    website_data: dict,
    trending_keywords: list[dict],
    token_symbol: str,
) -> tuple[float, dict]:
    """
    Use local AI to analyze website content and produce a score.

    The LLM evaluates:
      - Website quality and professionalism
      - Blog/announcement activity
      - Content matching current trends
      - Traffic/engagement signals
      - Red flags (too simple, scam indicators)
    """
    if website_data.get("error"):
        return 0.0, {"error": website_data["error"]}

    # Prepare context for LLM
    keywords_str = ", ".join([k.get("keyword", "") for k in trending_keywords[:10]])

    prompt = f"""Analyze this cryptocurrency token website and provide a quality score.

TOKEN: {token_symbol}
WEBSITE: {website_data.get('url', 'unknown')}
META DESCRIPTION: {website_data.get('meta_description', 'none')}

WEBSITE CONTENT (first 3000 chars):
{website_data.get('text', '')[:3000]}

STRUCTURE:
- Word count: {website_data.get('word_count', 0)}
- Page size: {website_data.get('page_kb', 0)}KB
- Images: {website_data.get('image_count', 0)}
- Has blog/news section: {website_data.get('has_blog', False)}
- Has buy/presale button: {website_data.get('has_buy', False)}
- Has roadmap/tokenomics: {website_data.get('has_roadmap', False)}
- Has team/about page: {website_data.get('has_team', False)}
- Has social links: {website_data.get('has_socials', False)}
- Blog/article links found: {website_data.get('blog_link_count', 0)}
- Recent date mentions: {website_data.get('recent_date_mentions', 0)}

CURRENT TRENDING TOPICS: {keywords_str}

Respond with ONLY a JSON object (no other text):
{{"score": 0-100, "quality": "poor|basic|good|excellent", "blog_activity": "none|low|moderate|active", "trendiness": "irrelevant|lagging|current|leading", "red_flags": [], "strengths": [], "summary": "one sentence"}}"""

    system = "You are a crypto website analyst. Evaluate token websites for quality, legitimacy, and marketing effectiveness. Be honest - most memecoin sites are poor quality. Respond with JSON only."

    response = _call_llm(prompt, system, max_tokens=250, timeout=45)

    if response:
        # Parse LLM response
        try:
            # Extract JSON from response
            json_match = re.search(r"\{[^{}]*\}", response, re.DOTALL)
            if json_match:
                result = json.loads(json_match.group())
                score = float(result.get("score", 0))
                return round(score, 1), {
                    "method": "llm",
                    "quality": result.get("quality", ""),
                    "blog_activity": result.get("blog_activity", ""),
                    "trendiness": result.get("trendiness", ""),
                    "red_flags": result.get("red_flags", []),
                    "strengths": result.get("strengths", []),
                    "summary": result.get("summary", ""),
                }
        except (json.JSONDecodeError, ValueError):
            # Try to extract a number from the response
            numbers = re.findall(r"\b(\d{1,3})\b", response)
            if numbers:
                score = min(float(numbers[0]), 100)
                return round(score, 1), {
                    "method": "llm_raw",
                    "response": response[:200],
                }

    # LLM failed - fall back to algorithmic
    return _analyze_website_algorithmic(website_data, trending_keywords)


# ═══════════════════════════════════════════════════════════════════════════════
# ALGORITHMIC FALLBACK
# ═══════════════════════════════════════════════════════════════════════════════


def _analyze_website_algorithmic(
    website_data: dict,
    trending_keywords: list[dict],
) -> tuple[float, dict]:
    """Algorithmic website scoring when LLM is unavailable."""
    score = 0.0
    details = {"method": "algorithmic"}

    word_count = website_data.get("word_count", 0)
    page_kb = website_data.get("page_kb", 0)
    images = website_data.get("image_count", 0)

    # Complexity (0-30)
    if page_kb > 200:
        score += 15
    elif page_kb > 50:
        score += 8
    elif page_kb > 10:
        score += 3

    if word_count > 500:
        score += 10
    elif word_count > 200:
        score += 5
    elif word_count > 50:
        score += 2

    if images > 5:
        score += 5

    # Structure (0-25)
    if website_data.get("has_roadmap"):
        score += 8
    if website_data.get("has_team"):
        score += 7
    if website_data.get("has_socials"):
        score += 5
    if website_data.get("has_buy"):
        score += 5

    # Blog activity (0-25)
    blog_links = website_data.get("blog_link_count", 0)
    recent_dates = website_data.get("recent_date_mentions", 0)

    if blog_links > 3:
        score += 10
    elif blog_links > 0:
        score += 5
    if recent_dates > 3:
        score += 10
    elif recent_dates > 0:
        score += 5
    if website_data.get("has_blog"):
        score += 5

    # Trendiness (0-20)
    text = (website_data.get("text", "") + " " + website_data.get("meta_description", "")).lower()
    if trending_keywords and text:
        matches = sum(1 for kw in trending_keywords if kw.get("keyword", "").lower() in text)
        score += min(matches * 2, 20)

    return round(min(score, 100), 1), details


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN RUNNER
# ═══════════════════════════════════════════════════════════════════════════════


async def _analyze_all(
    tokens: list[dict],
    trending_keywords: list[dict],
) -> dict[str, dict]:
    """Analyze websites for tokens that have URLs."""
    results = {}

    # Check if LLM is available
    llm_available = False
    try:
        test = _call_llm("Reply with OK", max_tokens=5, timeout=10)
        llm_available = test is not None and len(test.strip()) > 0
    except Exception:
        pass

    log.info("website_analysis_start", tokens=len(tokens), llm_available=llm_available)

    limits = httpx.Limits(max_connections=5)
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(20, connect=5),
        limits=limits,
        headers={"User-Agent": "Mozilla/5.0 (compatible; HermesScreener/9.0)"},
    ) as client:
        for token in tokens[:20]:  # limit to top 20 tokens
            addr = token.get("contract_address", "")
            url = token.get("website_url", "")
            sym = token.get("symbol", "?")

            if not url or not addr:
                continue

            website_data = await fetch_website_content(url, client)
            if not website_data or website_data.get("error"):
                results[addr] = {
                    "website_score": 0,
                    "has_website": False,
                    "error": (website_data or {}).get("error", "fetch failed"),
                }
                continue

            score, details = analyze_website_with_llm(website_data, trending_keywords, sym)

            results[addr] = {
                "website_url": url,
                "website_score": score,
                "has_website": True,
                "website_details": details,
            }

            log.info(
                "website_analyzed",
                token=sym,
                score=score,
                method=details.get("method", "?"),
            )

    return results


def run_website_analysis(
    tokens: list[dict],
    trending_keywords: list[dict],
) -> dict[str, dict]:
    """Sync wrapper for website analysis."""
    import asyncio

    return asyncio.run(_analyze_all(tokens, trending_keywords))
