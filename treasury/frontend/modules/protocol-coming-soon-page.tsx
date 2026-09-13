import { SHITLogo } from "@/components/shit-logo";
import {
  useScrollReveal,
  SectionWrapper,
  SectionHead,
  PhaseBanner,
  ProductCard,
} from "@/modules/shared-sections";
import { FloorMarketDashboardWidget } from "@/modules/protocol-widget-floor-market-widget";
import { YieldSplitWidget } from "@/modules/protocol-widget-yield-split-widget";

export function ComingSoonPage() {
  useScrollReveal();

  return (
    <div className="min-h-screen">
      {/* Page header */}
      <SectionWrapper id="coming-soon" className="pt-12 pb-8">
        <div className="max-w-4xl">
          <h1 className="font-serif text-4xl md:text-6xl font-medium leading-[1.07] tracking-tight max-w-3xl">
            Coming{" "}
            <em className="italic text-yellow font-medium">soon.</em>
          </h1>
          <p className="text-secondary-t mt-6 text-lg max-w-xl">
            These contracts are built but not deployed yet. Once the protocol
            has generated enough treasury funds, we'll launch each of these one
            by one.
          </p>
          <div className="flex items-center gap-2 mt-5">
            <span className="font-mono text-xs uppercase tracking-wider px-3 py-1.5 rounded-full bg-yellow/20 text-yellow">
              🔒 Preview — not live yet
            </span>
          </div>
          <div className="flex gap-3 mt-8 flex-wrap">
            <a
              href="#/"
              className="inline-flex items-center gap-2 font-semibold text-sm border border-a20-b text-primary-t px-5 py-3 rounded-full hover:border-yellow hover:text-yellow transition-colors"
            >
              ← Back to live protocol
            </a>
          </div>
        </div>
      </SectionWrapper>

      <PhaseBanner
        variant="coming-soon"
        title="Everything below is a preview"
        subtitle="These contracts are built but not deployed yet. Once the protocol above has generated enough treasury funds, we'll launch each of these one by one."
      />

      {/* Floor market — coming soon */}
      <SectionWrapper id="floor" className="py-16 border-t border-a10-b">
        <SectionHead
          kicker="Price floor"
          title="Floor market"
          subtitle="The floor market ensures SHIT always has a minimum price backed by the treasury. The floor only goes up — never down."
        />
        <div data-reveal>
          <FloorMarketDashboardWidget />
        </div>
      </SectionWrapper>

      {/* Stablecoin — BUCKY & RIDX (coming soon) */}
      <SectionWrapper id="stablecoin" className="py-16 border-t border-a10-b">
        <SectionHead
          kicker="Stablecoin — coming soon"
          title="BUCKY & RIDX"
          subtitle="BUCKY is a USD stablecoin backed by overcollateralized climate impact assets. RIDX tracks the performance of the treasury's full reserve basket. Both are built and ready to deploy."
        />
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          <ProductCard
            icon="/media-bucky-tree.svg"
            symbol="BUCKY"
            name="Bucky"
            tagline="A dollar that stays a dollar"
            description="Bucky is a stable dollar you can hold without worrying about swings. It is created when someone deposits more real collateral than the dollars they receive."
            details={{
              rows: [
                { label: "Pegged to", value: "USD ($1)" },
                { label: "Minted via", value: "Deposit collateral (150%+)" },
                { label: "Peg kept steady by", value: "Automatic market ops" },
                { label: "Decimals", value: "18" },
              ],
            }}
          />
          <ProductCard
            icon="📊"
            symbol="RIDX"
            name="Ridx"
            tagline="Your money's report card"
            description="Ridx quietly tracks how well the treasury's whole basket of assets is performing, and grows in value to reflect it."
            details={{
              rows: [
                { label: "Tracks", value: "Full reserve basket" },
                { label: "Mechanism", value: "Auto-compounding rebase" },
                { label: "Management needed", value: "None" },
                { label: "Decimals", value: "18" },
              ],
            }}
          />
        </div>
        <div className="border border-a10-b rounded-2xl bg-surface-bg-l2 p-6" data-reveal>
          <h3 className="font-serif text-xl mb-2">Peg Stability Module (PSM)</h3>
          <p className="text-secondary-t text-sm">
            The PSM lets you deposit approved collateral and mint BUCKY at a 1:1 ratio (minus a small fee). When BUCKY is live, this is where you'll go to mint and redeem.
          </p>
        </div>
      </SectionWrapper>

      {/* Pendle — stSHIT SY */}
      <SectionWrapper id="pendle" className="py-16 border-t border-a10-b">
        <SectionHead
          kicker="Yield derivatives"
          title="Pendle — stSHIT SY"
          subtitle="Split stSHIT yield into Principal Tokens and Yield Tokens. Managed directly on Pendle's app."
        />
        <div data-reveal>
          <YieldSplitWidget />
        </div>
      </SectionWrapper>

      {/* Markets extra — yield strategies, BAMM, peg keeper (coming soon) */}
      <SectionWrapper id="markets-extra" className="py-16 border-t border-a10-b">
        <SectionHead
          kicker="Markets — coming soon"
          title="Yield strategies & peg keeper"
          subtitle="Once BUCKY is live, the treasury will put idle assets into yield strategies and keep BUCKY's price steady automatically."
        />
        <div className="space-y-4" data-reveal>
          <div className="border border-a10-b rounded-2xl bg-surface-bg-l2 p-6">
            <h3 className="font-serif text-xl mb-2">Yield strategies</h3>
            <p className="text-secondary-t text-sm">
              The treasury puts its liquidity into pools that earn yield and reinvest it automatically. This includes leverage looping, external Liquidity Pool positions, and SHIT swap liquidity.
            </p>
          </div>
          <div className="border border-a10-b rounded-2xl bg-surface-bg-l2 p-6">
            <h3 className="font-serif text-xl mb-2">BAMM — Liquidity Pool wrapper</h3>
            <p className="text-secondary-t text-sm">
              A wrapper that turns Liquidity Pool positions into tokens you can use in lending and leverage markets. This lets you build more complex strategies on top of protocol-owned liquidity.
            </p>
          </div>
          <div className="border border-a10-b rounded-2xl bg-surface-bg-l2 p-6">
            <h3 className="font-serif text-xl mb-2">Peg keeper</h3>
            <p className="text-secondary-t text-sm">
              Automatic market operations that keep BUCKY pegged to $1 by minting or redeeming when the price moves too far. Triggered by a keeper role, following the SHIT Protocol Heart pattern.
            </p>
          </div>
        </div>
      </SectionWrapper>

      {/* Advanced protocol modules — coming soon */}
      <SectionWrapper id="advanced" className="py-16 border-t border-a10-b">
        <SectionHead
          kicker="Advanced — coming soon"
          title="Perps & more"
          subtitle="Perpetual futures, liquidity bootstrapping for impact tokens, and more protocol tools. All built, none of it live yet."
        />

        <div className="space-y-4" data-reveal>
          <div className="border border-a10-b rounded-2xl bg-surface-bg-l2 p-6">
            <h3 className="font-serif text-xl mb-2">Perps & liquidation</h3>
            <p className="text-secondary-t text-sm">
              Perpetual futures contracts backed by the treasury's liquidity pool. Includes a swap-based liquidator and flash-loan liquidations that need zero capital — profits go to the treasury.
            </p>
          </div>

          <div className="border border-a10-b rounded-2xl bg-surface-bg-l2 p-6">
            <h3 className="font-serif text-xl mb-2">Liquidity Bootstrapping Pool (LBP)</h3>
            <p className="text-secondary-t text-sm">
              LBPs will be used to set up liquidity for new impact tokens paired with SHIT. This helps find a fair price and creates deep liquidity from day one, without needing outside market makers.
            </p>
          </div>

          <div className="border border-a10-b rounded-2xl bg-surface-bg-l2 p-6">
            <h3 className="font-serif text-xl mb-2">Contract interactions</h3>
            <p className="text-secondary-t text-sm">
              Anyone can trigger the burner to buy and burn SHIT when fee revenue builds up. The fee decay splitter slowly releases fees to smooth out emissions over time.
            </p>
          </div>
        </div>
      </SectionWrapper>

      {/* Footer */}
      <footer className="py-12 border-t border-a10-b">
        <div className="flex justify-between items-start flex-wrap gap-6">
          <div>
            <div className="flex items-center gap-2 font-serif text-base">
              <SHITLogo className="size-6" />
              SHIT
            </div>
            <p className="text-tertiary-t text-sm max-w-sm mt-2.5">
              SHIT is a decentralized savings protocol backed by a shared
              treasury, including verified climate impact assets.
            </p>
          </div>
          <div className="flex gap-6 text-sm text-secondary-t flex-wrap">
            <a href="#/" className="hover:text-primary-t transition-colors">Back to live protocol</a>
          </div>
        </div>
        <div className="border-t border-a10-b mt-8 pt-4 font-mono text-xs text-tertiary-t">
          5H1T — testnet preview
        </div>
      </footer>
    </div>
  );
}
