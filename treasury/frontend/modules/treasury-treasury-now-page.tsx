import { useMemo } from "react";
import { useChainId } from "wagmi";
import { useReadContracts } from "wagmi";
import { erc20Abi } from "viem";
import { Card } from "@/components/ui-card";
import { Button } from "@/components/ui-button";
import { NumberFlow } from "@/components/ui-number-flow";
import { ContractName, getContractAddress } from "@/lib/contracts";
import { TokenName, TOKENS } from "@/lib/tokens";
import { baseSepolia } from "@/lib/chains";
import {
  TreasuryMetricsWidget,
  PriceFeedWidget,
  POLManagementWidget,
} from "@/modules/protocol-widget-contract-widgets";
import { RBSPage } from "@/modules/rbs-rbs-page";
import { UnifiedDashboardPage } from "@/modules/protocol-unified-dashboard-page";
import { useScrollReveal, SectionWrapper, SectionHead } from "@/modules/shared-sections";

const TREASURY_ASSETS = [
  {
    symbol: "SHIT",
    name: "SHIT token",
    token: TokenName.SHIT,
    type: "Protocol",
    haircut: "0%",
    verification: "ERC-20 balance at the SHIT token contract",
    yield: "n/a in treasury",
  },
  {
    symbol: "stSHIT",
    name: "Staked SHIT",
    token: TokenName.STSHIT,
    type: "Protocol",
    haircut: "0%",
    verification: "ERC-1155/ERC-20 balance at ShitStaking",
    yield: "Auto-compounding rebase (from treasury revenue)",
  },
  {
    symbol: "wstSHIT",
    name: "Wrapped stSHIT",
    token: TokenName.WSTSHIT,
    type: "Protocol",
    haircut: "0%",
    verification: "Non-rebasing wrapper balance",
    yield: "Accrues to the wrapped share price",
  },
  {
    symbol: "Bucky",
    name: "Bucky stablecoin",
    token: TokenName.BUCKY,
    type: "Stablecoin",
    haircut: "0%",
    verification: "DSS Vat/Spotter/ilk, overcollateralized minting",
    yield: "Lending AMO + Uniswap V4 AMO",
  },
  {
    symbol: "RIDX",
    name: "RIDX index token",
    token: TokenName.RIDX,
    type: "Protocol",
    haircut: "0%",
    verification: "Index vault token",
    yield: "Index component yield (to be configured)",
  },
  {
    symbol: "USDC",
    name: "Aave-backed USDC",
    token: TokenName.USDC,
    type: "Reserve",
    haircut: "0%",
    verification: "StablecoinPriceFeed (fixed $1) + ERC-20 balance",
    yield: "Aave sUSDS/aUSDC deposit yield",
  },
  {
    symbol: "sUSDS",
    name: "Sky savings USDS",
    token: TokenName.USDS,
    type: "Reserve",
    haircut: "0%",
    verification: "ERC-20 balance; savings rate accrues in the token",
    yield: "Sky sUSDS savings rate",
  },
];

const IMPACT_TOKEN_SLOTS = [
  {
    symbol: "SLR",
    name: "Solarcoin",
    address: "0x7aa7cb583084defc43cc0c2e95213ce364a8df9c",
    source: "PSM collateral deposit or standard bond",
    verification: "TokenRegistry whitelist + ImpactOracleAdapter V3 TWAP",
    haircut: "50%",
    yield: "PSM minting fees; Bucky AMO yield when deployed",
  },
  {
    symbol: "TGN",
    name: "Treegens",
    address: "0xD75dfa972C6136f1c1c594Fec1945302f885E1ab29",
    source: "PSM collateral deposit or standard bond",
    verification: "TokenRegistry whitelist + ImpactOracleAdapter V3 TWAP",
    haircut: "50%",
    yield: "PSM minting fees; Bucky AMO yield when deployed",
  },
  {
    symbol: "REGEN",
    name: "Regen",
    address: "0x2E6C05f1f7D1f4Eb9A088bf12257f1647682b754",
    source: "PSM collateral deposit or standard bond",
    verification: "TokenRegistry whitelist + ImpactOracleAdapter V3 TWAP",
    haircut: "50%",
    yield: "PSM minting fees; Bucky AMO yield when deployed",
  },
  {
    symbol: "DOVU",
    name: "DOVU",
    address: "0xB38266e0e9D9681b77aEB0A280E98131b953F865",
    source: "PSM collateral deposit or standard bond",
    verification: "TokenRegistry whitelist + ImpactOracleAdapter V3 TWAP",
    haircut: "50%",
    yield: "PSM minting fees; Bucky AMO yield when deployed",
  },
  {
    symbol: "KVCM",
    name: "Klima Protocol",
    address: "0x00fBAC94Fec8D4089d3fe979F39454F48c71A65d",
    source: "PSM collateral deposit or standard bond",
    verification: "TokenRegistry whitelist + ImpactOracleAdapter V3 TWAP",
    haircut: "50%",
    yield: "PSM minting fees; Bucky AMO yield when deployed",
  },
  {
    symbol: "CEN",
    name: "Crypto Endowment Network",
    address: "0xcfe6235d98b99204ed4611297af45caa0871cad3",
    source: "PSM collateral deposit or standard bond",
    verification: "TokenRegistry whitelist + ImpactOracleAdapter V3 TWAP",
    haircut: "50%",
    yield: "PSM minting fees; Bucky AMO yield when deployed",
  },
];

