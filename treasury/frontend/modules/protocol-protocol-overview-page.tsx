import { useState, useEffect } from "react";
import { useConnectedAddress } from "@/hooks/use-connected-address";
import { useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import { SHITLogo } from "@/components/shit-logo";
import { scrollToSection } from "@/lib/navigation";
import { FlyBrainDashboard } from "@/components/fly-brain-dashboard";
import { BrainVisualization } from "@/components/brain-visualization";

export function useScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll("[data-reveal]");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

export function SectionWrapper({
  id,
  children,
  className,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("relative scroll-mt-20", className)}>
      {children}
    </section>
  );
}

export function SectionHead({
  kicker,
  title,
  subtitle,
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="max-w-2xl mb-12" data-reveal>
      {kicker && (
        <span className="block font-mono text-sm uppercase tracking-wider text-yellow mb-3">
          {kicker}
        </span>
      )}
      <h2 className="font-serif text-3xl md:text-4xl font-medium leading-tight">{title}</h2>
      {subtitle && <p className="text-secondary-t mt-3 text-lg leading-relaxed">{subtitle}</p>}
    </div>
  );
}

export function PhaseBanner({
  variant,
  title,
  subtitle,
}: {
  variant: "live" | "coming-soon";
  title: string;
  subtitle: string;
}) {
  const isLive = variant === "live";
  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-2xl border px-6 py-5 mb-10 shadow-card",
        isLive ? "border-green/30 bg-green/10" : "border-yellow/30 bg-yellow/10",
      )}
      data-reveal
    >
      <span
        className={cn(
          "flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider px-3 py-1.5 rounded-full whitespace-nowrap",
          isLive ? "bg-green/20 text-green" : "bg-yellow/20 text-yellow",
        )}
      >
        {isLive ? (
          <>
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full rounded-full bg-green opacity-75 animate-ping" />
              <span className="relative inline-flex size-2 rounded-full bg-green" />
            </span>
            Live now
          </>
        ) : (
          "🔒 Coming soon"
        )}
      </span>
      <div>
        <div className="font-serif text-lg leading-tight">{title}</div>
        <p className="text-secondary-t text-base mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

function LockedBadge({ label = "Coming soon" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs text-yellow border border-yellow/30 bg-yellow/10 px-3 py-1.5 rounded-full">
      🔒 {label}
    </span>
  );
}

export function ComingSoonWrapper({
  children,
  label,
}: {
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <div className="relative rounded-2xl overflow-hidden">
      <div
        className="pointer-events-none opacity-45 select-none grayscale-[0.3]"
        aria-hidden="true"
        inert
      >
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-surface-bg-l1/10 via-surface-bg-l1/40 to-surface-bg-l1/70">
        <LockedBadge label={label} />
      </div>
    </div>
  );
}

