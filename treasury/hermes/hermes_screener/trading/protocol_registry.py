#!/usr/bin/env python3
"""
Protocol Registry: Router addresses + minimal ABIs for direct contract interaction.
Primary execution path: contract calls via Web3.py
Fallback: API calls via dex_aggregator_trader.py
"""

# ==================== MINIMAL ABIs ====================

# ERC-20: approve + allowance + balanceOf + decimals
ERC20_ABI = [
    {
        "type": "function",
        "name": "approve",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "spender", "type": "address"},
            {"name": "amount", "type": "uint256"},
        ],
        "outputs": [{"name": "", "type": "bool"}],
    },
    {
        "type": "function",
        "name": "allowance",
        "stateMutability": "view",
        "inputs": [
            {"name": "owner", "type": "address"},
            {"name": "spender", "type": "address"},
        ],
        "outputs": [{"name": "", "type": "uint256"}],
    },
    {
        "type": "function",
        "name": "balanceOf",
        "stateMutability": "view",
        "inputs": [{"name": "account", "type": "address"}],
        "outputs": [{"name": "", "type": "uint256"}],
    },
    {
        "type": "function",
        "name": "decimals",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "", "type": "uint8"}],
    },
    {
        "type": "function",
        "name": "symbol",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "", "type": "string"}],
    },
]

# Uniswap V3 SwapRouter02: exactInputSingle, exactInput, multicall
UNIV3_ROUTER_ABI = [
    {
        "type": "function",
        "name": "exactInputSingle",
        "stateMutability": "payable",
        "inputs": [
            {
                "name": "params",
                "type": "tuple",
                "components": [
                    {"name": "tokenIn", "type": "address"},
                    {"name": "tokenOut", "type": "address"},
                    {"name": "fee", "type": "uint24"},
                    {"name": "recipient", "type": "address"},
                    {"name": "deadline", "type": "uint256"},
                    {"name": "amountIn", "type": "uint256"},
                    {"name": "amountOutMinimum", "type": "uint256"},
                    {"name": "sqrtPriceLimitX96", "type": "uint160"},
                ],
            }
        ],
        "outputs": [{"name": "amountOut", "type": "uint256"}],
    },
    {
        "type": "function",
        "name": "exactInput",
        "stateMutability": "payable",
        "inputs": [
            {
                "name": "params",
                "type": "tuple",
                "components": [
                    {"name": "path", "type": "bytes"},
                    {"name": "recipient", "type": "address"},
                    {"name": "deadline", "type": "uint256"},
                    {"name": "amountIn", "type": "uint256"},
                    {"name": "amountOutMinimum", "type": "uint256"},
                ],
            }
        ],
        "outputs": [{"name": "amountOut", "type": "uint256"}],
    },
    {
        "type": "function",
        "name": "multicall",
        "stateMutability": "payable",
        "inputs": [{"name": "data", "type": "bytes[]"}],
        "outputs": [{"name": "results", "type": "bytes[]"}],
    },
    {
        "type": "function",
        "name": "unwrapWETH9",
        "stateMutability": "payable",
        "inputs": [
            {"name": "amountMinimum", "type": "uint256"},
            {"name": "recipient", "type": "address"},
        ],
        "outputs": [],
    },
]

# Uniswap V3 QuoterV2: quoteExactInputSingle (view)
UNIV3_QUOTER_ABI = [
    {
        "type": "function",
        "name": "quoteExactInputSingle",
        "stateMutability": "view",
        "inputs": [
            {
                "name": "params",
                "type": "tuple",
                "components": [
                    {"name": "tokenIn", "type": "address"},
                    {"name": "tokenOut", "type": "address"},
                    {"name": "amountIn", "type": "uint256"},
                    {"name": "fee", "type": "uint24"},
                    {"name": "sqrtPriceLimitX96", "type": "uint160"},
                ],
            }
        ],
        "outputs": [
            {"name": "amountOut", "type": "uint256"},
            {"name": "sqrtPriceX96After", "type": "uint160"},
            {"name": "initializedTicksCrossed", "type": "uint32"},
            {"name": "gasEstimate", "type": "uint256"},
        ],
    },
]

