import type { Address } from "viem";

export type ChainId = number;

import {
  base,
  baseSepolia,
} from "@/lib/chains";

/**
 * Registry of all known contract names.
 * Add new contracts here as the app grows.
 */
export enum ContractName {
  // Core
  SHIT = "SHIT",
  STSHIT = "STSHIT",
  WSTSHIT = "WSTSHIT",
  STAKING = "STAKING",
  BUCKY = "BUCKY",
  RIDX = "RIDX",
  SHIT_TREASURY = "SHIT_TREASURY",
  SHIT_V1_MIGRATOR = "SHIT_V1_MIGRATOR",
  STAKING_V1 = "STAKING_V1",
  WSSHIT = "WSSHIT",

  // Protocol infrastructure
  TOKEN_REGISTRY = "TOKEN_REGISTRY",
  TOKEN_ONBOARDING_MANAGER = "TOKEN_ONBOARDING_MANAGER",
  SHIT_DEPLOYER = "SHIT_DEPLOYER",
  KERNEL = "KERNEL",
  POL_POLICY = "POL_POLICY",
  SHIT_BURNER = "SHIT_BURNER",
  FEE_SPLITTER = "FEE_SPLITTER",
  FEE_DECAY_SPLITTER = "FEE_DECAY_SPLITTER",
  MARKET_FACTORY = "MARKET_FACTORY",
  SHIT_BONDING = "SHIT_BONDING",
  PREMIUM_SELLER = "PREMIUM_SELLER",
  // TEAM_VESTING removed — using Hedgey Finance frontend

  // PSM & Peg
  SHIT_PSM = "SHIT_PSM",
  PEG_KEEPER = "PEG_KEEPER",

  // Vault & RBS
  VAULT_REGISTRY = "VAULT_REGISTRY",
  RBS_CONFIG = "RBS_CONFIG",
  FOLIO_DEPLOYER = "FOLIO_DEPLOYER",

  // Adapters
  AUTOCOMPOUND_ADAPTER = "AUTOCOMPOUND_ADAPTER",
  LEVERAGE_LOOP_ADAPTER = "LEVERAGE_LOOP_ADAPTER",
  LIQUIDITY_ADAPTER = "LIQUIDITY_ADAPTER",
  CURVE_GAUGE_ADAPTER = "CURVE_GAUGE_ADAPTER",
  BALANCER_GAUGE_ADAPTER = "BALANCER_GAUGE_ADAPTER",
  BAMM_FACTORY = "BAMM_FACTORY",
  SWAP_LIQUIDATOR = "SWAP_LIQUIDATOR",
  // ST_SHIT_SY removed — using Pendle frontend
  ST_SHIT_ADAPTER = "ST_SHIT_ADAPTER",
  BRIBE_HARVEST_ADAPTER = "BRIBE_HARVEST_ADAPTER",
  AERODROME_BRIBE_ADAPTER = "AERODROME_BRIBE_ADAPTER",
  COOLER_LOAN_ADAPTER = "COOLER_LOAN_ADAPTER",
  EXTERNAL_LP_ADAPTER = "EXTERNAL_LP_ADAPTER",
  SHIT_SWAP_LP_ADAPTER = "SHIT_SWAP_LP_ADAPTER",

  // Cooler (testnet)
  COOLER_CONFIG = "COOLER_CONFIG",
  COOLER_FACTORY = "COOLER_FACTORY",
  PERP_CONFIG = "PERP_CONFIG",

  // Infrastructure
  GELATO_RESOLVER = "GELATO_RESOLVER",
  SAFE_MULTISIG = "SAFE_MULTISIG",

  // Legacy aliases (used by existing code)
  DAO_TREASURY = "SHIT_TREASURY",

  // Cooler
  COOLER_CLEARING_HOUSE_V3 = "COOLER_CLEARING_HOUSE_V3",
  COOLER_V2_MONOCOOLER = "COOLER_V2_MONOCOOLER",
  COOLER_V2_COMPOSITES = "COOLER_V2_COMPOSITES",
  COOLER_V2_MIGRATOR = "COOLER_V2_MIGRATOR",
  COOLER_CLEARING_HOUSE_V1 = "COOLER_CLEARING_HOUSE_V1",
  COOLER_CLEARING_HOUSE_V2 = "COOLER_CLEARING_HOUSE_V2",
  COOLER_FACTORY_V1 = "COOLER_FACTORY_V1",
  COOLER_FACTORY_V2 = "COOLER_FACTORY_V2",