export function ProductCard({
  icon,
  symbol,
  name,
  tagline,
  description,
  details: { rows },
  hideDetails,
}: {
  icon: string;
  symbol: string;
  name: string;
  tagline: string;
  description: string;
  details: { rows: { label: string; value: string }[] };
  hideDetails?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="border border-a10-b rounded-2xl bg-gradient-to-br from-surface-bg-l2 to-surface-bg-l1 p-6 flex flex-col shadow-card transition-all hover:-translate-y-1"
      data-reveal
    >
      <div className="flex items-center justify-between">
        <div
          className={cn(
            "size-9 rounded-full flex items-center justify-center text-lg overflow-hidden",
            symbol === "SHIT" && "bg-green/20",
            symbol === "BUCKY" && "bg-yellow/20",
            symbol === "RIDX" && "bg-blue/20",
          )}
        >
          {icon.startsWith("/") ? (
            <img
              src={icon}
              alt={name}
              loading="lazy"
              decoding="async"
              className="size-full object-contain"
            />
          ) : (
            icon
          )}
        </div>
        <span className="font-mono text-xs text-secondary-t border border-a20-b px-2.5 py-1 rounded-full">
          {symbol}
        </span>
      </div>
      <h3 className="font-serif text-xl mt-4">{name}</h3>
      <div className="text-yellow text-base mt-1 font-medium">{tagline}</div>
      <p className="text-secondary-t mt-3 text-base flex-1 leading-relaxed">{description}</p>
      {!hideDetails && (
        <>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="mt-4 flex items-center gap-2 font-mono text-sm text-secondary-t hover:text-primary-t transition-colors self-start"
          >
            {open ? "Hide technical details" : "Technical details"}
            <span className={cn("transition-transform text-xs", open && "rotate-180")}>▾</span>
          </button>
          <div
            className={cn(
              "overflow-hidden transition-all duration-300",
              open ? "max-h-64 mt-3" : "max-h-0",
            )}
          >
            <div className="border-t border-a10-b pt-3 flex flex-col gap-2">
              {rows.map((row) => (
                <div key={row.label} className="flex justify-between font-mono text-base">
                  <span className="text-secondary-t">{row.label}</span>
                  <span className="text-primary-t">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function ProtocolOverviewPage() {
  useScrollReveal();
  const { address } = useConnectedAddress();
  const navigate = useNavigate();

  const isStepActive = (_id: string) => true;

  const goToSection = (sectionId: string) => {
    if (window.location.hash !== "#/" && window.location.pathname !== "/") {
      navigate("/");
      setTimeout(() => scrollToSection(sectionId), 150);
    } else {
      scrollToSection(sectionId);
    }
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero */}
      <SectionWrapper id="overview" className={cn("pt-12 pb-8 relative overflow-hidden", !isStepActive("overview") && "hidden")}>
        {/* Ambient glow */}
        <div
          className="pointer-events-none absolute -top-24 -left-24 size-[32rem] rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(34, 197, 94, 0.8) 0%, transparent 70%)" }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -top-10 right-0 size-[24rem] rounded-full opacity-25 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(234, 179, 8, 0.8) 0%, transparent 70%)" }}
          aria-hidden="true"
        />
        <div className="grid md:grid-cols-[1fr_440px] gap-8 items-center relative">
          <div className="max-w-4xl">
            <h1 className="font-serif text-4xl md:text-6xl font-medium leading-[1.07] tracking-tight max-w-3xl">
              R<span className="text-green" style={{ fontFamily: '"Fraunces", serif', fontFeatureSettings: '"liga" 1' }}>∞</span>ted.
            </h1>
            <div className="text-secondary-t mt-6 text-lg max-w-xl leading-relaxed space-y-3">
              <p>
                Want to help the environment but don't know how? SHIT lets you put money into a
                treasury backed by real, verified climate impact assets — solar farms, mangrove
                restoration, soil carbon, and more. As the treasury earns from these assets, your
                share grows automatically. It's a simple way to fund climate action while building
                your own financial position.
              </p>
            </div>
            <div className="flex gap-3 mt-8 flex-wrap">
              <button
                type="button"
                onClick={() => navigate("/dashboard")}
                className="inline-flex items-center gap-2 font-semibold text-sm bg-primary-t text-inverted-primary-t px-5 py-3 rounded-full shadow-button-primary hover:bg-white transition-all hover:-translate-y-0.5"
              >
                Start growing →
              </button>
              <button
                type="button"
                onClick={() => goToSection("impact-flow")}
                className="inline-flex items-center gap-2 font-semibold text-sm border border-a20-b text-primary-t px-5 py-3 rounded-full hover:border-yellow hover:text-yellow transition-all hover:-translate-y-0.5"
              >
                See how it works
              </button>
            </div>
          </div>
          <img
            src="/pictures/shit/shitnew-removebg-preview.png"
            alt="SHIT Protocol"
            className="hidden md:block w-full h-auto max-h-[420px] object-contain"
            loading="eager"
            data-reveal
          />
        </div>

        {/* Stat strip */}
        <div
          className="mt-14 border border-a10-b rounded-2xl grid grid-cols-2 md:grid-cols-4 overflow-hidden shadow-surface-level-2 bg-surface-bg-l2 relative"
          data-reveal
        >
          {[
            { label: "Treasury assets", value: "6 verified" },
            { label: "Staking yield", value: "Auto-compound" },
            { label: "Climate impact-backed", value: "Solar, forests, wetlands" },
          ].map((stat, i) => (
            <div
              key={stat.label}
              className={cn(
                "p-5 transition-colors hover:bg-surface-a5",
                i < 2 && "border-r border-a10-b",
              )}
            >
              <div className="font-mono text-sm uppercase tracking-wider text-secondary-t">
                {stat.label}
              </div>
              <div className="font-mono text-lg mt-1.5">{stat.value}</div>
            </div>
          ))}
        </div>
      </SectionWrapper>

      {/* Plain English */}
      <SectionWrapper id="plain" className={cn("py-16 border-t border-a10-b", !isStepActive("plain") && "hidden")}>
        <div className="grid md:grid-cols-[280px_1fr] gap-12">
          <h2 className="font-serif text-2xl md:text-3xl font-medium leading-tight" data-reveal>
            In plain
            <br />
            English
          </h2>
          <div data-reveal>
            <p className="text-secondary-t text-lg max-w-xl leading-relaxed">
              SHIT holds a shared pool of money — the treasury — and backs it with real, verified
              climate impact assets, not promises. The funds put in are used to buy and hold these
              assets, which earn yield from carbon credit sales, energy production, and ecosystem
              services.
            </p>
            <p className="text-secondary-t text-lg max-w-xl mt-4 leading-relaxed">
              When you put money in, you get SHIT — your representative value of the shared
              treasury. When the treasury earns, your piece grows automatically. Stake SHIT to
              compound your returns; if you don't stake, your share slowly dilutes as new SHIT are
              minted to stakers. Bonds, staking, borrowing — each is a different way to put that
              treasury to work for you.
            </p>
          </div>
        </div>
      </SectionWrapper>

      {/* How your funds create positive impact */}
      <SectionWrapper id="impact-flow" className={cn("py-20 border-t border-a10-b", !isStepActive("impact-flow") && "hidden")}>
        <SectionHead
          kicker="Where the money goes"
          title="How your funds create real-world impact"
          subtitle="The funds put in are used to buy and hold verified climate impact assets — solar farm credits, mangrove restoration tokens, wetland carbon credits, and more."
        />
        <div className="grid md:grid-cols-3 gap-4 mt-8">
          {[
            {
              tag: "Bonds",
              title: "Buy bonds, fund the treasury",
              desc: "When you buy a bond, you put assets (like USDC) into the treasury. In return, you get SHIT at a discount below the market value of SHIT. The bond vests over a fixed period, during which you gradually receive your discounted SHIT. The funds put in are used to buy and hold real climate impact assets.",
            },
            {
              tag: "Treasury",
              title: "Treasury holds climate impact assets",
              desc: "The treasury holds verified climate impact assets — solar farm credits, mangrove restoration tokens, wetland carbon credits, and more. Each asset is independently verified and tracked on-chain.",
            },
            {
              tag: "Yield",
              title: "Climate impact assets earn yield",
              desc: "These climate impact assets generate yield — from carbon credit sales, energy production, and ecosystem services. That yield flows back into the treasury, making each SHIT worth more over time.",
            },
          ].map((step, i) => (
            <div
              key={step.title}
              className="group border border-a10-b rounded-2xl bg-surface-bg-l2 p-7 shadow-card transition-all hover:-translate-y-1 hover:border-green/40"
              data-reveal
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center size-7 rounded-full bg-green/15 text-green font-mono text-xs font-semibold group-hover:bg-green/25 transition-colors">
                  {i + 1}
                </span>
                <div className="font-mono text-xs uppercase tracking-wider text-green">
                  {step.tag}
                </div>
              </div>
              <h3 className="font-serif text-xl mt-3">{step.title}</h3>
              <p className="text-secondary-t mt-2.5 text-base leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 grid md:grid-cols-2 gap-4" data-reveal>
          <div className="border border-a10-b rounded-2xl bg-surface-bg-l2 p-6">
            <h3 className="font-serif text-lg mb-3">Verified climate impact assets in the treasury</h3>
            <ul className="space-y-2 text-base text-secondary-t leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="text-green mt-0.5">●</span>
                <span>
                  <strong className="text-primary-t">Solarcoin (SLR)</strong> — Global energy currency that rewards verified
                  solar energy producers. Each MWh of solar generation earns 1 SLR.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green mt-0.5">●</span>
                <span>
                  <strong className="text-primary-t">Treegens (TREE)</strong> — Funds verified reforestation and tree planting
                  projects. Tokenizes the carbon sequestration impact of new forests.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green mt-0.5">●</span>
                <span>
                  <strong className="text-primary-t">Regen Network (REGEN)</strong> — Platform for ecological verification and
                  carbon credit markets. Governs a registry of verified ecological claims and
                  biodiversity credits.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green mt-0.5">●</span>
                <span>
                  <strong className="text-primary-t">DOVU</strong> — Tokenizes verified carbon offsets from soil carbon
                  sequestration and regenerative agriculture. Connects farmers and land stewards
                  with carbon credit buyers.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green mt-0.5">●</span>
                <span>
                  <strong className="text-primary-t">Klima Protocol (KLIMA)</strong> — Carbon market token that facilitates
                  trading and retirement of tokenized carbon credits, driving capital toward climate
                  mitigation.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green mt-0.5">●</span>
                <span>
                  <strong className="text-primary-t">Crypto Endowment Network (CEN)</strong> — Creates permanent endowments
                  funding climate initiatives, conservation, and community sustainability programs.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green mt-0.5">●</span>
                <span>
                  <strong className="text-primary-t">USDC</strong> — A stable, income-generating dollar asset that is partially backed by impact assets. The treasury can accept it through bonds and hold it as part of its reserve basket.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </SectionWrapper>

      {/* Impact Token Markets — combined with on-chain tracking */}
      <SectionWrapper id="impact-markets" className={cn("py-16 border-t border-a10-b", !isStepActive("impact-markets") && "hidden")}>
        <SectionHead
          kicker="Impact tokens"
          title="Impact token markets"
          subtitle="Every climate impact asset in the treasury is tracked on-chain. Verify exactly what the treasury holds and where the money flows — all in real time."
        />
        <div data-reveal>
          <div className="grid md:grid-cols-2 gap-4">
            <a
              href="#/impact"
              onClick={() => window.scrollTo(0, 0)}
              className="border border-a10-b rounded-2xl bg-surface-bg-l2 p-6 hover:border-green/40 transition-colors"
            >
              <h3 className="font-serif text-xl mb-2">Token Registry</h3>
              <p className="text-base text-secondary-t">
                Browse all verified impact tokens in the SHIT ecosystem.
              </p>
            </a>
            <a
              href="#/impact-clarity"
              onClick={() => window.scrollTo(0, 0)}
              className="border border-a10-b rounded-2xl bg-surface-bg-l2 p-6 hover:border-green/40 transition-colors"
            >
              <h3 className="font-serif text-xl mb-2">Impact Clarity Map</h3>
              <p className="text-base text-secondary-t">
                See where impact projects are located and what they do.
              </p>
            </a>
          </div>
        </div>

        <div className="mt-12 grid md:grid-cols-3 gap-4" data-reveal>
          <div className="border border-a10-b rounded-2xl bg-surface-bg-l2 p-6">
            <h3 className="font-serif text-lg mb-2">Why not just buy a climate impact asset directly?</h3>
            <p className="text-base text-secondary-t leading-relaxed">
              You can — but each asset has its own wallet, exchange, custody and verification
              overhead. SHIT bundles many assets into one treasury, handles the vetting, and turns
              the yield into a single share.
            </p>
          </div>
          <div className="border border-a10-b rounded-2xl bg-surface-bg-l2 p-6">
            <h3 className="font-serif text-lg mb-2">How are assets chosen?</h3>
            <p className="text-base text-secondary-t leading-relaxed">
              The treasury only holds on-chain, independently verified impact tokens. Assets are
              screened for proven impact, real income and auditable reserves, then approved through
              protocol governance.
            </p>
          </div>
          <div className="border border-a10-b rounded-2xl bg-surface-bg-l2 p-6">
            <h3 className="font-serif text-lg mb-2">Does this take from impact organizations?</h3>
            <p className="text-base text-secondary-t leading-relaxed">
              No. SHIT is a buyer and liquidity provider. The protocol purchases tokens at market
              price and holds them in the treasury, sending more capital to the projects, not less.
            </p>
          </div>
        </div>
      </SectionWrapper>

      {/* Crypto negatives & how SHIT offsets them */}
      <SectionWrapper id="sustainability" className={cn("py-20 border-t border-a10-b", !isStepActive("sustainability") && "hidden")}>
        <SectionHead
          kicker="Honest about our footprint"
          title="SHIT's environmental footprint — and how we offset it"
          subtitle="Every blockchain transaction uses energy. We measure SHIT's actual footprint on Base and offset it through treasury-backed climate impact assets."
        />
        <div className="grid md:grid-cols-2 gap-8 mt-8" data-reveal>
          <div className="border border-a10-b rounded-2xl bg-surface-bg-l2 p-6">
            <h3 className="font-serif text-lg mb-4 text-red">SHIT's footprint on Base</h3>
            <ul className="space-y-3 text-base text-secondary-t leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="text-red mt-0.5">●</span>
                <span>
                  <strong className="text-primary-t">Base's energy use:</strong> Base is a Layer-2 rollup on Ethereum. It uses
                  proof-of-stake, not proof-of-work, so per-transaction energy is tiny — but not
                  zero. Every SHIT transfer, bond purchase, and staking action consumes a small
                  amount of energy on Base sequencers and Ethereum's consensus layer.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red mt-0.5">●</span>
                <span>
                  <strong className="text-primary-t">Sequencer reliance:</strong> Base currently relies on a centralized
                  sequencer operated by Coinbase. This means SHIT's transactions depend on
                  infrastructure that has its own energy footprint from data centers.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red mt-0.5">●</span>
                <span>
                  <strong className="text-primary-t">L1 settlement cost:</strong> Every batch of Base transactions settles on
                  Ethereum L1, which requires gas and energy for finality.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red mt-0.5">●</span>
                <span>
                  <strong className="text-primary-t">Net footprint:</strong> While far smaller than proof-of-work chains,
                  SHIT's cumulative activity still has a measurable energy and carbon footprint
                  that we take responsibility for.
                </span>
              </li>
            </ul>
          </div>
          <div className="border border-a10-b rounded-2xl bg-surface-bg-l2 p-6">
            <h3 className="font-serif text-lg mb-4 text-green">How SHIT offsets it</h3>
            <ul className="space-y-3 text-base text-secondary-t leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="text-green mt-0.5">●</span>
                <span>
                  <strong className="text-primary-t">Treasury backs real climate impact assets:</strong> The treasury holds verified
                  tokens including Solarcoin (solar energy), Treegens (reforestation), DOVU (soil
                  carbon), Regen Network (ecological credits), Klima Protocol (carbon credits), CEN
                  (climate endowments), and USDC (a stable reserve asset partially backed by impact
                  assets). Each actively removes,
                  avoids, or underwrites CO₂.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green mt-0.5">●</span>
                <span>
                  <strong className="text-primary-t">Net-positive by design:</strong> The carbon removed by treasury-backed
                  projects — reforestation, solar generation, soil sequestration — far exceeds the
                  energy used by SHIT's own on-chain activity on Base.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green mt-0.5">●</span>
                <span>
                  <strong className="text-primary-t">Transparent tracking:</strong> Every climate impact asset in the treasury is
                  verifiable on-chain. You can see exactly what's held, how much yield it generates,
                  and where the money flows.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </SectionWrapper>

      {/* Products — SHIT + CTA combined */}
      <SectionWrapper id="products" className={cn("py-20 border-t border-a10-b", !isStepActive("products") && "hidden")}>
        <SectionHead
          title="The token"
          subtitle="SHIT is the representative value of the shared treasury. Its value comes from the treasury's real reserves — not from hype or a peg. Stake it to compound your returns automatically. If you don't stake, your share slowly dilutes over time as new SHIT are minted to reward stakers."
        />
        <div className="grid md:grid-cols-2 gap-4">
          <ProductCard
            icon="/pictures/shit/shitnew-removebg-preview.png"
            symbol="SHIT"
            name="SHIT"
            tagline="Your share of the treasury"
            description="Connect your wallet to see your balance, start staking, and watch your share of the treasury grow. Don't leave your SHIT unstaked — your value dilutes over time if you do."
            details={{
              rows: [
                { label: "Backed by", value: "Treasury reserves" },
                { label: "Issued via", value: "Discounted bonds" },
                { label: "Yield mechanism", value: "Staking (rebasing)" },
                { label: "Decimals", value: "9" },
              ],
            }}
            hideDetails
          />
          <div
            className="rounded-3xl border border-a20-b p-8 flex flex-col justify-center shadow-surface-level-2"
            style={{
              background:
                "linear-gradient(135deg, rgba(72, 187, 120, 0.14), rgba(234, 179, 8, 0.10)), var(--surface-bg-l2)",
            }}
          >
            <h3 className="font-serif text-2xl md:text-3xl font-medium">Ready to put down shit?</h3>
            <p className="text-secondary-t mt-3 text-base max-w-sm leading-relaxed">
              Start staking your SHIT to compound your returns automatically.
            </p>
            <div className="flex gap-3 mt-6 flex-wrap">
              <a
                href="#/dashboard"
                className="inline-flex items-center gap-2 font-semibold text-sm bg-primary-t text-inverted-primary-t px-5 py-3 rounded-full shadow-button-primary hover:bg-white transition-all hover:-translate-y-0.5"
              >
                {address ? "Go to dashboard" : "Sign in"}
              </a>
              <a
                href="/#/whitepaper"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 font-semibold text-sm border border-a20-b text-primary-t px-5 py-3 rounded-full hover:border-yellow hover:text-yellow transition-all hover:-translate-y-0.5"
              >
                Read the full docs
              </a>
            </div>
          </div>
        </div>
      </SectionWrapper>

      {/* Fly Brain Trading Dashboard — adapted from sshfighter/dashboard.html (MIT, alextitonis/fly.ai) */}
      <SectionWrapper id="fly-brain" className={cn("py-16 border-t border-a10-b", !isStepActive("fly-brain") && "hidden")}>
        <SectionHead
          kicker="AI Trading Brain"
          title="Fly Brain Trading Dashboard"
          subtitle="Live neural activity from the MaleCNS connectome (166,700 neurons, 5.1M synapses) driving paper trading decisions. Aligned with alextitonis/fly.ai upstream architecture."
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <FlyBrainDashboard />
          <BrainVisualization />
        </div>
      </SectionWrapper>

      {/* Coming soon link */}
      <SectionWrapper id="coming-soon-link" className={cn("py-8", !isStepActive("coming-soon-link") && "hidden")}>
        <div
          className="rounded-2xl border border-yellow/30 bg-yellow/5 p-6 text-center"
          data-reveal
        >
          <span className="inline-flex items-center gap-1.5 font-mono text-xs text-yellow border border-yellow/30 bg-yellow/10 px-2.5 py-1 rounded-full mb-2">
            🔒 Coming soon
          </span>
          <h2 className="font-serif text-lg md:text-xl font-medium">Stablecoin, perps & more</h2>
          <p className="text-secondary-t mt-2 text-sm max-w-sm mx-auto leading-relaxed">
            BUCKY, RIDX, yield strategies, perps, and the compound flywheel are built and ready to preview.
          </p>
          <a
            href="#/coming-soon"
            onClick={() => window.scrollTo(0, 0)}
            className="inline-flex items-center gap-2 font-semibold text-xs border border-yellow/40 text-yellow px-4 py-2 rounded-full hover:bg-yellow/10 transition-colors mt-4"
          >
            Preview what's coming →
          </a>
        </div>
      </SectionWrapper>


      <div className="my-6 text-center" data-reveal>
        <span className="inline-flex items-center gap-1.5 font-mono text-xs text-yellow border border-yellow/30 bg-yellow/10 px-2.5 py-1 rounded-full">
          🔒 Coming later: stablecoin, Perps & more
        </span>
      </div>

      {/* Footer */}
      <footer className="py-12 border-t border-a10-b">
        <div className="flex justify-between items-start flex-wrap gap-6">
          <div>
            <div className="flex items-center gap-2 font-serif text-base">
              <SHITLogo className="size-6" />
              SHIT
            </div>
            <p className="text-secondary-t text-sm max-w-sm mt-2.5"></p>
            <div className="flex gap-3 mt-4">
              <a
                href="https://matrix.to/#/#shit-finance:matrix.org"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 font-mono text-xs text-secondary-t border border-a20-b px-3 py-1.5 rounded-full hover:border-yellow hover:text-yellow transition-colors"
              >
                <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
                  <path d="M5.4 3h13.2A2.4 2.4 0 0 1 21 5.4v13.2a2.4 2.4 0 0 1-2.4 2.4H5.4A2.4 2.4 0 0 1 3 18.6V5.4A2.4 2.4 0 0 1 5.4 3zm.6 3v12h2v-8.5l4.5 8.5h2.5V6h-2v8.5L8.5 6H6zm10 0v12h2V6h-2z" />
                </svg>
                Join our Matrix chat
              </a>
              <a
                href="/#/whitepaper"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 font-mono text-xs text-secondary-t border border-a20-b px-3 py-1.5 rounded-full hover:border-yellow hover:text-yellow transition-colors"
              >
                Docs
              </a>
              <a
                href="https://x.com/shit_finance"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 font-mono text-xs text-secondary-t border border-a20-b px-3 py-1.5 rounded-full hover:border-yellow hover:text-yellow transition-colors"
              >
                X
              </a>
              <a
                href="https://radicle.network/nodes/rosa.radicle.network/rad%3Az2kY22UBjvyrbxfKZftjF4H66C7Wx"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 font-mono text-xs text-secondary-t border border-a20-b px-3 py-1.5 rounded-full hover:border-yellow hover:text-yellow transition-colors"
              >
                Radicle Repo
              </a>
            </div>
          </div>
          <div className="flex gap-6 text-sm text-secondary-t flex-wrap items-center">
          </div>
        </div>
        <div className="border-t border-a10-b mt-8 pt-4 font-mono text-xs text-secondary-t">
          SHIT Protocol — testnet preview
        </div>
        <div className="border-t border-a10-b mt-4 pt-4 text-xs text-tertiary-t max-w-3xl leading-relaxed">
          <p>
            <strong className="text-secondary-t">Disclaimer:</strong> SHIT Protocol is a decentralized protocol. SHIT is a utility token that represents a share of the protocol treasury — it is not a security, investment contract, or financial instrument. Nothing on this site constitutes financial advice, investment recommendations, or an offer to sell or solicit securities. Token values can go up or down. Staking rewards are not guaranteed and depend on protocol revenue. Always do your own research and consult a qualified professional before participating. SHIT Protocol is not liable for any losses incurred through use of the protocol.
          </p>
        </div>
        <div className="w-full flex justify-center mt-8">
          <img
            src="/shit-banner-nobg.png"
            alt="SHIT Protocol"
            className="max-w-2xl w-full h-auto object-contain"
            loading="lazy"
          />
        </div>
      </footer>
    </div>
  </div>
);
}
