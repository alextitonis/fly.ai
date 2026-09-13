"""
Calldata decoder for DEX router swap transactions.
Extracts token addresses, amounts, and swap paths from pending transactions.
Used by MempoolProvider to turn raw txs into structured swap intents.
"""

import logging
from dataclasses import dataclass
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

# ── ABI signatures ────────────────────────────────────────────────────────────
# function selector (bytes4) → function name
UNISWAP_V2_SELECTORS = {
    "0x38ed1739": "swapExactTokensForTokens",
    "0x18cbafe5": "swapExactTokensForTokensSupportingFeeOnTransferTokens",
    "0x8803dbee": "swapExactETHForTokens",
    "0x4a25d94a": "swapExactTokensForETH",
    "0x7ff36ab5": "swapExactETHForTokensSupportingFeeOnTransferTokens",
    "0x4fb63a4d": "swapExactTokensForETHSupportingFeeOnTransferTokens",
    "0xfb3bdb41": "swapTokensForExactTokens",
    "0x5df0f9c1": "swapETHForExactTokens",
    "0x5c11d795": "swapTokensForExactETH",
    "0x791ac947": "swapETHForExactTokens",
}

UNISWAP_V3_SELECTORS = {
    "0x6f1eaf58": "multicall",            # often used with exactInput
    "0xc04a8e70": "execute",              # newer router interface  
    "0x8a8c523c": "exactInput",           # single path, exact in
    "0x09e83076": "exactInputSingle",     # single pool exact in
    "0x4b36e4cb": "exactOutput",          # single path, exact out
    "0x7bce7831": "exactOutputSingle",    # single pool exact out
    "0x9022144e": "swap",                 # older V3 router
}

# ── Data types ────────────────────────────────────────────────────────────────

@dataclass
class SwapIntent:
    """Decoded swap parameters from a pending DEX transaction."""
    tx_hash:        str
    tx_from:        str
    router:         str          # detected router name (e.g. "Uniswap V3 Base")
    router_addr:    str          # 0x... lower-case
    function_name:  str          # e.g. "exactInput"
    token_in:       Optional[str] = None   # 0x... (address) or None for ETH
    token_out:      Optional[str] = None
    amount_in:      Optional[int] = None   # wei / raw token units
    amount_out_min: Optional[int] = None   # wei / raw token units
    path:           Optional[list[str]] = None  # list of token addresses for multi-hop
    deadline:       Optional[int] = None   # block.timestamp deadline, if present
    raw_data:       str = ""               # full calldata hex

    def is_eth(self, addr: Optional[str]) -> bool:
        """Check if addr represents native ETH (None or zero address)."""
        return addr is None or addr.lower() in ("0x", "0x0", "0x0000000000000000000000000000000000000000")

    @property
    def token_in_str(self) -> str:
        if self.is_eth(self.token_in):
            return "ETH"
        return (self.token_in or "?")[:10]

    @property
    def token_out_str(self) -> str:
        if self.is_eth(self.token_out):
            return "ETH"
        return (self.token_out or "?")[:10]


# ── Decoding primitives ────────────────────────────────────────────────────────

def _decode_address(param: str) -> Optional[str]:
    """Decode a 32-byte word containing an address (right-padded)."""
    if not param or len(param) < 64:
        return None
    return "0x" + param[-40:].lower()


def _decode_uint256(param: str) -> int:
    """Decode a 32-byte word as unsigned 256-bit integer."""
    return int(param, 16) if param else 0


def _abi_decode_params(calldata: str) -> list[str]:
    """
    Split calldata into 32-byte words (skip 8-byte function selector).
    Returns list of hex strings (no 0x prefix), each 64 chars padded.
    """
    data = calldata[10:]  # strip "0x" + selector
    words = []
    for i in range(0, len(data), 64):
        word = data[i:i+64]
        if len(word) < 64:
            word = word.rjust(64, '0')
        words.append(word)
    return words


# ── Uniswap V2 decoder ─────────────────────────────────────────────────────────