  // Convertible Deposits
  CONVERTIBLE_DEPOSIT_FACILITY = "CONVERTIBLE_DEPOSIT_FACILITY",
  CONVERTIBLE_DEPOSIT_AUCTIONEER = "CONVERTIBLE_DEPOSIT_AUCTIONEER",
  CONVERTIBLE_DEPOSIT_POSITION_MANAGER = "CONVERTIBLE_DEPOSIT_POSITION_MANAGER",
  RECEIPT_TOKEN_MANAGER = "RECEIPT_TOKEN_MANAGER",
  DEPOSIT_REDEMPTION_VAULT = "DEPOSIT_REDEMPTION_VAULT",
  LIMIT_ORDERS = "LIMIT_ORDERS",
  PRICE = "PRICE",
  EMISSION_MANAGER = "EMISSION_MANAGER",

  // Treasury
  // (SHIT_TREASURY defined in Core section above)
  SUSDS = "SUSDS",

  // Bridge
  CROSS_CHAIN_BRIDGE = "CROSS_CHAIN_BRIDGE",
  CROSS_CHAIN_MINTER = "CROSS_CHAIN_MINTER",

  // Additional deployed contracts
  SHIT_INVERSE_BOND = "SHIT_INVERSE_BOND",
  SHIT_PRICE_FEED = "SHIT_PRICE_FEED",
  SHIT_TREASURY_POLICY = "SHIT_TREASURY_POLICY",
  UNISWAP_V2_SWAP_ADAPTER = "UNISWAP_V2_SWAP_ADAPTER",
  LIQUIDITY_MIGRATOR = "LIQUIDITY_MIGRATOR",
  SHIT_PERP_CONFIG = "SHIT_PERP_CONFIG",
  SHIT_SWAP_LIQUIDATOR = "SHIT_SWAP_LIQUIDATOR",
  SHIT_FOLIO_DEPLOYER = "SHIT_FOLIO_DEPLOYER",

  // Vote Markets
  STAKEDAO_BRIBE_ADAPTER = "STAKEDAO_BRIBE_ADAPTER",
  PALADIN_QUEST_ADAPTER = "PALADIN_QUEST_ADAPTER",
  YBRIBE_ADAPTER = "YBRIBE_ADAPTER",
  VOTIUM_ADAPTER = "VOTIUM_ADAPTER",
  HIDDEN_HAND_ADAPTER = "HIDDEN_HAND_ADAPTER",
  VOTE_MARKET_ROUTER = "VOTE_MARKET_ROUTER",

  // Liquidity & Lending
  LBP_LAUNCHER = "LBP_LAUNCHER",
  // MORPHO_MARKET_CREATOR removed — using Morpho frontend
  EXISTING_POOL_MANAGER = "EXISTING_POOL_MANAGER",

  // DEX
  AUTO_REBALANCE_HOOK = "AUTO_REBALANCE_HOOK",
  SHIT_SWAP_POOL_CREATOR = "SHIT_SWAP_POOL_CREATOR",
  SHIT_FLOOR_HOOK = "SHIT_FLOOR_HOOK",
  FEE_HOOK = "FEE_HOOK",
  LOYALTY_HOOK = "LOYALTY_HOOK",
  VOLUME_REWARDS_HOOK = "VOLUME_REWARDS_HOOK",

  // Stablecoin
  SHIT_LIQUIDATION_KEEPER = "SHIT_LIQUIDATION_KEEPER",
  IMPACT_ORACLE_ADAPTER = "IMPACT_ORACLE_ADAPTER",

  // Gas Optimization
  SINGLETON_VAULT_ADAPTER = "SINGLETON_VAULT_ADAPTER",
  SINGLETON_META_VAULT_ADAPTER = "SINGLETON_META_VAULT_ADAPTER",

  // Yield & POL
  // PENDLE_MARKET_DEPLOYER removed — using Pendle frontend
  YIELD_ROUTER = "YIELD_ROUTER",

  // Kernel Policies
  SHIT_STAKING_POLICY = "SHIT_STAKING_POLICY",

  // Stablecoin AMOs
  SHIT_LENDING_AMO = "SHIT_LENDING_AMO",
  SHIT_UNISWAP_V4_AMO = "SHIT_UNISWAP_V4_AMO",
  FIXED_RATE_PROVIDER = "FIXED_RATE_PROVIDER",

  // Perps
  SHIT_PERP_VAULT = "SHIT_PERP_VAULT",
  SHIT_FUNDING_RATE_ORACLE = "SHIT_FUNDING_RATE_ORACLE",

  // POL Manager
  SHIT_POL_MANAGER = "SHIT_POL_MANAGER",
  BASE_GAUGE_ADAPTER = "BASE_GAUGE_ADAPTER",

  // RBS
  SHIT_RBS_BOND_MARKET = "SHIT_RBS_BOND_MARKET",
  SHIT_WALL_ADJUSTER = "SHIT_WALL_ADJUSTER",
  BOND_AGGREGATOR = "BOND_AGGREGATOR",
  BOND_AUCTIONEER = "BOND_AUCTIONEER",
  BOND_TELLER = "BOND_TELLER",

