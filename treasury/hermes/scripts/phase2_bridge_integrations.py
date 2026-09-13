import json, re, time, urllib.request, concurrent.futures
# TOR proxy - route all external HTTP through SOCKS5
import sys, os
sys.path.insert(0, os.path.expanduser("~/.hermes/hermes-token-screener"))
import hermes_screener.tor_config
from collections import defaultdict
from pathlib import Path

UA = {"User-Agent": "Mozilla/5.0"}


def http_get(url, timeout=40):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", errors="replace")


def http_json(url, timeout=40):
    return json.loads(http_get(url, timeout))


ROOT = Path("/root/hermes-token-screener")
DATA_DIR = ROOT / "docs" / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# -----------------------------
# load existing candidates
# -----------------------------
cand_path = DATA_DIR / "bridge_contract_candidates.json"
if cand_path.exists():
    candidates = json.loads(cand_path.read_text())
else:
    candidates = []


def add_candidate(protocol, contract, chain, chain_id, address, source):
    if not isinstance(address, str):
        return
    address = address.strip()
    if not re.fullmatch(r"0x[a-fA-F0-9]{40}", address):
        return
    candidates.append(
        {
            "protocol": protocol,
            "contract": contract,
            "chain": chain,
            "chain_id": chain_id,
            "address": address,
            "source": source,
        }
    )


# -----------------------------
# phase 2 protocol ingestion
# -----------------------------
print("Phase 2: ingest cBridge, Hop, deBridge...")

# A) cBridge official deployments
try:
    # list deployment dirs from GitHub API (faster than hardcoding)
    tree = http_json("https://api.github.com/repos/celer-network/cBridge-contracts/git/trees/main?recursive=1")
    paths = [
        x["path"]
        for x in tree.get("tree", [])
        if x.get("path", "").endswith("/CBridge.json") and x.get("path", "").startswith("deployments/")
    ]
    for p in paths:
        url = f"https://raw.githubusercontent.com/celer-network/cBridge-contracts/main/{p}"
        try:
            j = http_json(url)
        except Exception:
            continue
        addr = j.get("address")
        chain_name = p.split("/")[1] if "/" in p else p
        # normalize chain labels
        map_name = {
            "mainnet": "Ethereum",
            "bscMainnet": "Binance",
            "polygonMainnet": "Polygon",
            "arbitrumMainnet": "Arbitrum",
            "avalancheMainnet": "Avalanche",
            "fantomMainnet": "Fantom",
            "harmonyMainnet": "Harmony",
            "xDai": "Gnosis",
            "celo": "Celo",
            "heco": "Heco",
            "kovan": "Ethereum",
        }
        chain = map_name.get(chain_name, chain_name)
        add_candidate("cBridge", "CBridge", chain, None, addr, f"cBridge-contracts/{p}")
    print(f"  cBridge candidates added from {len(paths)} deployment files")
except Exception as e:
    print("  cBridge ingestion failed:", e)

