"""Fee calculator: fetches on-chain fee tiers and computes total DEX cost."""
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Optional
from .provider import RpcProvider
from ..base_dex_prices import BASE_FACTORIES

# Basis points constant
BPS = Decimal("0.0001")  # 1 bp = 0.01%
DECIMAL_18 = Decimal("10") ** 18

# V2 DEX fee defaults (basis points)
V2_DEFAULT_FEES = {
    "Uniswap V2": 30,      # 0.30%
    "PancakeSwap V2": 25,  # 0.25%
    "SushiSwap V2": 30,    # 0.30%
    "Aerodrome": 5,        # 0.05% (stable pools) - but Aerodrome V2 typical is 0.05%
    "BaseSwap V2": 5,      # assuming stable
}

# V3 fee cache: pool address -> fee_bps
_v3_fee_cache: dict[str, int] = {}

def _decode_fee_uint24(hex_str: str) -> int:
    """Decode a 32-byte hex string containing a uint24."""
    stripped = hex_str[2:] if hex_str.startswith("0x") else hex_str
    return int(stripped, 16)

def get_v3_fee(pool: str, chain: str, provider: RpcProvider) -> int:
    """Fetch fee (in hundredths of a basis point) from a V3 pool contract."""
    cache_key = f"{chain}:{pool.lower()}"
    if cache_key in _v3_fee_cache:
        return _v3_fee_cache[cache_key]
    
    fee_selector = "0x06f7f2f2"  # fee() function signature, returns uint24
    result = provider.eth_call(chain, pool, fee_selector)
    if result:
        fee_hundredths = _decode_fee_uint24(result)
        # Convert hundredths of a basis point to basis points
        fee_bps = fee_hundredths // 100
        _v3_fee_cache[cache_key] = fee_bps
        return fee_bps
    
    # Fallback: return 30 bps
    return 30

def _v2_fee_bps(dex_name: str) -> int:
    """Determine V2 fee for a given DEX name (default to 30 bps)."""
    return V2_DEFAULT_FEES.get(dex_name, 30)

@dataclass
class PoolFee:
    """Fee information for a single pool."""
    dex_name: str
    chain: str
    pool_address: str
    pool_type: str  # 'v2' or 'v3'
    fee_bps: int
    fee_decimal: Decimal = field(init=False)

    def __post_init__(self):
        self.fee_decimal = Decimal(self.fee_bps) / Decimal("10000")  # e.g., 30 bps / 10000 = 0.003

@dataclass
class FeeEstimate:
    """Total fee estimation for a cross-DEX arbitrage (buy + sell)."""
    buy_fee: PoolFee
    sell_fee: PoolFee
    total_fee_bps: int = field(init=False)
    total_fee_decimal: Decimal = field(init=False)

    def __post_init__(self):
        self.total_fee_bps = self.buy_fee.fee_bps + self.sell_fee.fee_bps
        self.total_fee_decimal = self.buy_fee.fee_decimal + self.sell_fee.fee_decimal

    @property
    def total_fee_pct(self) -> Decimal:
        """Return total fee as percentage (e.g., 0.006 for 0.6%)."""
        return Decimal(self.total_fee_bps) * BPS

def build_fee_estimate(
    buy_dex: str,
    sell_dex: str,
    pool_type: str,
    chain: str,
    pool_address: str,
    provider: RpcProvider,
) -> FeeEstimate:
    """Construct fee estimate for a given pair of pools."""
    # Determine fee for each leg
    if pool_type.lower() == "v3":
        fee_bps = get_v3_fee(pool_address, chain, provider)
    else:
        fee_bps = _v2_fee_bps(buy_dex)

    buy_fee = PoolFee(dex_name=buy_dex, chain=chain, pool_address=pool_address,
                      pool_type=pool_type, fee_bps=fee_bps)

    # For sell leg, the fee is likely same (same pool type, maybe same DEX)
    sell_fee = PoolFee(dex_name=sell_dex, chain=chain, pool_address=pool_address,
                       pool_type=pool_type, fee_bps=fee_bps)

    return FeeEstimate(buy_fee=buy_fee, sell_fee=sell_fee)

# Also include helper to fetch token decimals (parser) similar to scanner
BASE_TOKEN_DECIMALS_HARDCODED = {
    "0x4200000000000000000000000000000000000006": 18,  # WETH
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": 6,   # USDC
    "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2": 6,   # USDT
    "0x50c5725949a6f0c72e6c4a641f24049a917db0cb": 18,  # DAI
    "0x940181a94a35a4569d4521129dfd34b47d5ed16c": 18,  # AERO
}
_token_decimals_cache: dict[str, int] = {}

def get_token_decimals(token: str, provider: RpcProvider, chain: str) -> int:
    """Get token decimals through on-chain call with cache."""
    token_lower = token.lower()
    if token_lower in BASE_TOKEN_DECIMALS_HARDCODED:
        return BASE_TOKEN_DECIMALS_HARDCODED[token_lower]
    if token_lower in _token_decimals_cache:
        return _token_decimals_cache[token_lower]

    decimals_selector = "0x313ce567"  # decimals()
    result = provider.eth_call(chain, token, decimals_selector)
    if result:
        try:
            dec = int(result, 16)
            if 0 < dec <= 36:
                _token_decimals_cache[token_lower] = dec
                return dec
        except ValueError:
            pass
    return 18  # default