# KyberSwap AggregationRouter: swap, swapExactIn
KYBER_ROUTER_ABI = [
    {
        "type": "function",
        "name": "swapExactIn",
        "stateMutability": "payable",
        "inputs": [
            {"name": "executor", "type": "address"},
            {
                "name": "desc",
                "type": "tuple",
                "components": [
                    {"name": "srcToken", "type": "address"},
                    {"name": "dstToken", "type": "address"},
                    {"name": "srcReceiver", "type": "address"},
                    {"name": "dstReceiver", "type": "address"},
                    {"name": "amount", "type": "uint256"},
                    {"name": "minReturnAmount", "type": "uint256"},
                    {"name": "flags", "type": "uint256"},
                ],
            },
            {"name": "data", "type": "bytes[]"},
        ],
        "outputs": [{"name": "returnAmount", "type": "uint256"}],
    },
    # Legacy swap method
    {
        "type": "function",
        "name": "swap",
        "stateMutability": "payable",
        "inputs": [
            {
                "name": "desc",
                "type": "tuple",
                "components": [
                    {"name": "srcToken", "type": "address"},
                    {"name": "dstToken", "type": "address"},
                    {"name": "srcReceiver", "type": "address"},
                    {"name": "dstReceiver", "type": "address"},
                    {"name": "amount", "type": "uint256"},
                    {"name": "minReturnAmount", "type": "uint256"},
                    {"name": "flags", "type": "uint256"},
                ],
            },
            {"name": "data", "type": "bytes[]"},
        ],
        "outputs": [{"name": "", "type": "uint256"}],
    },
]

# Odos V2 Router: swap
ODOS_ROUTER_ABI = [
    {
        "type": "function",
        "name": "swap",
        "stateMutability": "payable",
        "inputs": [
            {"name": "swapRouter", "type": "address"},
            {"name": "userAddr", "type": "address"},
            {"name": "receiver", "type": "address"},
            {
                "name": "inputAmounts",
                "type": "tuple",
                "components": [
                    {"name": "tokenAddress", "type": "address"},
                    {"name": "amount", "type": "uint256"},
                ],
            },
            {
                "name": "outputAmounts",
                "type": "tuple",
                "components": [
                    {"name": "tokenAddress", "type": "address"},
                    {"name": "amount", "type": "uint256"},
                ],
            },
            {"name": "swapPath", "type": "bytes"},
            {"name": "transitTokens", "type": "address[]"},
            {"name": "feeRecipients", "type": "address[]"},
            {"name": "feeAmounts", "type": "uint256[]"},
            {"name": "deadline", "type": "uint256"},
            {"name": "value", "type": "uint256"},
        ],
        "outputs": [{"name": "returnAmounts", "type": "uint256[]"}],
    },
]

# CoW GPv2Settlement: only stores orders via GPv2Order, no direct swap method
# CoW requires off-chain signing + order submission via API
COW_SETTLEMENT_ABI = [
    {
        "type": "function",
        "name": "setPreSignature",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "orderUid", "type": "bytes32"},
            {"name": "signed", "type": "bool"},
        ],
        "outputs": [],
    },
]

# PancakeSwap SmartRouter: multicall, exactInputSingle, exactInput
PANCAKE_ROUTER_ABI = [
    {
        "type": "function",
        "name": "exactInputSingle",
        "stateMutability": "payable",
        "inputs": [
            {
                "name": "params",
                "type": "tuple",
                "components": [
                    {"name": "tokenIn", "type": "address"},
                    {"name": "tokenOut", "type": "address"},
                    {"name": "fee", "type": "uint24"},
                    {"name": "recipient", "type": "address"},
                    {"name": "deadline", "type": "uint256"},
                    {"name": "amountIn", "type": "uint256"},
                    {"name": "amountOutMinimum", "type": "uint256"},
                    {"name": "sqrtPriceLimitX96", "type": "uint160"},
                ],
            }
        ],
        "outputs": [{"name": "amountOut", "type": "uint256"}],
    },
    {
        "type": "function",
        "name": "exactInput",
        "stateMutability": "payable",
        "inputs": [
            {
                "name": "params",
                "type": "tuple",
                "components": [
                    {"name": "path", "type": "bytes"},
                    {"name": "recipient", "type": "address"},
                    {"name": "deadline", "type": "uint256"},
                    {"name": "amountIn", "type": "uint256"},
                    {"name": "amountOutMinimum", "type": "uint256"},
                ],
            }
        ],
        "outputs": [{"name": "amountOut", "type": "uint256"}],
    },
    {
        "type": "function",
        "name": "multicall",
        "stateMutability": "payable",
        "inputs": [
            {"name": "deadline", "type": "uint256"},
            {"name": "data", "type": "bytes[]"},
        ],
        "outputs": [{"name": "results", "type": "bytes[]"}],
    },
]