  // Index & Folio
  SHIT_INDEX_ORACLE = "SHIT_INDEX_ORACLE",
  SHIT_INDEX_VAULT = "SHIT_INDEX_VAULT",
  SHIT_FOLIO_DAO_FEE_REGISTRY = "SHIT_FOLIO_DAO_FEE_REGISTRY",
  SHIT_FOLIO_VERSION_REGISTRY = "SHIT_FOLIO_VERSION_REGISTRY",

  // Meta-Vaults
  SHIT_VAULT_CURATOR = "SHIT_VAULT_CURATOR",
  SHIT_VAULT_ORACLE = "SHIT_VAULT_ORACLE",
  SHIT_WITHDRAWAL_QUEUE = "SHIT_WITHDRAWAL_QUEUE",
  SHIT_FEE_MANAGER = "SHIT_FEE_MANAGER",

  // Treasury Integration
  SHIT_TREASURY_INTEGRATION = "SHIT_TREASURY_INTEGRATION",

  // BAMM
  SHIT_BAMM = "SHIT_BAMM",
  SHIT_BAMM_HOOK = "SHIT_BAMM_HOOK",

  // Yield
  SHIT_YIELD_MARKET_HOOK = "SHIT_YIELD_MARKET_HOOK",

  // Vote Markets
  BRIBE_FORWARDER = "BRIBE_FORWARDER",

  // Deployment Infrastructure
  HOOK_DEPLOYER_FACTORY = "HOOK_DEPLOYER_FACTORY",
  LARGE_CONTRACT_DEPLOYER = "LARGE_CONTRACT_DEPLOYER",

  // Libraries (deployed, linked into FolioDeployer)
  FOLIO_LIB = "FOLIO_LIB",
  REBALANCING_LIB = "REBALANCING_LIB",

  // Referral
  REFERRAL_REGISTRY = "REFERRAL_REGISTRY",
  HEDGEY_CLAIM_CAMPAIGNS = "HEDGEY_CLAIM_CAMPAIGNS",
}

type ContractAddresses = {
  [K in ContractName]: Partial<Record<number, Address>>;
};

/**
 * Contract addresses by chain.
 * When adding a new contract, add it to the ContractName enum and this map.
 */
