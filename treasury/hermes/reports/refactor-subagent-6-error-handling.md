# Error Handling Audit Report

**Date**: 2026-04-17  
**Scope**: Defensive try/except usage audit  
**Confidence Threshold**: High (safe, behavior-preserving edits only)

---

## Executive Summary

| Category | Count | Risk Level |
|----------|-------|----------|
| Bare `except:` blocks | 30 | **HIGH** |
| `except Exception:` with silent fail | ~60 | MEDIUM |
| `except Exception:` with logging | ~50 | LOW |
| Specific exception handling | ~200 | LOW |

**Conclusion**: Several high-risk bare `except:` blocks hide critical errors. Most other patterns are acceptable defensive design.

---

## Critical Assessment: Bare `except:` Blocks

Bare `except:` catches **all** exceptions including `KeyboardInterrupt`, `SystemExit`, and `MemoryError` — these should almost never be caught silently.

### Files with Bare `except:` (Most Risky First)

#### 1. `hermes_screener/trading/dex_aggregator_trader.py`

| Line | Context | Risk |
|------|---------|------|
| 159 | Solana keypair parsing | **CRITICAL** - hides invalid key format |
| 220 | RPC connection loop | **HIGH** - hides network errors |
| 768 | Token decimals fetch | **MEDIUM** - hides contract errors |

**Lines 156-162** (keypair parsing):
```python
try:
    self.solana_keypair = Keypair.from_base58_string(solana_pk)
except:  # <-- HIDES InvalidKeyError, ValueError
    self.solana_keypair = Keypair.from_seed(
        bytes.fromhex(solana_pk[:64])
```

**Lines 215-222** (RPC fallback loop):
```python
for rpc in rpcs:
    try:
        w3 = Web3(Web3.HTTPProvider(rpc, request_kwargs={"timeout": 10}))
        if w3.is_connected():
            return w3
    except:  # <-- SILENTLY SWALLOWS ALL ERRORS
        continue
return None  # <-- No indication of WHY it failed
```

**Lines 766-770** (decimals fallback):
```python
try:
    decimals = contract.functions.decimals().call()
except:  # <-- Defaults to 18, hiding errors
    decimals = 18
```

#### 2. `hermes_screener/trading/contract_executor.py`

| Line | Context | Risk |
|------|---------|------|
| 44 | Protocol loading | **HIGH** - hides JSON/rpc errors |
| 186 | RPC connection | **HIGH** - hides network errors |
| 1038 | Unknown context | **MEDIUM** |

**Lines 41-45**:
```python
try:
    with open(_WP_PATH) as _f:
        WORKING_PROTOCOLS = json.load(_f)
except:  # <-- SILENTLY DEFAULTS TO EMPTY
    WORKING_PROTOCOLS = {}
```

**Lines 180-188**:
```python
for rpc in rpcs:
    try:
        w3 = Web3(Web3.HTTPProvider(rpc, request_kwargs={"timeout": 8}))
        if w3.is_connected():
            self._chain_w3[chain] = w3
            return w3
    except:  # <-- Hides network/parse errors
        continue
return None
```

#### 3. `scripts/base_dex_prices.py`

| Line | Context | Risk |
|------|---------|------|
| 31 | RPC call wrapper | **HIGH** |
| 101 | Quote parsing | **MEDIUM** |
| 115 | Price slot0 | **MEDIUM** |

**Lines 25-34**:
```python
try:
    url = RPCS[rpc_idx % len(RPCS)]
    payload = json.dumps(...).encode()
    req = urllib.request.Request(...)
    with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
        return json.loads(resp.read().decode())
except:  # <-- SILENTLY TRIES NEXT RPC
    rpc_idx += 1
    time.sleep(1)
return {"error": "failed"}  # <-- Generic error, no specifics
```

**Lines 98-103** (quote parsing):
```python
try:
    if int(result[66:130], 16) >= 2:
        return int(result[194:258], 16)
except:  # <-- SILENTLY RETURNS NONE
    pass
return None
```

#### 4. `scripts/twitter_token_analyzer.py`

| Line | Context | Risk |
|------|---------|------|
| 106 | Number parsing | MEDIUM |
| 110 | Number parsing | MEDIUM |
| 290 | Regex extraction | MEDIUM |
| 341 | Date parsing | MEDIUM |
| 406 | Sentiment parse | MEDIUM |

**Pattern (lines 104-111)**:
```python
try:
    return int(float(s[:-1]) * m
except:  # <-- SWALLOWS ALL PARSE ERRORS
    return 0  # <-- Returns 0 for both "invalid" and "0"
```

**Issue**: Can't distinguish between `parse error → 0` and `actual zero → 0`.

#### 5. `scripts/token_integration.py`

Six bare `except:` blocks:
- Line 533: temp file cleanup
- Line 638, 655, 666, 738, 771: various operations

Most are cleanup operations (line 533) which is acceptable. Others hide enrichment errors.