# SushiSwap RouteProcessor4: processRoute
SUSHI_ROUTER_ABI = [
    {
        "type": "function",
        "name": "processRoute",
        "stateMutability": "payable",
        "inputs": [
            {"name": "tokenIn", "type": "address"},
            {"name": "amountIn", "type": "uint256"},
            {"name": "tokenOut", "type": "address"},
            {"name": "amountOutMin", "type": "uint256"},
            {"name": "to", "type": "address"},
            {"name": "route", "type": "bytes"},
        ],
        "outputs": [{"name": "amountOut", "type": "uint256"}],
    },
    {
        "type": "function",
        "name": "processRouteWithTransferValue",
        "stateMutability": "payable",
        "inputs": [
            {"name": "tokenIn", "type": "address"},
            {"name": "amountIn", "type": "uint256"},
            {"name": "tokenOut", "type": "address"},
            {"name": "amountOutMin", "type": "uint256"},
            {"name": "to", "type": "address"},
            {"name": "route", "type": "bytes"},
            {"name": "value", "type": "uint256"},
        ],
        "outputs": [{"name": "amountOut", "type": "uint256"}],
    },
]

# ParaSwap/Velora AugustusSwapper: simpleSwap, swapOnUniswapV2Fork
PARASWAP_ABI = [
    {
        "type": "function",
        "name": "simpleSwap",
        "stateMutability": "payable",
        "inputs": [
            {"name": "fromToken", "type": "address"},
            {"name": "toToken", "type": "address"},
            {"name": "fromAmount", "type": "uint256"},
            {"name": "toAmount", "type": "uint256"},
            {"name": "expectedAmount", "type": "uint256"},
            {"name": "callees", "type": "address[]"},
            {"name": "exchangeData", "type": "bytes[]"},
            {"name": "startIndexes", "type": "uint256[]"},
            {"name": "values", "type": "uint256[]"},
            {"name": "beneficiary", "type": "address"},
            {"name": "partner", "type": "address"},
            {"name": "feePercent", "type": "uint256"},
            {"name": "permit", "type": "bytes"},
            {"name": "deadline", "type": "uint256"},
        ],
        "outputs": [{"name": "receivedAmount", "type": "uint256"}],
    },
]

# LiFi Diamond: swapTokensSingleStepBridge
LIFI_DIAMOND_ABI = [
    {
        "type": "function",
        "name": "swapTokensSingleStepBridge",
        "stateMutability": "payable",
        "inputs": [
            {
                "name": "_swapData",
                "type": "tuple",
                "components": [
                    {"name": "callTo", "type": "address"},
                    {"name": "approveTo", "type": "address"},
                    {"name": "sendingAssetId", "type": "address"},
                    {"name": "receivingAssetId", "type": "address"},
                    {"name": "fromAmount", "type": "uint256"},
                    {"name": "callData", "type": "bytes"},
                ],
            },
            {"name": "_recipient", "type": "address"},
        ],
        "outputs": [],
    },
]

# ==================== ROUTER REGISTRY ====================
# All addresses verified on Base (April 16, 2026)