export const CONTRACTS: ContractAddresses = {
  // ── Core ──────────────────────────────────────────────
  [ContractName.SHIT]: {
    [base.id]: "0x0000000000000000000000000000000000000000",
    [baseSepolia.id]: "0x823d5d44F9E647402c949376E54f709Ab3a9015b",
  },
  [ContractName.STSHIT]: {
    [base.id]: "0x0000000000000000000000000000000000000000",
    [baseSepolia.id]: "0xdb3D61dEE55eF664412BcEBEd144981B2Fc11a34",
  },
  [ContractName.WSTSHIT]: {
    [base.id]: "0x0000000000000000000000000000000000000000",
    [baseSepolia.id]: "0x933E4B8e744733FAaFD67aC99eD8987C9Aa5E533",
  },
  [ContractName.STAKING]: {
    [base.id]: "0x0000000000000000000000000000000000000000",
    [baseSepolia.id]: "0x395f6Cc9aAEE56f292dBE5dcc76fF3b30637cd4e",
  },
  [ContractName.BUCKY]: {
    [base.id]: "0x0000000000000000000000000000000000000000",
    [baseSepolia.id]: "0xd8D866BB5EB8E93Da1c2f3c47Df4ab0E2665422E",
  },
  [ContractName.RIDX]: {
    [base.id]: "0x0000000000000000000000000000000000000000",
    [baseSepolia.id]: "0x1C98820e839C3A92C041312259A785B5e16Df997",
  },
  [ContractName.SHIT_TREASURY]: {
    [base.id]: "0x0000000000000000000000000000000000000000",
    [baseSepolia.id]: "0xCfd4CDBdfFC220b53D71659Baa8Ba79A18c765de",
  },
  [ContractName.SHIT_V1_MIGRATOR]: {
    [base.id]: "0x0000000000000000000000000000000000000000",
    [baseSepolia.id]: "0x9F99958FcDf4b3dDbdf17DCbFAE4d8DBdd826585",
  },
  [ContractName.STAKING_V1]: {
    [base.id]: "0x0000000000000000000000000000000000000000",
    [baseSepolia.id]: "0x75aE58d7BAE3966b37809Eb6a8BE235A8A2B355d",
  },
  [ContractName.WSSHIT]: {
    [base.id]: "0x0000000000000000000000000000000000000000",
    [baseSepolia.id]: "0x8B80896Bb0Afe797B51cE9Ad54A55658c80410c0",
  },

  // ── Cooler ────────────────────────────────────────────
  [ContractName.COOLER_CLEARING_HOUSE_V3]: {
    [base.id]: "0x1e094fE00E13Fd06D64EeA4FB3cD912893606fE0",
  },
  [ContractName.COOLER_V2_MONOCOOLER]: {
    [base.id]: "0xdb591Ea2e5Db886dA872654D58f6cc584b68e7cC",
    [baseSepolia.id]: "0x25a6ed01108C04CCb8B71e7c4f1F19a334764803",
  },
  [ContractName.COOLER_V2_COMPOSITES]: {
    [base.id]: "0x6593768feBF9C95aC857Fb7Ef244D5738D1C57Fd",
    [baseSepolia.id]: "0xa28e0432a13c403071bd3d3034116E9518bA6695",
  },
  [ContractName.COOLER_V2_MIGRATOR]: {
    [base.id]: "0xE045BD0A0d85E980AA152064C06EAe6B6aE358D2",
    [baseSepolia.id]: "0x70233D8F47042d3A5813026e2157B5181C608cD0",
  },
  [ContractName.COOLER_CLEARING_HOUSE_V1]: {
    [base.id]: "0xD6A6E8d9e82534bD65821142fcCd91ec9cF31880",
  },
  [ContractName.COOLER_CLEARING_HOUSE_V2]: {
    [base.id]: "0xE6343ad0675C9b8D3f32679ae6aDbA0766A2ab4c",
  },
  [ContractName.COOLER_FACTORY_V1]: {
    [base.id]: "0x30Ce56e80aA96EbbA1E1a74bC5c0FEB5B0dB4589",
  },
  [ContractName.COOLER_FACTORY_V2]: {
    [base.id]: "0x2916427F46d33fE2bF68Ee7D3C168CF57f109541",
  },

  // ── Convertible Deposits ──────────────────────────────
  [ContractName.CONVERTIBLE_DEPOSIT_FACILITY]: {
    [base.id]: "0xEBDe552D851DD6Dfd3D360C596D3F4aF6e5F9678",
    [baseSepolia.id]: "0x0bE69702E83f06A027E6841B614f6946d1265441",
  },
  [ContractName.CONVERTIBLE_DEPOSIT_AUCTIONEER]: {
    [base.id]: "0xF35193DA8C10e44aF10853Ba5a3a1a6F7529E39a",
    [baseSepolia.id]: "0x247f1989aDc0F63D07b91Bf645De879b9de06fbB",
  },
  [ContractName.CONVERTIBLE_DEPOSIT_POSITION_MANAGER]: {
    [base.id]: "0x02331A4c97a4841084dF54d7c0eC04DD3f1A9F1c",
    [baseSepolia.id]: "0xEF928e9ed1083636e34230543D4ad3B6270Fa986",
  },
  [ContractName.RECEIPT_TOKEN_MANAGER]: {
    [base.id]: "0xD98B5b2E4D5d6Cd554115DE19EfB7A9084BEddd1",
    [baseSepolia.id]: "0x95F6CfFFCbdaecB76f1cA335Ceda4247c45B45E4",
  },
  [ContractName.DEPOSIT_REDEMPTION_VAULT]: {
    [base.id]: "0x20a3d8510f2e1176E8Db4CeA9883a8287a9029Db",
    [baseSepolia.id]: "0x93AcaDa86ad23C85e96869D46945fA6FFb7a4036",
  },
  [ContractName.LIMIT_ORDERS]: {
    [base.id]: "0x7d8f82A0D5B67d5FDd1B77A899FF517818FaFc2e",
    [baseSepolia.id]: "0xeF64baB08c3431BbC527B063354b95D1C5b549B0",
  },
  [ContractName.PRICE]: {
    [base.id]: "0xd6C4D723fdadCf0D171eF9A2a3Bfa870675b282f",
    [baseSepolia.id]: "0x3bD25E292dC36b674BBF1EEecaAB4565bf2eF241",
  },
  [ContractName.EMISSION_MANAGER]: {
    [base.id]: "0xA61b846D5D8b757e3d541E0e4F80390E28f0B6Ff",
    [baseSepolia.id]: "0x84785E392BfD02F97A9b84F85d86DEc11933ef81",
  },

  // ── Treasury ────────────────────────────────────────
  // SHIT_TREASURY defined in Core section above
  [ContractName.SUSDS]: {
    [base.id]: "0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD",
    [baseSepolia.id]: "0x74Ca575601aa47a1aa44bD6786F3C0be36afA079",
  },

  // ── Bridge ──────────────────────────────────────────
  [ContractName.CROSS_CHAIN_BRIDGE]: {
    [base.id]: "0x0000000000000000000000000000000000000000",
  },
  [ContractName.CROSS_CHAIN_MINTER]: {
    [base.id]: "0x0000000000000000000000000000000000000000",
  },

  // ── Protocol Infrastructure (Base Sepolia) ───────────
  [ContractName.TOKEN_REGISTRY]: {
    [baseSepolia.id]: "0x7b44364f15c7EDBf4C2Af86961211869c9C83351",
  },
  [ContractName.TOKEN_ONBOARDING_MANAGER]: {
    [baseSepolia.id]: "0x598Ac0A0B5a9b7d6C2ACeB01d8A977dF639c46e2",
  },
  [ContractName.SHIT_DEPLOYER]: {
    [baseSepolia.id]: "0xdC819eE93bEAA17de63d3C48aEF1E7E2B9FF9F4D",
  },
  [ContractName.KERNEL]: {
    [baseSepolia.id]: "0x25D98fa2e827227243108Ac111F084cdfeE020be",
  },
  [ContractName.POL_POLICY]: {
    [baseSepolia.id]: "0x71E73cdcfEB5452e2ADe0f68F08d556A9F5Ea2dD",
  },
  [ContractName.SHIT_BURNER]: {
    [baseSepolia.id]: "0xE67bb42c6EDe2c40271f2d6731A0423eea66c0Ba",
  },
  [ContractName.FEE_SPLITTER]: {
    [baseSepolia.id]: "0xffB941805fbc8c5e9539e6e5012dB735674186f6",
  },
  [ContractName.FEE_DECAY_SPLITTER]: {
    [baseSepolia.id]: "0xa144fE6579d2C672fa76B2Fd4115E91D8851Edbc",
  },
  [ContractName.MARKET_FACTORY]: {
    [baseSepolia.id]: "0xB341B7ced31faEad92A261fBEf1612096D7eC38a",
  },
  [ContractName.SHIT_BONDING]: {
    [baseSepolia.id]: "0x28Fd809B13F62DD94518a13c8E009A41fce97C67",
  },
  [ContractName.PREMIUM_SELLER]: {
    [baseSepolia.id]: "0xcde21F8bA8309D039E40aBfFa5D0f593e7CF1735",
  },
  // TEAM_VESTING removed — using Hedgey Finance frontend

  // ── PSM & Peg (Base Sepolia) ──────────────────────────
  [ContractName.SHIT_PSM]: {
    [baseSepolia.id]: "0xC51e42922975934F7abC8196F3a017A2BcB48CB1",
  },
  [ContractName.PEG_KEEPER]: {
    [baseSepolia.id]: "0x0108cBB9d5e0545f17618C00bb9303F7Cfa188c7",
  },

  // ── Vault & RBS (Base Sepolia) ────────────────────────
  [ContractName.VAULT_REGISTRY]: {
    [baseSepolia.id]: "0xD1e8eF830F425894a397FD78aa934f67489BaE02",
  },
  [ContractName.RBS_CONFIG]: {
    [baseSepolia.id]: "0xE93a0F25e744CfE17581cf44Bb5d04a2847649fd",
  },
  [ContractName.FOLIO_DEPLOYER]: {
    [baseSepolia.id]: "0x55B1b057aB70fd2E059B19f1533EB6aE86230389",
  },

  // ── Adapters (Base Sepolia) ───────────────────────────
  [ContractName.AUTOCOMPOUND_ADAPTER]: {
    [baseSepolia.id]: "0xBdF2DE1A83bfe91494e9bF5635d63AE0F0aE4EDB",
  },
  [ContractName.LEVERAGE_LOOP_ADAPTER]: {
    [baseSepolia.id]: "0x64205F518E907F7CA5519AA510C8b1d4DBE0363b",
  },
  [ContractName.LIQUIDITY_ADAPTER]: {
    [baseSepolia.id]: "0x01d9e6809CB5feBc6fc8C7Edc896c2E1ad061A83",
  },
  [ContractName.CURVE_GAUGE_ADAPTER]: {
    [baseSepolia.id]: "0x13A1eb8CD4d13527a39196c8B6A3361cB87232D8",
  },
  [ContractName.BALANCER_GAUGE_ADAPTER]: {
    [baseSepolia.id]: "0xa13ec46E24E063372eDAEF1e58Db4257F482247a",
  },
  [ContractName.BAMM_FACTORY]: {
    [baseSepolia.id]: "0x4884B0e8Dd33d0aBF55318bB8e8a737816fD1026",
  },
  [ContractName.SWAP_LIQUIDATOR]: {
    [baseSepolia.id]: "0xbfdC188165c7327Af028a8546E5f719833CEdBAa",
  },
  // ST_SHIT_SY removed — using Pendle frontend
  [ContractName.ST_SHIT_ADAPTER]: {
    [baseSepolia.id]: "0x8BDf04f75C688EEAfa22Cf8385Eb4889663e21c6",
  },
  [ContractName.BRIBE_HARVEST_ADAPTER]: {
    [baseSepolia.id]: "0x72d3cE323398Da709144AA50eD1D8706EFDCFFd4",
  },
  [ContractName.AERODROME_BRIBE_ADAPTER]: {
    [baseSepolia.id]: "0x1d25390dA3546431e3BAD238c7d0189BFcc106E3",
  },
  [ContractName.COOLER_LOAN_ADAPTER]: {
    [baseSepolia.id]: "0xce6c0Bffe133108dcc1A14a32Bc3daBaFe24199b",
  },
  [ContractName.EXTERNAL_LP_ADAPTER]: {
    [baseSepolia.id]: "0xe9945DAde2d7A5d8db16efdA3f2664e5E8d53Bb2",
  },
  [ContractName.SHIT_SWAP_LP_ADAPTER]: {
    [baseSepolia.id]: "0x25A1b43f7e104AaE801C6cA93ED52FeEB1f601eA",
  },

  // ── Cooler (Base Sepolia) ─────────────────────────────
  [ContractName.COOLER_CONFIG]: {
    [baseSepolia.id]: "0xf691e5a5bA4D6DFd30E997E61ec62c424Fe64C56",
  },
  [ContractName.COOLER_FACTORY]: {
    [baseSepolia.id]: "0xe2F4675056192a8d579D0bc8df0D4DC67C3DE917",
  },
  [ContractName.PERP_CONFIG]: {
    [baseSepolia.id]: "0x1Cbf45A83948635A69A3fa7158e8470cd4b6b313",
  },

  // ── Infrastructure (Base Sepolia) ────────────────────
  [ContractName.GELATO_RESOLVER]: {
    [baseSepolia.id]: "0x4ABdADCDa6B86b5A289740111d55d6DD01Dd166F",
  },
  [ContractName.SAFE_MULTISIG]: {
    [baseSepolia.id]: "0x47bB7d3048c0aB38aEb4075FB5116307d39f68F1",
  },

  // ── Additional deployed contracts (Base Sepolia) ─────
  [ContractName.SHIT_INVERSE_BOND]: {
    [baseSepolia.id]: "0xb3657a3daCff82F0F85Ea7202830f6fB682CF02a",
  },
  [ContractName.SHIT_PRICE_FEED]: {
    [baseSepolia.id]: "0x4BABDbE7E196d85F3f6896A36DAB90aAc1156870",
  },
  [ContractName.SHIT_TREASURY_POLICY]: {
    [baseSepolia.id]: "0x71aA94734AC6a89A1Fc544D4227f57a65a027270",
  },
  [ContractName.UNISWAP_V2_SWAP_ADAPTER]: {
    [baseSepolia.id]: "0xebBEB03a96B7993e49421c0a556dcbe4f3898aBE",
  },
  [ContractName.LIQUIDITY_MIGRATOR]: {
    [baseSepolia.id]: "0x7b56FA930103e42e7034d396f4eC8107814E27f4",
  },
  [ContractName.SHIT_PERP_CONFIG]: {
    [baseSepolia.id]: "0x1Cbf45A83948635A69A3fa7158e8470cd4b6b313",
  },
  [ContractName.SHIT_SWAP_LIQUIDATOR]: {
    [baseSepolia.id]: "0xbfdC188165c7327Af028a8546E5f719833CEdBAa",
  },
  [ContractName.SHIT_FOLIO_DEPLOYER]: {
    [baseSepolia.id]: "0x55B1b057aB70fd2E059B19f1533EB6aE86230389",
  },

  // ── Vote Markets (Base Sepolia — to be deployed) ─────
  [ContractName.STAKEDAO_BRIBE_ADAPTER]: {
    [baseSepolia.id]: "0xA26Fb68db77aD91E552467F08AC3971d23eB1f07",
  },
  [ContractName.PALADIN_QUEST_ADAPTER]: {
    [baseSepolia.id]: "0x95f76d54d13f679832f7D2EE11B739C1e82bc4d2",
  },
  [ContractName.YBRIBE_ADAPTER]: {
    [baseSepolia.id]: "0x01B56D9294A4e53C8F644Fc5A178a5Ce89471652",
  },
  [ContractName.VOTIUM_ADAPTER]: {
    [baseSepolia.id]: "0x701612DCe134fb790C6D7C32a5573145f0A5f02E",
  },
  [ContractName.HIDDEN_HAND_ADAPTER]: {
    [baseSepolia.id]: "0xEc197992700399D9a1C21900A4F81377327c9623",
  },
  [ContractName.VOTE_MARKET_ROUTER]: {
    [baseSepolia.id]: "0xBB26c057A5F00319047c982081694B5c35Cf5d99",
  },

  // ── Liquidity & Lending (Base Sepolia — to be deployed)
  [ContractName.LBP_LAUNCHER]: {
    [baseSepolia.id]: "0xA20C89e664F12c806C56d2c8eB6eCdA2c84C68B2",
  },
  // MORPHO_MARKET_CREATOR removed — using Morpho frontend
  [ContractName.EXISTING_POOL_MANAGER]: {
    [baseSepolia.id]: "0x096227a6ACA34dF9dCe304687522bC59f4c9344a",
  },

  // ── DEX (Base Sepolia) ──────────────────────────────
  [ContractName.AUTO_REBALANCE_HOOK]: {
    [baseSepolia.id]: "0x24267c53644f54D7BFd7091DcC9926D197473079",
  },
  [ContractName.SHIT_SWAP_POOL_CREATOR]: {
    [baseSepolia.id]: "0xC2391F104634d92eD410016932B7F1b92A27AAcc",
  },
  [ContractName.SHIT_FLOOR_HOOK]: {
    [baseSepolia.id]: "0x85A67d957511caD925124C2ccd83e033fb938050",
  },
  [ContractName.FEE_HOOK]: {
    [baseSepolia.id]: "0x9d71A4AD89922686D2843D96dF4450e05D285080",
  },
  [ContractName.LOYALTY_HOOK]: {
    [baseSepolia.id]: "0xA25B7c507Cd7c4D8172BC2C38E16e15fECB00600",
  },
  [ContractName.VOLUME_REWARDS_HOOK]: {
    [baseSepolia.id]: "0x61cbd9D030840a9AE8aAA5ae80Cc6dD9FD750040",
  },

  // ── Stablecoin (Base Sepolia — to be deployed) ───────
  [ContractName.SHIT_LIQUIDATION_KEEPER]: {
    [baseSepolia.id]: "0xCB105FB02599ef65DAB5E433c4ecf26961725BA0",
  },
  [ContractName.IMPACT_ORACLE_ADAPTER]: {
    [baseSepolia.id]: "0x32e737da86698B4E344b871ff6351FE08eA0e00B",
  },

  // ── Gas Optimization (Base Sepolia — to be deployed) ─
  [ContractName.SINGLETON_VAULT_ADAPTER]: {
    [baseSepolia.id]: "0x47F73DfB700adcC9EF62fb1B4773089b012A0D42",
  },
  [ContractName.SINGLETON_META_VAULT_ADAPTER]: {
    [baseSepolia.id]: "0x9CDEf7b060F99fd223953167d36963fD607d0131",
  },

  // ── Yield & POL (Base Sepolia — to be deployed) ──────
  // PENDLE_MARKET_DEPLOYER removed — using Pendle frontend
  [ContractName.YIELD_ROUTER]: {
    [baseSepolia.id]: "0x8d84E5B950b18AaDf52Ce893d9eF5be450A8DF3f",
  },

  // ── Kernel Policies (Base Sepolia) ───────────────────
  [ContractName.SHIT_STAKING_POLICY]: {
    [baseSepolia.id]: "0x05271DFaBe4b43893318841EabeC3Dee0c78aC16",
  },

  // ── Stablecoin AMOs (Base Sepolia) ───────────────────
  [ContractName.SHIT_LENDING_AMO]: {
    [baseSepolia.id]: "0xb8860FB60Cd0eb4f91cc3a8E931ffe98Cb769964",
  },
  [ContractName.SHIT_UNISWAP_V4_AMO]: {
    [baseSepolia.id]: "0xB620BCA75EC539977bBaa61717b13e57D66A3529",
  },
  [ContractName.FIXED_RATE_PROVIDER]: {
    [baseSepolia.id]: "0x9b6141EC6271bf04b1901aba8151e039565735C1",
  },

  // ── Perps (Base Sepolia) ─────────────────────────────
  [ContractName.SHIT_PERP_VAULT]: {
    [baseSepolia.id]: "0x6D3E277bD1387c88BBE3B7ca3F4D5FDd64911167",
  },
  [ContractName.SHIT_FUNDING_RATE_ORACLE]: {
    [baseSepolia.id]: "0x20F72f11CBB4297e17DC67d270F15C1A2E0f6F0C",
  },

  // ── POL Manager (Base Sepolia) ────────────────────────
  [ContractName.SHIT_POL_MANAGER]: {
    [baseSepolia.id]: "0x25DDe6b01A890eB7ee8D14770311d2C6Ab79d9Ce",
  },
  [ContractName.BASE_GAUGE_ADAPTER]: {
    [baseSepolia.id]: "0x6b8ff146E75906502A48edD632930b83fbf0c4D9",
  },

  // ── RBS (Base Sepolia) ────────────────────────────────
  [ContractName.SHIT_RBS_BOND_MARKET]: {
    [baseSepolia.id]: "0x8645D396261CFad2628dA2de2Bb31A817c8A57bb",
  },
  [ContractName.SHIT_WALL_ADJUSTER]: {
    [baseSepolia.id]: "0x7B7a432Be29CF6B68843980fDd7Fe85F7009995b",
  },
  [ContractName.BOND_AGGREGATOR]: {
    [baseSepolia.id]: "0x4843af094c6AF7316C37D73ea6F2D73eD298bC7B",
  },
  [ContractName.BOND_AUCTIONEER]: {
    [baseSepolia.id]: "0x2baa439C3d29B6B7fE6df60Fdf0840AdEf77fF0a",
  },
  [ContractName.BOND_TELLER]: {
    [baseSepolia.id]: "0xf4816c51221Cb49BdF24a30e69a1fa26B0cE0703",
  },

  // ── Index & Folio (Base Sepolia) ──────────────────────
  [ContractName.SHIT_INDEX_ORACLE]: {
    [baseSepolia.id]: "0x851B78c3FEC77c2Cb538a0e0F52D37B84C790393",
  },
  [ContractName.SHIT_INDEX_VAULT]: {
    [baseSepolia.id]: "0xa4a8dC5Fc9CFD610BE581a98E026a6930160A221",
  },
  [ContractName.SHIT_FOLIO_DAO_FEE_REGISTRY]: {
    [baseSepolia.id]: "0x3240Bde22EF6d749b4Cdb189cBd1Ace3b5328009",
  },
  [ContractName.SHIT_FOLIO_VERSION_REGISTRY]: {
    [baseSepolia.id]: "0xC7dDFA577F4C45021F87d8693548dcf1B63a1e56",
  },

  // ── Meta-Vaults (Base Sepolia) ────────────────────────
  [ContractName.SHIT_VAULT_CURATOR]: {
    [baseSepolia.id]: "0x83dAb2E80a1555813aC2F56A15898d18368D29E3",
  },
  [ContractName.SHIT_VAULT_ORACLE]: {
    [baseSepolia.id]: "0x27De9D8F60A177F74c57a05f339445eC16AAEc26",
  },
  [ContractName.SHIT_WITHDRAWAL_QUEUE]: {
    [baseSepolia.id]: "0x02324B143Fb33f63fEaBC85bB226229cA1E2eA44",
  },
  [ContractName.SHIT_FEE_MANAGER]: {
    [baseSepolia.id]: "0x6438A06fe8D57713DbCC610Cb19Ec3e06A7CE866",
  },

  // ── Treasury Integration (Base Sepolia) ───────────────
  [ContractName.SHIT_TREASURY_INTEGRATION]: {
    [baseSepolia.id]: "0xd258D39f77d529EeD44D188457877dd71b46E658",
  },

  // ── BAMM (Base Sepolia) ───────────────────────────────
  [ContractName.SHIT_BAMM]: {
    [baseSepolia.id]: "0x3317746f71c9c103b114f02be273f8beddd442a1",
  },
  [ContractName.SHIT_BAMM_HOOK]: {
    [baseSepolia.id]: "0x9C62C7f660427424D2ca5201b05556838f4a9f5c",
  },

  // ── Yield (Base Sepolia) ──────────────────────────────
  [ContractName.SHIT_YIELD_MARKET_HOOK]: {
    [baseSepolia.id]: "0xc38c0d905bb4010d115105a53550c4f3154f0080",
  },

  // ── Vote Markets (Base Sepolia) ───────────────────────
  [ContractName.BRIBE_FORWARDER]: {
    [baseSepolia.id]: "0xEc876940aE09356D9eA285473973d7c8199C5c47",
  },

  // ── Deployment Infrastructure (Base Sepolia) ──────────
  [ContractName.HOOK_DEPLOYER_FACTORY]: {
    [baseSepolia.id]: "0x0619d9443B24CE9a66CcEa854Ca19072eF8a6a56",
  },
  [ContractName.LARGE_CONTRACT_DEPLOYER]: {
    [baseSepolia.id]: "0xe945C8F8893c0248ABAD857C05671db1319e52c5",
  },

  // ── Libraries (Base Sepolia) ──────────────────────────
  [ContractName.FOLIO_LIB]: {
    [baseSepolia.id]: "0xeA87D832105e69D7Dd22eeCdbb0c156bc5D140AF",
  },
  [ContractName.REBALANCING_LIB]: {
    [baseSepolia.id]: "0x027946483DE419FF8015FED0CCc53F467f31F47b",
  },

  // ── Referral (Base Sepolia) ──────────────────────────
  [ContractName.REFERRAL_REGISTRY]: {
    [baseSepolia.id]: "0x646C549764f9A90aE55e3c58417b16246FFE6554",
  },
  [ContractName.HEDGEY_CLAIM_CAMPAIGNS]: {
    [baseSepolia.id]: "0x8A2725a6f04816A5274dDD9FEaDd3bd0C253C1A6",
  },
};

/**
 * Look up a contract address on a specific chain.
 */
export function getContractAddress(
  contractName: ContractName,
  chainId: number,
): Address | undefined {
  return CONTRACTS[contractName][chainId];
}

/**
 * Look up a contract address, throwing if not found.
 */
export function requireContractAddress(contractName: ContractName, chainId: number): Address {
  const address = getContractAddress(contractName, chainId);
  if (!address) {
    throw new Error(`Contract ${contractName} not deployed on chain ${chainId}`);
  }
  return address;
}