# B) Hop protocol bridge addresses from SDK mainnet.ts
try:
    hop_ts = http_get(
        "https://raw.githubusercontent.com/hop-protocol/hop/develop/packages/sdk/src/addresses/mainnet.ts", timeout=60
    )

    lines = hop_ts.splitlines()

    # Extract only the bridges: { ... } block using brace counting
    bridges_lines = []
    in_bridges = False
    depth = 0
    for line in lines:
        if not in_bridges and re.search(r"\bbridges\s*:\s*\{", line):
            in_bridges = True
            depth = line.count("{") - line.count("}")
            bridges_lines.append(line)
            continue
        if in_bridges:
            bridges_lines.append(line)
            depth += line.count("{") - line.count("}")
            if depth <= 0:
                break

    token = None
    chain = None

    # Parse nested object by indentation levels
    for line in bridges_lines:
        # token level: 4 spaces
        mt = re.match(r"^\s{4}([A-Za-z0-9_\.\'\"]+):\s*\{\s*$", line)
        if mt:
            token = mt.group(1).strip("\"'")
            chain = None
            continue

        # chain level: 6 spaces
        mc = re.match(r"^\s{6}([a-zA-Z0-9_]+):\s*\{\s*$", line)
        if mc:
            chain = mc.group(1)
            continue

        # close chain object
        if re.match(r"^\s{6}\},?\s*$", line):
            chain = None
            continue

        # address fields inside chain object
        if token and chain:
            for mm in re.finditer(r"([A-Za-z0-9_]+):\s*'?(0x[a-fA-F0-9]{40})'?,?", line):
                field = mm.group(1)
                addr = mm.group(2)
                contract = f"{field} ({token})"
                chain_name_map = {
                    "ethereum": "Ethereum",
                    "arbitrum": "Arbitrum",
                    "optimism": "Optimism",
                    "polygon": "Polygon",
                    "gnosis": "Gnosis",
                    "base": "Base",
                    "linea": "Linea",
                    "nova": "Arbitrum Nova",
                    "polygonzk": "Polygon zkEVM",
                    "scrollzk": "Scroll",
                    "zksync": "zkSync Era",
                }
                chain_name = chain_name_map.get(chain, chain.title())
                add_candidate("Hop", contract, chain_name, None, addr, "hop/sdk/mainnet.ts")

    print("  Hop candidates ingested")
except Exception as e:
    print("  Hop ingestion failed:", e)

# C) deBridge deployed contracts docs scrape
try:
    html = http_get("https://docs.debridge.com/dmp-details/dmp/deployed-contracts", timeout=60)

    # Parse rows: <tr><td>Chain</td> ... <a ...>0x...</a> ...
    row_re = re.compile(r"<tr><td>([^<]+)</td>([\s\S]*?)</tr>")
    addr_re = re.compile(r"0x[a-fA-F0-9]{40}")

    parsed = 0
    for rm in row_re.finditer(html):
        chain = rm.group(1).strip()
        body = rm.group(2)
        addrs = list(dict.fromkeys(addr_re.findall(body)))  # unique keep order
        if not addrs:
            continue
        # heuristic labels per column (from docs table structure)
        labels = ["deBridgeGate", "SignatureVerifier", "CallProxy", "WethGate", "FeeProxy", "DefiController"]
        for i, a in enumerate(addrs):
            lbl = labels[i] if i < len(labels) else f"Contract_{i+1}"
            add_candidate("deBridge", lbl, chain, None, a, "docs.debridge.com/deployed-contracts")
            parsed += 1
    print(f"  deBridge candidates parsed: {parsed}")
except Exception as e:
    print("  deBridge ingestion failed:", e)

