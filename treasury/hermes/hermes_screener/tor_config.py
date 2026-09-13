"""
TOR SOCKS5 proxy configuration for hermes-token-screener.

Import this module ONCE at the top of any script that makes external HTTP calls.
It patches httpx, requests, and urllib to route ALL traffic through TOR.

Usage:
    import hermes_screener.tor_config  # just import, patches are applied automatically

    # All httpx/requests/urllib calls now go through TOR
    resp = requests.get("https://api.dexscreener.com/...")  # -> TOR
    resp = httpx.get("https://api.coingecko.com/...")        # -> TOR
"""

import os
import logging
import urllib.request

log = logging.getLogger(__name__)

TOR_SOCKS5 = os.environ.get("TOR_SOCKS5", "socks5h://127.0.0.1:9050")
TOR_ENABLED = os.environ.get("HERMES_TOR_ENABLED", "true").lower() in ("true", "1", "yes")

# ─────────────────────────────────────────────────────────────────────────────
# Patch 1: requests library
# ─────────────────────────────────────────────────────────────────────────────

def _should_bypass_tor(url):
    """Check if URL should bypass TOR (e.g., localhost/private addresses)."""
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url.lower())
        host = parsed.hostname or ""
        # Bypass for localhost and common private addresses
        if host in ("localhost", "127.0.0.1", "::1"):
            return True
        # Could add more private ranges if needed
        return False
    except Exception:
        return False

def _patch_requests():
    """Patch the requests library to use TOR SOCKS5 proxy."""
    if not TOR_ENABLED:
        return
    try:
        import requests as _requests
        # requests uses a session-level proxy dict
        _orig_request = _requests.Session.request

        def _tor_request(self, method, url, **kwargs):
            # Bypass TOR for localhost/private addresses
            if _should_bypass_tor(url):
                # Remove proxy settings for direct connection
                kwargs.pop("proxies", None)
            else:
                kwargs.setdefault("proxies", {
                    "http": TOR_SOCKS5,
                    "https": TOR_SOCKS5,
                })
            kwargs.setdefault("timeout", kwargs.get("timeout", 30))
            return _orig_request(self, method, url, **kwargs)

        _requests.Session.request = _tor_request
        log.info(f"[TOR] requests patched -> {TOR_SOCKS5} (with localhost bypass)")
    except ImportError:
        pass
    except Exception as e:
        log.warning(f"[TOR] requests patch failed: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Patch 2: httpx library
# ─────────────────────────────────────────────────────────────────────────────

def _patch_httpx():
    """Patch httpx to use TOR SOCKS5 proxy."""
    if not TOR_ENABLED:
        return
    try:
        import httpx as _httpx

        # httpx supports SOCKS5 via httpx[socks] or with socksio
        _orig_init = _httpx.AsyncClient.__init__

        def _tor_async_init(self, *args, **kwargs):
            # Bypass TOR for localhost/private addresses - check if URL is in params
            url = kwargs.get('url')
            if url and _should_bypass_tor(url):
                # Remove proxy settings for direct connection
                kwargs.pop('proxy', None)
            else:
                kwargs.setdefault("proxy", TOR_SOCKS5.replace("socks5h://", "socks5://"))
            return _orig_init(self, *args, **kwargs)

        _httpx.AsyncClient.__init__ = _tor_async_init

        _orig_sync_init = _httpx.Client.__init__

        def _tor_sync_init(self, *args, **kwargs):
            # Bypass TOR for localhost/private addresses - check if URL is in params
            url = kwargs.get('url')
            if url and _should_bypass_tor(url):
                # Remove proxy settings for direct connection
                kwargs.pop('proxy', None)
            else:
                kwargs.setdefault("proxy", TOR_SOCKS5.replace("socks5h://", "socks5://"))
            return _orig_sync_init(self, *args, **kwargs)

        _httpx.Client.__init__ = _tor_sync_init

        log.info(f"[TOR] httpx patched -> {TOR_SOCKS5} (with localhost bypass)")
    except ImportError:
        pass
    except Exception as e:
        log.warning(f"[TOR] httpx patch failed: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Patch 3: urllib.request
# ─────────────────────────────────────────────────────────────────────────────

def _patch_urllib():
    """Patch urllib.request to use TOR SOCKS5 proxy."""
    if not TOR_ENABLED:
        return
    try:
        import socks  # PySocks
        socks.set_default_proxy(socks.SOCKS5, "127.0.0.1", 9050, rdns=True)
        import socket
        socks.wrap_module(socket)
        log.info("[TOR] urllib/socket patched -> socks5://127.0.0.1:9050")
    except ImportError:
        # Fallback: monkey-patch with ProxyHandler
        try:
            handler = urllib.request.ProxyHandler({
                "http": TOR_SOCKS5,
                "https": TOR_SOCKS5,
            })
            opener = urllib.request.build_opener(handler)
            urllib.request.install_opener(opener)
            log.info(f"[TOR] urllib patched (ProxyHandler) -> {TOR_SOCKS5}")
        except Exception as e:
            log.warning(f"[TOR] urllib patch failed: {e}")
    except Exception as e:
        log.warning(f"[TOR] urllib socks patch failed: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Verify TOR connectivity
# ─────────────────────────────────────────────────────────────────────────────

def verify_tor():
    """Quick check that TOR is reachable."""
    if not TOR_ENABLED:
        log.info("[TOR] Disabled via HERMES_TOR_ENABLED=false")
        return False
    try:
        import requests
        resp = requests.get(
            "https://check.torproject.org/api/ip",
            timeout=15,
            proxies={"http": TOR_SOCKS5, "https": TOR_SOCKS5},
        )
        data = resp.json()
        is_tor = data.get("IsTor", False)
        ip = data.get("IP", "?")
        log.info(f"[TOR] Verified: IsTor={is_tor}, IP={ip}")
        return is_tor
    except Exception as e:
        log.warning(f"[TOR] Verification failed: {e}")
        return False


# ─────────────────────────────────────────────────────────────────────────────
# Apply all patches on import
# ─────────────────────────────────────────────────────────────────────────────

if TOR_ENABLED:
    _patch_requests()
    _patch_httpx()
    _patch_urllib()