export function TreasuryNowPage() {
  useScrollReveal();
  const chainId = useChainId();
  const treasuryAddress = getContractAddress(ContractName.SHIT_TREASURY, chainId);
  const treasuryPolicy = getContractAddress(ContractName.SHIT_TREASURY_POLICY, chainId);
  const tokenRegistry = getContractAddress(ContractName.TOKEN_REGISTRY, chainId);
  const onboarding = getContractAddress(ContractName.TOKEN_ONBOARDING_MANAGER, chainId);
  const impactOracle = getContractAddress(ContractName.IMPACT_ORACLE_ADAPTER, chainId);

  const isTestnet = chainId === baseSepolia.id;
  const canQuery = !!treasuryAddress && treasuryAddress !== "0x0000000000000000000000000000000000000000";

  const balanceCalls = useMemo(
    () =>
      TREASURY_ASSETS.map((asset) => ({
        address: TOKENS[asset.token].addresses[baseSepolia.id] as `0x${string}` | undefined,
        abi: erc20Abi,
        functionName: "balanceOf" as const,
        args: [treasuryAddress ?? "0x0"] as [string],
        chainId: baseSepolia.id,
      })),
    [treasuryAddress],
  );

  const { data, isLoading, isError } = useReadContracts({
    contracts: balanceCalls,
    query: { enabled: canQuery && isTestnet },
  });

  const rows = TREASURY_ASSETS.map((asset, i) => {
    const decimals = TOKENS[asset.token].decimals;
    const raw = data?.[i]?.result as bigint | undefined;
    const address = TOKENS[asset.token].addresses[baseSepolia.id];
    return { ...asset, raw, address, decimals };
  });

  const basescanUrl = isTestnet
    ? `https://sepolia.basescan.org/address/${treasuryAddress}`
    : undefined;

  return (
    <div className="min-h-screen container mx-auto max-w-5xl px-4 py-12">
      <div className="mb-10">
        <span className="font-mono text-sm uppercase tracking-wider text-yellow mb-2 block">
          Live on Base Sepolia testnet
        </span>
        <h1 className="font-serif text-4xl md:text-5xl mb-3 text-primary-t">
          Treasury — what&apos;s actually in it right now
        </h1>
        <p className="text-secondary-t text-lg max-w-3xl">
          No marketing numbers. This page reads the treasury address directly from Base Sepolia.
          If the balance is zero, the balance is zero.
        </p>
      </div>

      <SectionWrapper id="treasury" className="py-16 border-t border-a10-b">
        <SectionHead
          kicker="On-chain state"
          title="Treasury & price"
          subtitle="Live valuations from the ShitTreasuryPolicy and price feed contracts. Anyone can trigger valuation updates."
        />
        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <TreasuryMetricsWidget />
          <PriceFeedWidget />
        </div>
      </SectionWrapper>

      <Card className="p-6 mb-10 border-l-4 border-l-yellow bg-yellow/5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="font-serif text-xl mb-1 text-primary-t">Treasury address</h2>
            <p className="font-mono text-sm text-secondary-t break-all">{treasuryAddress ?? "Not deployed"}</p>
          </div>
          {basescanUrl ? (
            <a href={basescanUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="tertiary" size="sm">
                View on Basescan
              </Button>
            </a>
          ) : (
            <span className="text-sm text-tertiary-t">Mainnet treasury not yet deployed</span>
          )}
        </div>
        <div className="mt-4 text-sm text-secondary-t space-y-1">
          <p>
            <strong className="text-primary-t">Network:</strong>{" "}
            {isTestnet ? "Base Sepolia testnet" : "Base mainnet (no treasury contract deployed yet)"}
          </p>
          <p>
            <strong className="text-primary-t">Policy:</strong>{" "}
            <span className="font-mono break-all">{treasuryPolicy ?? "Not deployed"}</span>
          </p>
          <p>
            <strong className="text-primary-t">What this means:</strong> You are looking at a testnet deployment.
            Mainnet is not live. Real assets are not in the treasury yet. Everything you see can be verified on-chain.
          </p>
        </div>
      </Card>

      <div className="mb-10">
        <h2 className="font-serif text-2xl mb-4 text-primary-t">Live balances (testnet)</h2>
        {isError && (
          <Card className="p-6 mb-4 border-l-4 border-l-red">
            <p className="text-secondary-t">
              Could not fetch live balances. The testnet RPC may be unavailable. The addresses above still let you verify directly on Basescan.
            </p>
          </Card>
        )}
        {isLoading && !isError && (
          <div className="grid gap-2 animate-pulse">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 bg-surface-a5 rounded-lg" />
            ))}
          </div>
        )}
        <div className="overflow-x-auto rounded-2xl border border-a10-b">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-surface-a5 text-left">
                <th className="p-3 border-b border-a10-b text-primary-t">Asset</th>
                <th className="p-3 border-b border-a10-b text-primary-t">Balance</th>
                <th className="p-3 border-b border-a10-b text-primary-t">Contract</th>
                <th className="p-3 border-b border-a10-b text-primary-t">Haircut</th>
                <th className="p-3 border-b border-a10-b text-primary-t">Yield source</th>
              </tr>
            </thead>
            <tbody className="text-secondary-t">
              {rows.map((row) => (
                <tr key={row.symbol} className="border-b border-a10-b last:border-b-0">
                  <td className="p-3 align-top">
                    <div className="font-semibold text-primary-t">{row.name}</div>
                    <div className="font-mono text-xs text-tertiary-t">{row.symbol}</div>
                  </td>
                  <td className="p-3 align-top">
                    {row.raw !== undefined ? (
                      <NumberFlow
                        value={Number(row.raw) / 10 ** row.decimals}
                        format={{ maximumFractionDigits: 6, minimumFractionDigits: 0 }}
                      />
                    ) : (
                      <span>--</span>
                    )}
                  </td>
                  <td className="p-3 align-top">
                    {row.address ? (
                      <a
                        href={`https://sepolia.basescan.org/token/${row.address}?a=${treasuryAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-green underline"
                      >
                        {row.address.slice(0, 8)}...{row.address.slice(-6)}
                      </a>
                    ) : (
                      "Not on this chain"
                    )}
                  </td>
                  <td className="p-3 align-top">{row.haircut}</td>
                  <td className="p-3 align-top text-tertiary-t">{row.yield}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <SectionWrapper id="acquisition" className="py-16 border-t border-a10-b">
        <SectionHead
          kicker="How backing is built"
          title="Initial asset acquisition"
          subtitle="The treasury is not pre-filled. It is built up in public through the protocol's own market mechanisms, and every asset is verified before it counts toward RFV."
        />
        <div className="grid md:grid-cols-2 gap-4" data-reveal>
          <Card className="p-6">
            <h3 className="font-serif text-xl mb-2 text-primary-t">Initial reserve targets</h3>
            <p className="text-secondary-t text-sm mb-4">
              Each asset class has a defined source and an on-chain verification path.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse border border-a10-b">
                <thead>
                  <tr className="bg-surface-a5 text-left">
                    <th className="p-2 border border-a10-b text-primary-t">Asset</th>
                    <th className="p-2 border border-a10-b text-primary-t">Source</th>
                    <th className="p-2 border border-a10-b text-primary-t">Verification</th>
                  </tr>
                </thead>
                <tbody className="text-secondary-t">
                  <tr>
                    <td className="p-2 border border-a10-b">USDC / USDC stable reserves</td>
                    <td className="p-2 border border-a10-b">LBP proceeds, bond deposits, direct reserves</td>
                    <td className="p-2 border border-a10-b">On-chain balances; StablecoinPriceFeed</td>
                  </tr>
                  <tr>
                    <td className="p-2 border border-a10-b">Impact tokens (Solarcoin, Treegens, Regen, DOVU, KVCM, CEN)</td>
                    <td className="p-2 border border-a10-b">PSM collateral, standard bonds, partner onboarding</td>
                    <td className="p-2 border border-a10-b">TokenRegistry + ImpactOracleAdapter TWAP + timelock</td>
                  </tr>
                  <tr>
                    <td className="p-2 border border-a10-b">Protocol-owned liquidity</td>
                    <td className="p-2 border border-a10-b">LBP seeding, treasury LP seeding, RBS operations</td>
                    <td className="p-2 border border-a10-b">LP token balances; YieldRouter harvests</td>
                  </tr>
                  <tr>
                    <td className="p-2 border border-a10-b">Bucky minted against impact collateral</td>
                    <td className="p-2 border border-a10-b">ShitPsm overcollateralized minting</td>
                    <td className="p-2 border border-a10-b">Collateral ratio, oracle price, DSS liquidation</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
          <Card className="p-6">
            <h3 className="font-serif text-xl mb-2 text-primary-t">Phased acquisition flow</h3>
            <p className="text-secondary-t text-sm mb-4">
              The treasury grows through transparent, market-based stages:
            </p>
            <ol className="list-decimal list-inside space-y-2 text-secondary-t text-sm">
              <li>
                <strong className="text-primary-t">Phase 0 — LBP / Launch:</strong> Raise USDC and seed SHIT liquidity, depositing initial reserves.
              </li>
              <li>
                <strong className="text-primary-t">Phase 1 — Bond markets:</strong> Accept USDC or approved climate impact assets for discounted, vested SHIT.
              </li>
              <li>
                <strong className="text-primary-t">Phase 2 — Impact onboarding:</strong> New impact tokens clear a 2-day timelock and TokenRegistry whitelist before becoming collateral.
              </li>
              <li>
                <strong className="text-primary-t">Phase 3 — POL deployment:</strong> Treasury LP is deployed across Uniswap V4, Curve, and Balancer; gauge rewards are harvested.
              </li>
              <li>
                <strong className="text-primary-t">Phase 4 — Bucky & AMOs:</strong> PSM mints Bucky against impact collateral and deploys it productively via AMOs.
              </li>
            </ol>
          </Card>
        </div>
      </SectionWrapper>

      <SectionWrapper id="markets" className="py-16 border-t border-a10-b">
        <SectionHead
          kicker="Put your SHIT to work"
          title="Treasury operations"
          subtitle="The treasury manages its own liquidity and keeps price within a range automatically."
        />
        <div className="mb-12" data-reveal>
          <h3 className="font-serif text-xl mb-4">Range stability</h3>
          <RBSPage />
        </div>
        <div data-reveal>
          <h3 className="font-serif text-xl mb-4">Protocol-owned liquidity</h3>
          <POLManagementWidget />
        </div>
      </SectionWrapper>

      <SectionWrapper id="dashboards" className="py-16 border-t border-a10-b">
        <SectionHead
          kicker="Protocol analytics"
          title="Dashboards"
          subtitle="Meta-vault allocations, revenue breakdown, and Net Asset Value safety monitors for the treasury."
        />
        <div data-reveal>
          <UnifiedDashboardPage />
        </div>
      </SectionWrapper>

      <div className="mb-10">
        <h2 className="font-serif text-2xl mb-4 text-primary-t">Impact tokens the treasury can accept</h2>
        <p className="text-secondary-t mb-4">
          These are not necessarily in the treasury yet. They are the first whitelisted climate impact asset classes. Each one only counts toward RFV after passing the onboarding pipeline.
        </p>
        <div className="overflow-x-auto rounded-2xl border border-a10-b">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-surface-a5 text-left">
                <th className="p-3 border-b border-a10-b text-primary-t">Asset</th>
                <th className="p-3 border-b border-a10-b text-primary-t">Address</th>
                <th className="p-3 border-b border-a10-b text-primary-t">Source</th>
                <th className="p-3 border-b border-a10-b text-primary-t">Haircut</th>
                <th className="p-3 border-b border-a10-b text-primary-t">Verification</th>
              </tr>
            </thead>
            <tbody className="text-secondary-t">
              {IMPACT_TOKEN_SLOTS.map((token) => (
                <tr key={token.symbol} className="border-b border-a10-b last:border-b-0">
                  <td className="p-3 align-top">
                    <div className="font-semibold text-primary-t">{token.name}</div>
                    <div className="font-mono text-xs text-tertiary-t">{token.symbol}</div>
                  </td>
                  <td className="p-3 align-top">
                    <span className="font-mono text-xs text-tertiary-t">{token.address}</span>
                  </td>
                  <td className="p-3 align-top">{token.source}</td>
                  <td className="p-3 align-top">{token.haircut}</td>
                  <td className="p-3 align-top text-tertiary-t">{token.verification}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-10">
        <Card className="p-6">
          <h3 className="font-serif text-xl mb-2 text-primary-t">How assets are verified</h3>
          <p className="text-secondary-t mb-3">
            Onboarding happens on-chain. No off-chain spreadsheet counts as backing.
          </p>
          <ol className="list-decimal list-inside space-y-2 text-secondary-t text-sm">
            <li>
              <strong className="text-primary-t">TokenRegistry</strong> whitelist:{" "}
              <span className="font-mono text-xs break-all">{tokenRegistry ?? "Not deployed"}</span>
            </li>
            <li>
              <strong className="text-primary-t">TokenOnboardingManager</strong> 2-day timelock:{" "}
              <span className="font-mono text-xs break-all">{onboarding ?? "Not deployed"}</span>
            </li>
            <li>
              <strong className="text-primary-t">ImpactOracleAdapter</strong> per-token Uniswap V3 TWAP:{" "}
              <span className="font-mono text-xs break-all">{impactOracle ?? "Not deployed"}</span>
            </li>
            <li>
              <strong className="text-primary-t">TreasuryValuation</strong> applies haircuts (0% stable, 50% impact, 50% POL)
            </li>
            <li>
              <strong className="text-primary-t">Safe multisig</strong> gates every privileged update
            </li>
          </ol>
        </Card>

        <Card className="p-6">
          <h3 className="font-serif text-xl mb-2 text-primary-t">What still needs to happen</h3>
          <ul className="list-disc list-inside space-y-2 text-secondary-t text-sm">
            <li>Mainnet treasury deployment after final contract audit</li>
            <li>Seed real stablecoin reserves (USDC, USDC, sUSDS) from launch participants</li>
            <li>Onboard first impact-token vaults and PSM collateral</li>
            <li>Launch LBP or bond market to acquire first Protocol-Owned Liquidity</li>
            <li>Move from testnet leaderboards to on-chain mainnet rewards</li>
          </ul>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-10">
        <Card className="p-6">
          <h3 className="font-serif text-xl mb-2 text-primary-t">What we&apos;re looking for</h3>
          <ul className="list-disc list-inside space-y-2 text-secondary-t text-sm">
            <li>People who want to try the testnet product before mainnet</li>
            <li>Impact token projects and climate-finance partners</li>
            <li>LPs and treasury-participation designs for launch</li>
            <li>Feedback on the model, the haircuts, and the onboarding flow</li>
          </ul>
        </Card>

        <Card className="p-6">
          <h3 className="font-serif text-xl mb-2 text-primary-t">On-chain achievements we&apos;re tracking</h3>
          <p className="text-secondary-t mb-3 text-sm">
            The protocol records every testnet interaction. Mainnet rewards and status will be based on these on-chain facts.
          </p>
          <ul className="list-disc list-inside space-y-2 text-secondary-t text-sm">
            <li>
              <a href="/#/impact-leaderboard" className="text-green underline">Impact token leaderboard</a>
            </li>
            <li>
              <a href="/#/whitelist" className="text-green underline">Whitelist signers</a>
            </li>
            <li>First stakers, first bond participants, and top referrers (recorded by contract)</li>
          </ul>
        </Card>
      </div>

      <div className="text-sm text-tertiary-t border-t border-a10-b pt-6">
        <p>
          Last updated: live from the connected RPC. Data is only as current as the last Base Sepolia block it was able to read.
        </p>
      </div>
    </div>
  );
}