def decode_v2_swap(selector: str, data_words: list[str], func_name: str) -> Optional[SwapIntent]:
    """
    Decode Uniswap V2 router swap function calldata.
    Common pattern: path is encoded as <len><addr1><addr2>...
    """
    # V2 selectors have paths at specific offsets:
    #   swapExactTokensForTokens(amountIn, amountOutMin, path, to, deadline)
    #   swapExactTokensForETH(amountIn, amountOutMin, path, to, deadline)
    #   swapExactETHForTokens(amountOutMin, path, to, deadline)
    #   swapTokensForExactTokens(amountOut, amountIn, path, to, deadline)
    #
    # Most common: first two params are amountIn/amountOutMin (each 32 bytes),
    # path is dynamic offset in third param.
    
    if len(data_words) < 3:
        return None

    # Parse amountIn or amountOut depending on function
    amount_in = None
    amount_out_min = None
    path: list[str] = []
    
    # Parse based on function
    if func_name == "swapExactTokensForTokens" or func_name == "swapExactTokensForETH":
        # Params: amountIn (0), amountOutMin (1), path offset (2)
        amount_in = _decode_uint256(data_words[0])
        amount_out_min = _decode_uint256(data_words[1])
        # path offset in words[2], decode as (length, addresses...)
        path = _decode_path(data_words, start_idx=2)
        
    elif func_name == "swapExactETHForTokens" or func_name == "swapExactETHForTokensSupportingFeeOnTransferTokens":
        # Params: amountOutMin (0), path offset (1)
        amount_in = None  # ETH sent with tx.value
        amount_out_min = _decode_uint256(data_words[0])
        path = _decode_path(data_words, start_idx=1)
        
    elif func_name == "swapTokensForExactTokens" or func_name == "swapTokensForExactETH":
        # Params: amountOut (0), amountIn (1), path offset (2)
        amount_out_min = None  # This is exact-output: amountOut is fixed
        # amountIn will be determined from path/pool later
        path = _decode_path(data_words, start_idx=2)
    else:
        return None

    # Extract just first/last token from path for arbitrage trigger
    token_in  = path[0] if path else None
    token_out = path[-1] if path and len(path) >= 2 else None

    return SwapIntent(
        tx_hash="",  # filled by caller
        tx_from="",
        router="Uniswap V2",
        router_addr="0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
        function_name=func_name,
        token_in=token_in,
        token_out=token_out,
        amount_in=amount_in,
        amount_out_min=amount_out_min,
        path=path,
    )


def _decode_path(words: list[str], start_idx: int) -> list[str]:
    """
    Decode dynamic array 'address[] path' starting at words[start_idx].
    ABI layout: offset (word), length (word), then N address words.
    """
    if start_idx >= len(words):
        return []
    # Offset points past the length field itself: offset = 2*32 * start_of_array_after_this_param
    # For our simple case, the path is already at words[start_idx + 2] if start_idx points to offset
    # Simpler: check if remaining words contain plausible addresses (20 bytes with 12 leading zeros)
    # This works for short paths embedded inline.
    addresses = []
    for word in words[start_idx:]:
        if len(word) >= 40:
            addr = "0x" + word[-40:]
            # Basic sanity: looks like an address (non-zero, proper length)
            if addr != "0x0000000000000000000000000000000000000000":
                addresses.append(addr.lower())
    return addresses


# ── Uniswap V3 decoder ─────────────────────────────────────────────────────────