# D) CCIP official chain data from Chainlink docs repo
try:
    ccip = http_json(
        "https://raw.githubusercontent.com/smartcontractkit/documentation/main/src/config/data/ccip/v1_2_0/mainnet/chains.json",
        timeout=60,
    )

    def ccip_chain_name(slug: str):
        s = slug.lower().strip()
        # strip common suffixes
        for suf in ["-mainnet", "-mainnet-opbnb-1", "-mainnet-1"]:
            if s.endswith(suf):
                s = s[: -len(suf)]
        mapping = {
            "ethereum": "Ethereum",
            "arbitrum": "Arbitrum",
            "arbitrum-one": "Arbitrum",
            "optimism": "Optimism",
            "base": "Base",
            "polygon": "Polygon",
            "avalanche": "Avalanche",
            "binance-smart-chain": "Binance",
            "opbnb": "Op_Bnb",
            "linea": "Linea",
            "scroll": "Scroll",
            "x-layer": "X Layer",
            "xlayer": "X Layer",
            "apechain": "ApeChain",
            "berachain": "Berachain",
            "sonic": "Sonic",
            "world-chain": "World Chain",
            "worldchain": "World Chain",
            "zksync": "zkSync Era",
            "zksync-era": "zkSync Era",
            "mantle": "Mantle",
            "mode": "Mode",
            "fraxtal": "Fraxtal",
            "soneium": "Soneium",
            "unichain": "Unichain",
            "abstract": "Abstract",
            "ink": "Ink",
            "celo": "Celo",
            "gnosis": "Gnosis",
            "fantom": "Fantom",
            "metis": "Metis",
            "boba": "Boba",
            "blast": "Blast",
            "taiko": "Taiko",
            "ronin": "Ronin",
            "polygon-zkevm": "Polygon zkEVM",
            "zircuit": "Zircuit",
            "lisk": "Lisk",
            "kroma": "Kroma",
            "xdc": "XDC",
            "sei": "Sei",
            "injective": "Injective",
            "solana": "Solana",
            "sui": "Sui",
            "aptos": "Aptos",
            "tron": "Tron",
            "near": "Near",
            "ton": "TON",
            "bitcoin": "Bitcoin",
            "hedera": "Hedera",
            "stellar": "Stellar",
            "tezos": "Tezos",
            "cardano": "Cardano",
            "osmosis": "Osmosis",
            "cosmos-hub": "Cosmos Hub",
        }
        if s in mapping:
            return mapping[s]
        # fallback title-case with separators removed
        return s.replace("-", " ").title()

    added = 0
    for slug, cfg in ccip.items():
        chain = ccip_chain_name(slug)
        for field in ["router", "armProxy", "registryModule", "tokenAdminRegistry", "tokenPoolFactory"]:
            obj = cfg.get(field)
            if isinstance(obj, dict):
                addr = obj.get("address")
                if isinstance(addr, str) and re.fullmatch(r"0x[a-fA-F0-9]{40}", addr):
                    add_candidate("CCIP", field, chain, None, addr, "chainlink-docs/ccip/chains.json")
                    added += 1
    print(f"  CCIP candidates added: {added}")
except Exception as e:
    print("  CCIP ingestion failed:", e)

# E) Connext official deployments
try:
    connext = http_json(
        "https://raw.githubusercontent.com/connext/monorepo/main/packages/deployments/contracts/deployments.json",
        timeout=90,
    )
    chainlist_tmp = http_json("https://chainid.network/chains.json", timeout=60)
    by_id_tmp = {c.get("chainId"): c.get("name") for c in chainlist_tmp if isinstance(c.get("chainId"), int)}

    added = 0
    for cid_s, arr in connext.items():
        try:
            cid = int(cid_s)
        except Exception:
            cid = None
        if not isinstance(arr, list) or not arr:
            continue
        rec = arr[0] if isinstance(arr[0], dict) else {}
        contracts = rec.get("contracts", {}) if isinstance(rec, dict) else {}

        chain_name = by_id_tmp.get(cid)
        if not chain_name:
            # fallback to config name, but avoid generic mainnet labels
            nm = str(rec.get("name", f"chain-{cid_s}"))
            if nm.lower() in {"mainnet", "testnet", "local", "devnet"}:
                chain_name = f"Chain {cid_s}"
            else:
                chain_name = nm.title()

        for cname, cv in contracts.items():
            if not isinstance(cv, dict):
                continue
            addr = cv.get("address")
            if not (isinstance(addr, str) and re.fullmatch(r"0x[a-fA-F0-9]{40}", addr)):
                continue

            # bridge-relevant Connext contracts
            low = cname.lower()
            if any(
                k in low for k in ["connext", "connector", "rootmanager", "merkletreemanager", "relayerproxy", "bridge"]
            ):
                add_candidate("Connext", cname, chain_name, cid, addr, "connext/deployments.json")
                added += 1

    print(f"  Connext candidates added: {added}")
except Exception as e:
    print("  Connext ingestion failed:", e)