PROTOCOL_REGISTRY = {
    "base": {
        "uniswap_v3": {
            "name": "Uniswap V3",
            "router": "0x2626664c2603336E57B271c5C0b26F421741e481",
            "router02": "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
            "quoter": "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
            "abi": UNIV3_ROUTER_ABI,
            "quote_abi": UNIV3_QUOTER_ABI,
            "fee_tiers": [100, 500, 3000, 10000],  # 0.01%, 0.05%, 0.3%, 1%
            "type": "swap",
            "native_wrap": "0x4200000000000000000000000000000000000006",  # WETH
        },
        "kyberswap": {
            "name": "KyberSwap",
            "router": "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5",
            "abi": KYBER_ROUTER_ABI,
            "type": "aggregator",
            "native_wrap": "0x4200000000000000000000000000000000000006",
        },
        "odos": {
            "name": "Odos",
            "router": "0x19cEeAd7105607Cd444F5ad10dd51356436095a1",
            "abi": ODOS_ROUTER_ABI,
            "type": "aggregator",
            "needs_api_quote": True,  # Odos requires API for path assembly
        },
        "cow": {
            "name": "CoW Protocol",
            "router": "0x9008D19f58AAbD9eD0D60971565AA8510560ab41",
            "abi": COW_SETTLEMENT_ABI,
            "type": "cow",
            "needs_api_quote": True,  # CoW requires off-chain order signing
            "native_wrap": "0x4200000000000000000000000000000000000006",
        },
        "pancakeswap": {
            "name": "PancakeSwap",
            "router": "0x678Aa4bF4E210cf2166753e054d5b7c31cc7fa86",
            "v3_router": "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4",
            "abi": PANCAKE_ROUTER_ABI,
            "type": "swap",
            "native_wrap": "0x4200000000000000000000000000000000000006",
        },
        "sushiswap": {
            "name": "SushiSwap",
            "router": "0x0389879e0156033202C44BF784ac18fC02edeE4f",
            "abi": SUSHI_ROUTER_ABI,
            "type": "swap",
            "native_wrap": "0x4200000000000000000000000000000000000006",
        },
        "velora": {
            "name": "Velora/ParaSwap",
            "router": "0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57",
            "abi": PARASWAP_ABI,
            "type": "aggregator",
            "needs_api_quote": True,  # ParaSwap needs API for route assembly
        },
        "oneinch": {
            "name": "1inch",
            "router": "0x1111111254EEB25477B68fb85Ed929f73A960582",
            "v5_router": "0x111111125421cA6dc452d289314280a0f8842A65",
            "abi": [],  # Loaded from abi_cache.json at runtime
            "type": "aggregator",
            "needs_api_quote": True,
        },
        "lifi": {
            "name": "LiFi",
            "router": "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE",
            "abi": LIFI_DIAMOND_ABI,
            "type": "bridge",
            "needs_api_quote": True,
        },
        "openocean": {
            "name": "OpenOcean V3",
            "router": "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64",
            "abi": [],  # Proxy, ABI not verified on Basescan
            "type": "aggregator",
            "needs_api_quote": True,
        },
    },
    "solana": {
        "jupiter": {
            "name": "Jupiter",
            "type": "aggregator",
            "needs_api_quote": True,  # Solana, use API/CLI
        },
        "raydium": {
            "name": "Raydium",
            "type": "aggregator",
            "needs_api_quote": True,  # Solana, use API
        },
    },
}

# Token registry
TOKEN_REGISTRY = {
    "base": {
        "WETH": {
            "address": "0x4200000000000000000000000000000000000006",
            "decimals": 18,
            "symbol": "WETH",
        },
        "USDC": {
            "address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            "decimals": 6,
            "symbol": "USDC",
        },
        "USDbC": {
            "address": "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA",
            "decimals": 6,
            "symbol": "USDbC",
        },
        "DAI": {
            "address": "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
            "decimals": 18,
            "symbol": "DAI",
        },
        "BRETT": {
            "address": "0x532f27101965dd16442E59d40670FaF5eBB142E4",
            "decimals": 18,
            "symbol": "BRETT",
        },
        "DEGEN": {
            "address": "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed",
            "decimals": 18,
            "symbol": "DEGEN",
        },
        "TOSHI": {
            "address": "0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4",
            "decimals": 18,
            "symbol": "TOSHI",
        },
        "ANDY": {
            "address": "0x029Eb076D2E9E5b2dDc1aB7BDe2D5d3b4b1bfAA0",
            "decimals": 18,
            "symbol": "ANDY",
        },
    },
    "solana": {
        "SOL": {
            "address": "So11111111111111111111111111111111111111112",
            "decimals": 9,
            "symbol": "SOL",
        },
        "USDC": {
            "address": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            "decimals": 6,
            "symbol": "USDC",
        },
        "BONK": {
            "address": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
            "decimals": 5,
            "symbol": "BONK",
        },
        "WIF": {
            "address": "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
            "decimals": 6,
            "symbol": "WIF",
        },
        "POPCAT": {
            "address": "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
            "decimals": 9,
            "symbol": "POPCAT",
        },
    },
}

NATIVE_ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"


def get_protocols_for_chain(chain: str) -> dict:
    """Get all protocol configs for a chain."""
    return PROTOCOL_REGISTRY.get(chain, {})


def get_token(chain: str, symbol: str) -> dict:
    """Get token info by symbol."""
    return TOKEN_REGISTRY.get(chain, {}).get(symbol.upper(), {})


def get_token_address(chain: str, symbol_or_addr: str) -> str:
    """Resolve token address from symbol or return as-is."""
    tokens = TOKEN_REGISTRY.get(chain, {})
    if symbol_or_addr.upper() in tokens:
        return tokens[symbol_or_addr.upper()]["address"]
    return symbol_or_addr
