const REF = "SHIT6391";

interface MerchProduct {
  name: string;
  slug: string;
}

const PRODUCTS: MerchProduct[] = [
  { name: "T-Shirt", slug: "shit-finance-t-shirt" },
  { name: "Cap", slug: "m-shit-finance-cap" },
  { name: "Hoodie", slug: "shit-finance-hoodie" },
];


export function MerchWidget() {
  return (
    <div className="space-y-8">
      <div
        className="rounded-2xl border border-green/30 bg-green/5 p-6 md:p-8 text-center"
        data-reveal
      >
        <div className="flex items-center justify-center gap-2 mb-3">
          <span className="text-2xl">🌱</span>
          <span className="font-mono text-sm uppercase tracking-wider text-green">
            Every purchase plants mangroves
          </span>
          <span className="text-2xl">🌱</span>
        </div>
        <p className="text-sm text-secondary-t max-w-xl mx-auto">
          Every item you buy from our merch store funds mangrove tree planting through
          Treegens. Wear your support for regenerative finance and help restore coastal
          ecosystems — one shirt, one cap, one hoodie at a time.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-4" data-reveal>
        {PRODUCTS.map((product) => (
          <a
            key={product.name}
            href={`https://treemerch.org/product/${product.slug}?ref=${REF}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 font-semibold text-sm border border-a20-b text-primary-t px-5 py-3 rounded-full hover:border-green hover:text-green transition-colors"
          >
            {product.name} →
          </a>
        ))}
      </div>

    </div>
  );
}
