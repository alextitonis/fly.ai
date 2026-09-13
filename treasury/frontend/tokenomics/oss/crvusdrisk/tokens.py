"""
Token DTOs for convenient access to token info.
Adding a new token:
1. Add the address to the addresses section.
2. Add the DTO to the DTOs section.
3. Add the DTO to the DTOs dict.
4. Add the Coingecko ID to the COINGECKO_IDS dict.
"""
from ..data_transfer_objects import TokenDTO

# Addresses
CRVUSD = "0xf939e0a03fb07f59a73314e73794be0e57ac1b4e"
USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7"
USDP = "0x8e870d67f660d95d5be530380d0ec0bd388289e1"
TUSD = "0x0000000000085d4780b73119b644ae5ecd22b376"
WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
WSTETH = "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0"
SFRXETH = "0xac3e018457b222d93114458476f3e3416abbe38f"
WBTC = "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599"
TBTC = "0x18084fba666a33d37592fa2633fd49a74dd93a88"

STABLES = [USDC, USDT, USDP, TUSD]
COLLATERAL = [WETH, WSTETH, SFRXETH, WBTC, TBTC]
ADDRESSES = STABLES + COLLATERAL

# Coingecko Helpers
COINGECKO_IDS = {
    USDC: "usd-coin",
    USDT: "tether",
    USDP: "paxos-standard",
    TUSD: "true-usd",
    WETH: "weth",
    WSTETH: "wrapped-steth",
    SFRXETH: "staked-frax-ether",
    WBTC: "wrapped-bitcoin",
    TBTC: "tbtc",
}
STABLE_CG_IDS = [COINGECKO_IDS[coin] for coin in STABLES]
COINGECKO_IDS_INV = {v: k for k, v in COINGECKO_IDS.items()}

# TODO script to update these with new tokens

# DTOs
CRVUSD_DTO = TokenDTO(
    address=CRVUSD,
    name="Curve.Fi USD Stablecoin",
    symbol="crvUSD",
    decimals=18,
    min_trade_size=0,
    max_trade_size=0,
)  # NOTE don't add to TOKEN_DTOs

USDC_DTO = TokenDTO(
    address=USDC,
    name="USD Coin",
    symbol="USDC",
    decimals=6,
    min_trade_size=1e3,
    max_trade_size=1e8,
)

USDT_DTO = TokenDTO(
    address=USDT,
    name="Tether USD",
    symbol="USDT",
    decimals=6,
    min_trade_size=1e3,
    max_trade_size=1e8,
)

USDP_DTO = TokenDTO(
    address=USDP,
    name="Pax Dollar",
    symbol="USDP",
    decimals=18,
    min_trade_size=1e3,
    max_trade_size=1e8,
)

TUSD_DTO = TokenDTO(
    address=TUSD,
    name="TrueUSD",
    symbol="TUSD",
    decimals=18,
    min_trade_size=1e3,
    max_trade_size=1e8,
)

WETH_DTO = TokenDTO(
    address=WETH,
    name="Wrapped Ether",
    symbol="WETH",
    decimals=18,
    min_trade_size=0.5,
    max_trade_size=50000,
)

WSTETH_DTO = TokenDTO(
    address=WSTETH,
    name="Wrapped liquid staked Ether 2.0",
    symbol="wstETH",
    decimals=18,
    min_trade_size=0.5,
    max_trade_size=50000,
)

SFRXETH_DTO = TokenDTO(
    address=SFRXETH,
    name="Staked Frax Ether",
    symbol="sfrxETH",
    decimals=18,
    min_trade_size=0.5,
    max_trade_size=50000,
)

WBTX_DTO = TokenDTO(
    address=WBTC,
    name="Wrapped BTC",
    symbol="WBTC",
    decimals=8,
    min_trade_size=0.03,
    max_trade_size=3000,
)

TBTC_DTO = TokenDTO(
    address=TBTC,
    name="tBTC v2",
    symbol="tBTC",
    decimals=18,
    min_trade_size=0.03,
    max_trade_size=3000,
)

TOKEN_DTOs = {
    USDC: USDC_DTO,
    USDT: USDT_DTO,
    USDP: USDP_DTO,
    TUSD: TUSD_DTO,
    WETH: WETH_DTO,
    WSTETH: WSTETH_DTO,
    SFRXETH: SFRXETH_DTO,
    WBTC: WBTX_DTO,
    TBTC: TBTC_DTO,
}