# dedupe candidates
uniq = {}
for r in candidates:
    k = (r["protocol"].lower(), r["contract"].lower(), r["chain"].lower(), r["address"].lower())
    if k not in uniq:
        uniq[k] = r
candidates = list(uniq.values())
print("Total unique candidates after phase 2:", len(candidates))

cand_path.write_text(json.dumps(candidates, indent=2))

# -----------------------------
# test contracts (EVM only)
# -----------------------------
print("Testing contracts with eth_getCode...")
chainlist = http_json("https://chainid.network/chains.json")
by_id = {c.get("chainId"): c for c in chainlist if isinstance(c.get("chainId"), int)}

ALIASES = {
    "bsc": "bnb smart chain",
    "binance": "bnb smart chain",
    "ethereum": "ethereum mainnet",
    "mainnet": "ethereum mainnet",
    "arbitrum": "arbitrum one",
    "optimism": "op mainnet",
    "polygon": "polygon mainnet",
    "avalanche": "avalanche c-chain",
    "xlayer": "x layer mainnet",
    "worldchain": "world chain",
    "seievm": "sei evm",
    "klaytn": "kaia mainnet",
    "fantom": "fantom opera",
    "metis": "metis andromeda mainnet",
    "zksync": "zksync era",
    "zksync era": "zksync era mainnet",
    "gnosis": "gnosis",
    "xdai": "gnosis",
}

KNOWN_RPC = {
    1: ["https://eth.llamarpc.com", "https://rpc.ankr.com/eth"],
    56: ["https://bsc-dataseed.binance.org", "https://bsc.llamarpc.com"],
    137: ["https://polygon-rpc.com", "https://polygon.llamarpc.com"],
    42161: ["https://arb1.arbitrum.io/rpc", "https://arbitrum.llamarpc.com"],
    10: ["https://mainnet.optimism.io", "https://optimism.llamarpc.com"],
    8453: ["https://mainnet.base.org", "https://base.llamarpc.com"],
    43114: ["https://api.avax.network/ext/bc/C/rpc", "https://avalanche-c-chain-rpc.publicnode.com"],
    250: ["https://rpc.ftm.tools", "https://fantom-rpc.publicnode.com"],
    100: ["https://rpc.gnosischain.com", "https://gnosis-rpc.publicnode.com"],
    324: ["https://mainnet.era.zksync.io"],
    59144: ["https://rpc.linea.build"],
    534352: ["https://rpc.scroll.io"],
    5000: ["https://rpc.mantle.xyz"],
    81457: ["https://rpc.blast.io"],
}


def find_by_name(name):
    n = (name or "").lower().strip()
    if not n:
        return None
    if n in ALIASES:
        ali = ALIASES[n]
        for c in chainlist:
            if ali in c.get("name", "").lower():
                return c
    for c in chainlist:
        nm = c.get("name", "").lower()
        if n == nm or n in nm or nm in n:
            return c
    return None


def rpc_candidates(rec):
    ce = None
    cid = rec.get("chain_id")
    if isinstance(cid, int):
        ce = by_id.get(cid)
    if ce is None:
        ce = find_by_name(rec.get("chain"))
    resolved_cid = ce.get("chainId") if ce else cid
    cands = []
    if isinstance(resolved_cid, int) and resolved_cid in KNOWN_RPC:
        cands.extend(KNOWN_RPC[resolved_cid])
    if ce:
        for r in ce.get("rpc", []):
            if not isinstance(r, str):
                continue
            if any(x in r for x in ["${", "<", ">", "{", "}", "INFURA", "ALCHEMY", "api-key"]):
                continue
            cands.append(r)
    # dedupe
    out = []
    seen = set()
    for r in cands:
        if r in seen:
            continue
        seen.add(r)
        out.append(r)
    return out, (ce.get("name") if ce else None), resolved_cid