def decode_v3_input(calldata: str) -> Optional[SwapIntent]:
    """
    Decode Uniswap V3 'exactInput' / 'exactInputSingle' calldata.
    V3 uses complex path encoding; we handle common 'exactInputSingle' for one-hop.
    """
    words = _abi_decode_params(calldata)
    if not words:
        return None

    # exactInputSingle(ExactInputSingleParams params)
    # struct ExactInputSingleParams {
    #   address tokenIn;
    #   address tokenOut;
    #   uint24  fee;
    #   uint160 sqrtPriceLimitX96;
    #   uint128 amount;
    # }
    # Encoding: each field is a 32-byte word slot
    if len(words) >= 6:
        token_in  = _decode_address(words[0])
        token_out = _decode_address(words[1])
        # fee bps is in the low 24 bits of word[2]
        # amount in is word[4] (uint128 in uint256 slot)
        amount_in = _decode_uint256(words[4])
        return SwapIntent(
            tx_hash="",
            tx_from="",
            router="Uniswap V3",
            router_addr="0xE592427A0AEce92De3Edee1F18E0157C05861564",
            function_name="exactInputSingle",
            token_in=token_in,
            token_out=token_out,
            amount_in=amount_in,
            amount_out_min=None,  # V3 uses sqrtPriceLimitX96 instead
        )

    # exactInput(bytes path) — multi-hop encoded path with fee tiers
    # Minimal parsing: extract first token and last token from path if available
    if len(words) >= 1 and len(words[0]) >= 64:
        # Try to decode Uniswap V3 path bytes (https://docs.uniswap.org/protocol/guides/v3integrate/paths)
        # Path layout: (3 bytes token + 3 bytes fee) repeated, ending with 20-byte tokenOut
        raw = bytes.fromhex(words[0][2:])  # remove 0x
        tokens = []
        i = 0
        while i + 23 <= len(raw):
            token_bytes = raw[i+3:i+23]  # skip 3-byte fee
            tokens.append("0x" + token_bytes.hex())
            i += 23
        if len(tokens) >= 2:
            return SwapIntent(
                tx_hash="",
                tx_from="",
                router="Uniswap V3",
                router_addr="0xE592427A0AEce92De3Edee1F18E0157C05861564",
                function_name="exactInput",
                token_in=tokens[0],
                token_out=tokens[-1],
                path=tokens,
            )

    return None


# ── Universal decoder ──────────────────────────────────────────────────────────

def decode_swap_calldata(calldata: str, router_addr: Optional[str] = None, router_name: Optional[str] = None) -> Optional[SwapIntent]:
    """
    Decode swap calldata given function selector + optional router metadata.
    Returns SwapIntent with extracted swap parameters, or None if unrecognized.
    """
    if not calldata or len(calldata) < 10:
        return None

    selector = calldata[:10].lower()
    words = _abi_decode_params(calldata)

    # Try V2 first
    if selector in UNISWAP_V2_SELECTORS:
        func = UNISWAP_V2_SELECTORS[selector]
        return decode_v2_swap(selector, words, func)

    # Try V3
    if selector in UNISWAP_V3_SELECTORS:
        func = UNISWAP_V3_SELECTORS[selector]
        if func in ("exactInputSingle", "exactOutputSingle"):
            return decode_v3_input(calldata)
        # For multicall/exactInput multi-hop, we need full path decode (stubbed for now)
        return SwapIntent(
            tx_hash="",
            tx_from="",
            router=router_name or "Uniswap V3",
            router_addr=(router_addr or "").lower(),
            function_name=func,
            token_in=None,
            token_out=None,
            amount_in=None,
            amount_out_min=None,
            raw_data=calldata,
        )

    return None


# ── Helper for MempoolProvider ─────────────────────────────────────────────────

def enrich_swap_intent_from_tx(tx_hash: str, tx_from: str, to_addr: str, calldata: str, gas_price: Optional[int] = None) -> Optional[SwapIntent]:
    """
    Given a pending transaction, return decoded SwapIntent if it looks like a DEX swap.
    """
    # Detect router name via address lookup
    router_name = None
    router_addr_lower = to_addr.lower() if to_addr else None
    ROUTER_MAP = {
        "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D".lower(): "Uniswap V2",
        "0xE592427A0AEce92De3Edee1F18E0157C05861564".lower(): "Uniswap V3",
        "0x1111111254EEB25477B68fb85Ed929f73A960582".lower(): "1inch",
        "0x2626664c2603336E57B271c5C0B26F421741eD08".lower(): "Uniswap V3 Base",
        "0x1c4D8A4b475122E00Efc6F99eE3a97cF76c56C16".lower(): "Uniswap V3 Arb",
    }
    if router_addr_lower in ROUTER_MAP:
        router_name = ROUTER_MAP[router_addr_lower]

    intent = decode_swap_calldata(calldata, router_addr_lower, router_name)
    if intent:
        intent.tx_hash = tx_hash
        intent.tx_from = tx_from
        return intent
    return None
