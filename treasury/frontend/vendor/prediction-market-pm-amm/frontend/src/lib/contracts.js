// Router ABI - Only the functions we need
export const RouterABI = [
    // Events
    {
        type: 'event',
        name: 'MarketCreated',
        inputs: [
            { name: 'marketId', type: 'bytes32', indexed: true },
            { name: 'market', type: 'address', indexed: true },
            { name: 'creator', type: 'address', indexed: true },
            { name: 'title', type: 'string', indexed: false },
            { name: 'description', type: 'string', indexed: false },
            { name: 'resolutionSource', type: 'string', indexed: false },
            { name: 'deadline', type: 'uint256', indexed: false },
            { name: 'liquidity', type: 'uint256', indexed: false },
        ],
    },
    // Read Functions
    {
        type: 'function',
        name: 'getMarketCount',
        inputs: [],
        outputs: [{ type: 'uint256' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'getMarketAtIndex',
        inputs: [{ name: 'index', type: 'uint256' }],
        outputs: [
            { name: 'market', type: 'address' },
            { name: 'marketId', type: 'bytes32' },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'getAllMarkets',
        inputs: [],
        outputs: [{ type: 'address[]' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'getMarketMetadata',
        inputs: [{ name: 'marketId', type: 'bytes32' }],
        outputs: [
            { name: 'market', type: 'address' },
            { name: 'liquidity', type: 'uint256' },
            { name: 'title', type: 'string' },
            { name: 'description', type: 'string' },
            { name: 'resolutionSource', type: 'string' },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'mUSD',
        inputs: [],
        outputs: [{ type: 'address' }],
        stateMutability: 'view',
    },
    // Write Functions
    {
        type: 'function',
        name: 'create',
        inputs: [
            { name: 'title', type: 'string' },
            { name: 'description', type: 'string' },
            { name: 'resolutionSource', type: 'string' },
            { name: 'isDynamic', type: 'bool' },
            { name: 'duration', type: 'uint256' },
            { name: 'collateralIn', type: 'uint256' },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'buyYes',
        inputs: [
            { name: 'market', type: 'address' },
            { name: 'collateralIn', type: 'uint256' },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'buyNo',
        inputs: [
            { name: 'market', type: 'address' },
            { name: 'collateralIn', type: 'uint256' },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'sellYes',
        inputs: [
            { name: 'market', type: 'address' },
            { name: 'tokenIn', type: 'uint256' },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'sellNo',
        inputs: [
            { name: 'market', type: 'address' },
            { name: 'tokenIn', type: 'uint256' },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'redeem',
        inputs: [
            { name: 'market', type: 'address' },
            { name: 'amountYes', type: 'uint256' },
            { name: 'amountNo', type: 'uint256' },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
]

// LvrMarket ABI
export const LvrMarketABI = [
    // Events
    {
        type: 'event',
        name: 'PriceSnapshot',
        inputs: [
            { name: 'timestamp', type: 'uint256', indexed: true },
            { name: 'priceYes', type: 'uint256', indexed: false },
            { name: 'priceNo', type: 'uint256', indexed: false },
            { name: 'reserveYes', type: 'uint256', indexed: false },
            { name: 'reserveNo', type: 'uint256', indexed: false },
        ],
    },
    {
        type: 'event',
        name: 'MarketBuy',
        inputs: [
            { name: 'buyer', type: 'address', indexed: true },
            { name: 'isBuyYes', type: 'bool', indexed: false },
            { name: 'amountIn', type: 'uint256', indexed: false },
            { name: 'amountOut', type: 'uint256', indexed: false },
        ],
    },
    {
        type: 'event',
        name: 'MarketSell',
        inputs: [
            { name: 'seller', type: 'address', indexed: true },
            { name: 'isSellYes', type: 'bool', indexed: false },
            { name: 'amountIn', type: 'uint256', indexed: false },
            { name: 'amountOut', type: 'uint256', indexed: false },
        ],
    },
    // Read Functions
    {
        type: 'function',
        name: 'getMarketDetails',
        inputs: [],
        outputs: [
            { name: 'currentState', type: 'uint8' },
            { name: 'marketDeadline', type: 'uint256' },
            { name: 'marketOutcome', type: 'uint256' },
            { name: 'marketLiquidity', type: 'uint256' },
            { name: 'reserveYes', type: 'uint256' },
            { name: 'reserveNo', type: 'uint256' },
            { name: 'priceYes', type: 'uint256' },
            { name: 'priceNo', type: 'uint256' },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'getPriceYes',
        inputs: [],
        outputs: [{ type: 'uint256' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'getPriceNo',
        inputs: [],
        outputs: [{ type: 'uint256' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'getToken',
        inputs: [{ name: 'tokenYes', type: 'bool' }],
        outputs: [{ type: 'address' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'state',
        inputs: [],
        outputs: [{ type: 'uint8' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'yesToken',
        inputs: [],
        outputs: [{ type: 'address' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'noToken',
        inputs: [],
        outputs: [{ type: 'address' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'i_collateral',
        inputs: [],
        outputs: [{ type: 'address' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'i_admin',
        inputs: [],
        outputs: [{ type: 'address' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'adminResolve',
        inputs: [{ name: '_outcome', type: 'uint256' }],
        outputs: [],
        stateMutability: 'nonpayable',
    },
]

// MockUSD / ERC20 ABI
export const ERC20ABI = [
    {
        type: 'function',
        name: 'balanceOf',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ type: 'uint256' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'allowance',
        inputs: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
        ],
        outputs: [{ type: 'uint256' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'approve',
        inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ type: 'bool' }],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'symbol',
        inputs: [],
        outputs: [{ type: 'string' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'decimals',
        inputs: [],
        outputs: [{ type: 'uint8' }],
        stateMutability: 'view',
    },
]

// MockUSD specific - includes mint
export const MockUSDABI = [
    ...ERC20ABI,
    {
        type: 'function',
        name: 'mint',
        inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
]

// Market state enum mapping
export const MARKET_STATES = {
    0: 'OPEN',
    1: 'CLOSED',
    2: 'PENDING',
    3: 'DISPUTED',
    4: 'RESOLVED',
}