def eth_get_code_multi(rpcs, address, timeout=7):
    last = "no rpc"
    for rpc in rpcs[:6]:
        try:
            body = json.dumps(
                {"jsonrpc": "2.0", "id": 1, "method": "eth_getCode", "params": [address, "latest"]}
            ).encode()
            req = urllib.request.Request(
                rpc, data=body, headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
            )
            with urllib.request.urlopen(req, timeout=timeout) as r:
                resp = json.loads(r.read().decode("utf-8", errors="replace"))
            code = resp.get("result")
            if isinstance(code, str):
                if code in ("0x", "0x0", ""):
                    return "no_code", {"rpc": rpc, "code_len": len(code)}
                return "ok", {"rpc": rpc, "code_len": len(code)}
            last = "bad_result"
        except Exception as e:
            last = str(e)[:140]
    return "rpc_error", {"error": last}


# annotate rpcs
for rec in candidates:
    rpcs, rpc_chain, resolved_cid = rpc_candidates(rec)
    rec["rpc_candidates"] = rpcs
    rec["rpc_chain"] = rpc_chain
    rec["resolved_chain_id"] = resolved_cid

# unique test keys
tests = {}
for rec in candidates:
    addr = rec["address"]
    if not re.fullmatch(r"0x[a-fA-F0-9]{40}", addr):
        continue
    key = (tuple(rec["rpc_candidates"][:6]), addr.lower())
    tests[key] = (rec["rpc_candidates"], addr)

print("Unique rpc/address tests:", len(tests))

results = {}
with concurrent.futures.ThreadPoolExecutor(max_workers=42) as ex:
    futs = {ex.submit(eth_get_code_multi, rpcs, addr): k for k, (rpcs, addr) in tests.items()}
    done = 0
    for fut in concurrent.futures.as_completed(futs):
        k = futs[fut]
        try:
            results[k] = fut.result()
        except Exception as e:
            results[k] = ("rpc_error", {"error": str(e)[:120]})
        done += 1
        if done % 250 == 0:
            print("  tested", done)

status = defaultdict(int)
for rec in candidates:
    if not rec["rpc_candidates"]:
        rec["test_status"] = "no_rpc"
        status["no_rpc"] += 1
        continue
    key = (tuple(rec["rpc_candidates"][:6]), rec["address"].lower())
    st, meta = results.get(key, ("rpc_error", {"error": "missing"}))
    rec["test_status"] = st
    rec["test_meta"] = meta
    status[st] += 1

summary = {
    "total_records": len(candidates),
    "by_protocol": {},
    "status": dict(status),
    "tested_unique": len(results),
}
for r in candidates:
    summary["by_protocol"][r["protocol"]] = summary["by_protocol"].get(r["protocol"], 0) + 1

tests_path = DATA_DIR / "bridge_contract_tests.json"
tests_path.write_text(
    json.dumps(
        {
            "generated_at": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
            "summary": summary,
            "records": candidates,
        },
        indent=2,
    )
)

# -----------------------------
# chain report (with niche/non-EVM classification)
# -----------------------------
matrix = json.loads((Path("/root/matrix_data.json")).read_text())
chains = []
seen = set()
for c in matrix["chains"]:
    n = c["n"]
    if n.lower() in seen:
        continue
    seen.add(n.lower())
    chains.append({"chain": n, "canonical": c.get("c", n), "bridges": c.get("b", "")})

idx = defaultdict(list)
for r in candidates:
    idx[(r["protocol"].lower(), r["chain"].lower())].append(r)

PROTO_MAP = {
    "layerzero": "layerzero",
    "wormhole": "wormhole",
    "axelar": "axelar",
    "stargate": "stargate",
    "across": "across",
    "debridge": "debridge",
    "hop": "hop",
    "cbridge": "cbridge",
    "celer": "cbridge",
    "ccip": "ccip",
    "connext": "connext",
    "ibc": "ibc",
    "xcm": "xcm",
    "mayachain": "mayachain",
    "thorchain": "thorchain",
    "rainbow bridge": "rainbow-bridge",
    "allbridge": "allbridge",
    "multichain": "multichain",
    "poly network": "poly-network",
    "wanchain": "wanchain",
}

