import { useChainId } from "wagmi";
import { Card } from "@/components/ui-card";
import { IMPACT_TOKENS, getImpactTokenAddress, type ImpactTokenInfo } from "@/lib/impact-tokens";
import { base, baseSepolia, isTestnetMode } from "@/lib/chains";
import { useState } from "react";

function ImpactTokenCard({ token, chainId }: { token: ImpactTokenInfo; chainId: number }) {
  const [copied, setCopied] = useState(false);

  const tokenAddress = getImpactTokenAddress(token, chainId);

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(tokenAddress ?? token.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {token.logoUrl ? (
            <img
              src={token.logoUrl}
              alt={token.name}
              className="size-10 rounded-full bg-surface-a3 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="size-10 rounded-full bg-surface-a3 flex items-center justify-center text-sm font-semibold text-primary-t">
              {token.symbol.slice(0, 2)}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-primary-t">{token.name}</h3>
              <span className="text-sm bg-surface-a3 px-2 py-0.5 rounded-full text-secondary-t font-mono">
                {token.symbol}
              </span>
            </div>
            <a
              href={token.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline mt-1 inline-block"
            >
              {token.website.replace("https://", "")}
            </a>
          </div>
        </div>
        <button
          type="button"
          onClick={handleCopyAddress}
          className="text-sm text-secondary-t font-mono bg-surface-a3 px-2 py-1 rounded hover:bg-surface-a5 hover:text-primary-t transition-colors cursor-pointer"
          title="Click to copy address"
        >
          {copied ? "Copied!" : `${(tokenAddress ?? token.address).slice(0, 8)}...${(tokenAddress ?? token.address).slice(-6)}`}
        </button>
      </div>

      <p className="text-base text-secondary-t leading-relaxed">{token.description}</p>
    </Card>
  );
}

const MEDIA_IMAGES = [
  { src: "/media-forest", alt: "Reforestation project — trees planted as treasury-backed climate impact assets", label: "Reforestation" },
  { src: "/media-solarpanels", alt: "Solar panel array generating clean energy", label: "Solar power" },
  { src: "/media-oceansolarpunk", alt: "Ocean-based solarpunk infrastructure", label: "Clean oceans" },
  { src: "/media-mangrovestreegen", alt: "Mangrove forest regeneration", label: "Mangrove restoration" },
  { src: "/media-solarpunkorchard", alt: "Solarpunk orchard with integrated renewable energy", label: "Sustainable agriculture" },
  { src: "/media-glowlily", alt: "Bioluminescent lily in a preserved wetland", label: "Wetland preservation" },
  { src: "/media-turle", alt: "Sea turtle in protected marine habitat", label: "Marine life" },
  { src: "/media-gorilla", alt: "Gorilla in protected wildlife corridor", label: "Wildlife corridors" },
  { src: "/media-jaguar", alt: "Jaguar in reforested rainforest", label: "Rainforest biodiversity" },
  { src: "/media-field", alt: "Regenerative agriculture field", label: "Regenerative farming" },
  { src: "/media-hollow", alt: "Ancient forest hollow — preserved ecosystem", label: "Old growth forests" },
  { src: "/media-greenbackape", alt: "Green-backed ape in conservation zone", label: "Endangered species" },
];

export function ImpactTokensPage() {
  const chainId = useChainId();
  const readChainId = isTestnetMode ? baseSepolia.id : base.id;

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-8">
      <div>
        <p className="text-xs font-mono uppercase tracking-wider text-tertiary-t mb-2">
          Where the value actually comes from
        </p>
        <h1 className="font-serif text-3xl md:text-4xl font-medium leading-[1.07] tracking-tight mb-3">
          The impact token registry
        </h1>
        <p className="text-secondary-t text-base max-w-2xl">
          Six verified, real-world climate impact assets the treasury accepts as reserves. Each one
          represents a tracked, real outcome — not just another crypto token.
        </p>
      </div>

      <Card className="p-6 text-center border-a10-b bg-surface-bg-l2">
        <p className="text-base text-primary-t mb-3">
          Want to see the full climate impact dashboard?
        </p>
        <a
          href="#/impact-clarity"
          onClick={() => window.scrollTo(0, 0)}
          className="inline-flex items-center gap-2 font-semibold text-sm bg-primary-t text-inverted-primary-t px-5 py-3 rounded-full shadow-button-primary hover:bg-white transition-all hover:-translate-y-0.5"
        >
          Explore the Impact Clarity Map →
        </a>
      </Card>

      <div>
        <h2 className="text-xl font-bold mb-2">Impact Tokens</h2>
        <p className="text-base text-secondary-t max-w-2xl leading-relaxed">
          Impact tokens are environmentally-focused ERC20 tokens whitelisted in the 5H1T
          Token Registry. These tokens represent verified ecological outcomes — carbon credits,
          reforestation, clean energy generation, and regenerative agriculture. The 5H1T
          protocol accepts these tokens as reserve assets, channeling treasury backing toward
          climate-positive initiatives while maintaining protocol solvency.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {IMPACT_TOKENS.map((token) => (
          <ImpactTokenCard key={token.address} token={token} chainId={readChainId} />
        ))}
      </div>

      {/* Media gallery */}
      <div className="mt-12">
        <h3 className="font-serif text-xl mb-4">Real assets, real places</h3>
        <p className="text-secondary-t text-base max-w-xl mb-6 leading-relaxed">
          These aren't abstract numbers. The treasury backs your savings with verified projects on
          the ground — forests, solar arrays, and protected ecosystems around the world.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {MEDIA_IMAGES.map((img) => (
            <div
              key={img.src}
              className="group relative rounded-xl overflow-hidden border border-a10-b aspect-[4/3]"
            >
              <picture>
                <source srcSet={`${img.src}.webp`} type="image/webp" />
                <img
                  src={`${img.src}.webp`}
                  alt={img.alt}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
              </picture>
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
              <div className="absolute bottom-2 left-3 right-3">
                <span className="font-mono text-xs text-white/90">{img.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Video */}
      <div className="mt-8 mx-auto max-w-2xl">
        <div className="relative rounded-2xl overflow-hidden border border-a20-b aspect-video bg-black">
          <video
            src="/media-kevinowocki.mp4"
            controls
            preload="metadata"
            className="absolute inset-0 w-full h-full"
          >
            <track kind="captions" />
          </video>
        </div>
      </div>

      {!isTestnetMode && chainId !== base.id && (
        <Card className="p-4 border-yellow-500/30">
          <p className="text-sm text-secondary-t">
            Impact token data is fetched from Base mainnet. Switch to Base to interact with these
            tokens directly.
          </p>
        </Card>
      )}
    </div>
  );
}
