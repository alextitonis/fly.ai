import { Card } from "@/components/ui-card";
import { Separator } from "@/components/ui-separator";

const BASE_SEPOLIA_SCAN = "https://sepolia.basescan.org/address";

interface ContractEntry {
  name: string;
  address: string;
  description?: string;
}

interface ContractGroup {
  title: string;
  contracts: ContractEntry[];
}

const CONTRACT_GROUPS: ContractGroup[] = [
  {
    title: "Core Tokens",
    contracts: [
      { name: "ShitToken (SHIT)", address: "0x693A67C50e9101a604E4245D91282d8823D807cd", description: "Main protocol token" },
      { name: "stSHIT", address: "0xaFE4431bDA6Fba8c2252D6975B0E8327731BB0F7", description: "Staked SHIT" },
      { name: "WstSHIT", address: "0xf9C9499133Fc945095ceb732D55Cd20528BcfEC9", description: "Wrapped staked SHIT" },
      { name: "Bucky", address: "0xA6d141B99e01C11d67e4b7E399C4Bb287c0e6e2d", description: "Protocol utility token" },
      { name: "USDC", address: "0x3595ca37596d5895b70efab592ac315d5b9809b2", description: "Testnet USDC stablecoin" },
      { name: "USDC", address: "0xb3f8cbBb5F63928ffaeA4545370ceB598f270FbE", description: "Static USDC" },
    ],
  },
  {
    title: "Kernel & Policies",
    contracts: [
      { name: "Kernel (SHIT Protocol V3)", address: "0x08357cE51c0D6D3687C83A62d8C6eCa5df4545d3", description: "Core governance kernel" },
      { name: "shitTreasuryPolicy", address: "0xd3DFdba1Bf10f6e8100542Ac2D398c8E0DeD0CaC" },
      { name: "shitPOLPolicy", address: "0x0b66544E730690095cf292d548f40cD56295311D" },
      { name: "ShitStakingPolicy", address: "0xa081d022bFFDeE898CC0Bd1Cd956BA982650E60A" },
    ],
  },
  {
    title: "Oracle & Treasury",
    contracts: [
      { name: "shitPriceFeed", address: "0x9480ED72e799Ed427Ba909717a599d9D080c0bEE" },
      { name: "shitBurner", address: "0x19064901Dea1DCe70e257Eb0EedFAc6B4fA0cd5f" },
      { name: "FeeSplitter", address: "0x3402FC67084f66aDD1E373a530DaF399c567551E" },
      { name: "FeeDecaySplitter", address: "0x13b50747B4fAd1d959a8D097722a7111fcc3A567" },
    ],
  },
  {
    title: "DEX & Bonding",
    contracts: [
      { name: "shitMarketFactory", address: "0xA3bC7155bCc11a3298A63140f22b6Fc95E721B82" },
      { name: "shitBonding", address: "0x8baF5AECBfDA5305502331361E10Ab6d1dfF474b" },
      { name: "shitInverseBond", address: "0xCf3005d6682FAD55a12e5246d2Db6f7Fb0775eB2" },
      { name: "shitPremiumSeller", address: "0x2E1e304f5193AfFAAe31cbd0968B990b08e606A7" },
    ],
  },
  {
    title: "Stablecoin & RBS",
    contracts: [
      { name: "shitPsm", address: "0xDFed52Ae8cE068933628f978A3e7477d19FaFa0d", description: "Peg Stability Module" },
      { name: "shitPegKeeper", address: "0x9866Cc41EC6C8188325Cd76750bec7905d512723" },
      { name: "RBSConfig", address: "0x569Ea433833Fcd9BAAc3190A26f5A5601F5611b9", description: "Range Stability System" },
    ],
  },
  {
    title: "Lending & Perps",
    contracts: [
      { name: "shitCoolerConfig", address: "0x747e55151BCD2BE7dc3026be8c53c9B7347c315C" },
      { name: "shitPerpConfig", address: "0x42C91CcCf286223a01e71AD9d7788fCa67967dd1" },
      { name: "shitSwapLiquidator", address: "0x069bf9eDC598C6AD05aaF0050e22385021dDD28e" },
    ],
  },
  {
    title: "Vaults & Yield",
    contracts: [
      { name: "VaultRegistry", address: "0xf1a215744b386dB3f4E6c933b86924389813cafC" },
      { name: "shitIndexVault", address: "0x20B11d97F9a44A7aE0efB6D5fBEEB6fb2e9e91df" },
      { name: "StSHITSY", address: "0xc7dF8Ce995e3b66504400725d0248d0a731DFF38" },
      { name: "YieldRouter", address: "0xa3ab590daDF7c066C09D4c2557445390f4dDa7E4" },
    ],
  },
  {
    title: "Registry & Infrastructure",
    contracts: [
      { name: "shitDeployer", address: "0x5ae2276F07FfEf0b4c314E9E8395365eE093E7E2" },
      { name: "TokenRegistry", address: "0xEe4531CE177D97EE10124AC32B6C8910eEC2117a" },
      { name: "TokenOnboardingManager", address: "0xe324dd347DC8AC1771ADFc77f119428Df553Ea57" },
      { name: "shitFolioDeployer", address: "0x55B1b057aB70fd2E059B19f1533EB6aE86230389" },
    ],
  },
];

function shortenAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function ContractsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Verified Contracts</h1>
        <p className="text-secondary-t">
          All contracts deployed on Base Sepolia (Chain ID: 84532) and verified on{" "}
          <a
            href="https://sepolia.basescan.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Basescan
          </a>
          .
        </p>
      </div>

      <Separator />

      {CONTRACT_GROUPS.map((group) => (
        <Card key={group.title} className="p-4 space-y-3">
          <div className="font-semibold text-lg">{group.title}</div>
          <div className="space-y-3">
            {group.contracts.map((contract) => (
              <div
                key={contract.address}
                className="flex items-center justify-between gap-4 py-1"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{contract.name}</p>
                  {contract.description && (
                    <p className="text-xs text-tertiary-t">{contract.description}</p>
                  )}
                </div>
                <a
                  href={`${BASE_SEPOLIA_SCAN}/${contract.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-primary hover:underline shrink-0"
                >
                  {shortenAddress(contract.address)}
                </a>
              </div>
            ))}
          </div>
        </Card>
      ))}

      <div className="text-center text-xs text-tertiary-t pt-4">
        <p>
          Deployer:{" "}
          <a
            href={`${BASE_SEPOLIA_SCAN}/0x47bB7d3048c0aB38aEb4075FB5116307d39f68F1`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline font-mono"
          >
            0x47bB...68F1
          </a>
        </p>
        <p className="mt-1">93 contracts total — all verified on Basescan</p>
      </div>
    </div>
  );
}