MODULE_BASED = {"ibc", "xcm", "thorchain", "mayachain"}
NATIVE_LABELS = ["bridge", "rollup", "native", "op stack"]

report_rows = []
coverage = {
    "with_tested_contracts": 0,
    "without_tested_contracts": 0,
    "with_bridge_intel": 0,
    "without_bridge_intel": 0,
    "total": len(chains),
}

for ch in chains:
    cname = ch["chain"]
    ccanon = ch["canonical"]
    blabels = [b.strip() for b in ch["bridges"].split(",") if b.strip()]
    bitems = []
    has_any = False
    has_intel = False

    for b in blabels:
        key = re.sub(r"\s*\(.*?\)", "", b.lower()).strip()
        mapped = None
        for k, v in PROTO_MAP.items():
            if key == k or key.startswith(k):
                mapped = v
                break

        if mapped in {
            "layerzero",
            "wormhole",
            "axelar",
            "stargate",
            "across",
            "debridge",
            "hop",
            "cbridge",
            "ccip",
            "connext",
        }:
            cand = []
            for nm in {cname, ccanon, cname.replace(" ", ""), cname.title()}:
                cand.extend(idx.get((mapped, nm.lower()), []))
            ded = {}
            for r in cand:
                ded[(r["address"].lower(), r["contract"])] = r
            lst = list(ded.values())
            ok = [r for r in lst if r.get("test_status") == "ok"]
            if lst:
                has_any = True
                has_intel = True
            bitems.append(
                {
                    "bridge": b,
                    "protocol": mapped,
                    "integration_type": "evm_contracts",
                    "contracts_found": len(lst),
                    "contracts_ok": len(ok),
                    "contracts": lst[:140],
                }
            )
        elif mapped in MODULE_BASED:
            has_intel = True
            bitems.append(
                {
                    "bridge": b,
                    "protocol": mapped,
                    "integration_type": "module_or_native",
                    "contracts_found": 0,
                    "contracts_ok": 0,
                    "contracts": [],
                    "note": "Module-based bridge (non-EVM contract model). Marked as integrated classification; contract test N/A.",
                }
            )
        else:
            itype = "native_or_unknown"
            if any(x in key for x in NATIVE_LABELS):
                itype = "native_bridge_label"
                has_intel = True
            bitems.append(
                {
                    "bridge": b,
                    "protocol": mapped or "unknown",
                    "integration_type": itype,
                    "contracts_found": 0,
                    "contracts_ok": 0,
                    "contracts": [],
                    "note": "No machine-readable contract source integrated yet for this bridge label",
                }
            )

    if has_any:
        coverage["with_tested_contracts"] += 1
    else:
        coverage["without_tested_contracts"] += 1

    if has_any or has_intel:
        coverage["with_bridge_intel"] += 1
    else:
        coverage["without_bridge_intel"] += 1

    report_rows.append(
        {
            "chain": cname,
            "canonical": ccanon,
            "bridges": bitems,
            "tested_contract_total": sum(x["contracts_found"] for x in bitems),
            "tested_contract_ok": sum(x["contracts_ok"] for x in bitems),
        }
    )

report_path = DATA_DIR / "bridge_chain_contract_report.json"
report_path.write_text(
    json.dumps(
        {
            "generated_at": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
            "coverage": coverage,
            "source_summary": summary,
            "chains": report_rows,
        },
        indent=2,
    )
)

print("\nPhase 2 complete.")
print("Summary:", json.dumps(summary, indent=2))
print("Chain coverage:", coverage)
print("Wrote:")
print(" -", cand_path)
print(" -", tests_path)
print(" -", report_path)