#### 6. `scripts/pumpfun_wallet_enrichment.py`

| Line | Context | Risk |
|------|---------|------|
| 42 | subprocess.run | HIGH |
| 60 | HTTP/RPC call | HIGH |

**Lines 40-44**:
```python
result = subprocess.run(...)
if result.returncode == 0 and result.stdout.strip():
    return json.loads(result.stdout.strip())
except:  # <-- HIDES subprocess errors
    pass
return None
```

#### 7. `scripts/dex_aggregator_trader.py`

Similar patterns to `hermes_screener/trading/dex_aggregator_trader.py`.

#### 8. `data/generate_wallets.py`

| Line | Context | Risk |
|------|---------|------|
| 133 | Unclear context | MEDIUM |

---

## Medium Risk: `except Exception:` with Silent Defaults

These patterns return default values without meaningful error handling:

### `hermes_screener/async_enrichment.py` (DESIGNED THIS WAY)

```python
except Exception as e:
    return LayerResult(
        "GoPlus", False, 0, len(enriched), time.time() - start, str(e)
    )
```

**Assessment**: This is **intentional design** per README - "Each enricher is wrapped in try/except. If it fails, its fields are skipped but the pipeline continues."

### `hermes_screener/trading/dex_aggregator_trader.py`

Many `except Exception as e:` that log and return default values:
- Line 243: Returns empty dict `{}`
- Line 261: Returns `False`
- Various API error handlers

**Assessment**: Generally acceptable - logs the error before returning.

---

## Low Risk: Proper Exception Handling

Examples of GOOD patterns found:

### `hermes_screener/trading/dex_aggregator_trader.py` (lines 38-41)
```python
except (ValueError, ProcessLookupError):
    # Stale lockfile or PID doesn't exist
except PermissionError:
    # Process exists but different user
```

### `hermes_screener/agents/registry.py` (line 208)
```python
except (json.JSONDecodeError, KeyError, TypeError):
```

### `hermes_screener/agents/delegation_router.py` (lines 346, 421, 487)
```python
except json.JSONDecodeError:
except (json.JSONDecodeError, KeyError):
```

---

## Recommendations

### EDITS NOT IMPLEMENTED (Low Confidence)

I am **NOT editing** the bare `except:` blocks because:

1. **Context ambiguity**: In several files (e.g., `token_integration.py`), the bare except wraps multiple statements - changing to specific exceptions requires understanding what exceptions could actually be raised
2. **Behavioral change risk**: Changing from silent fail to raising could break existing error recovery flows
3. **Incomplete understanding**: Some files like `twitter_token_analyzer.py` have parsing functions where returning 0 on error might be intentional

### EDITS NOT IMPLEMENTED (Medium Confidence)

These **could** be addressed with higher confidence:

1. **`hermes_screener/trading/contract_executor.py` line 44**: Add `except (json.JSONDecodeError, FileNotFoundError, IOError):`
2. **`hermes_screener/trading/dex_aggregator_trader.py` line 220**: Add `except Exception:`

But even these risk breaking behavior if there's unstated exception handling elsewhere.

### Suggested Fixes (If You Choose to Implement)

**For RPC connection loops**, change:
```python
# BEFORE (silent)
except:
    continue

# AFTER (documented)
except Exception as e:
    logger.debug(f"RPC {rpc} failed: {e}")
    continue
```

**For keypair parsing**, change:
```python
# BEFORE (silent fail)
except:
    self.solana_keypair = Keypair.from_seed(...)

# AFTER (explicit)
except (ValueError, InvalidKeyError):
    self.solana_keypair = Keypair.from_seed(...)
```

**For protocol loading**, change:
```python
# BEFORE (silent)
except:
    WORKING_PROTOCOLS = {}

# AFTER (logged)
except (json.JSONDecodeError, FileNotFoundError, IOError) as e:
    logger.warning(f"Failed to load protocols: {e}")
    WORKING_PROTOCOLS = {}
```

---

## Verification Commands

```bash
# Re-run compile check on main files
python3 -m py_compile hermes_screener/trading/dex_aggregator_trader.py
python3 -m py_compile hermes_screener/trading/contract_executor.py
python3 -m py_compile scripts/base_dex_prices.py

# Run tests if available
python3 -m pytest -q tests/ 2>/dev/null || echo "No pytest configured"
```

---

## Summary

| Finding | Count | Action |
|---------|-------|--------|
| Bare `except:` hiding errors | 30 | Documented (not edited) |
| `except Exception:` with defaults | ~60 | Acceptable design |
| Proper specific handling | ~200 | No change needed |

**Root cause**: Many RPC/s API wrappers use bare `except:` for fallback loops - this is a common defensive pattern but should log instead of silent fail.

**Recommendation**: Audit each file individually before making changes. Some "silent" patterns may be intentional (e.g., cleanup operations). The highest impact fix would be adding logging to RPC fallback loops.