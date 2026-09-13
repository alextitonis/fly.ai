import { MerchWidget } from "@/modules/protocol-widget-merch-widget";
import { SectionWrapper, useScrollReveal } from "@/modules/shared-sections";

export function MerchPage() {
  useScrollReveal();

  return (
    <div className="min-h-screen">
      <SectionWrapper id="merch" className="pt-12 pb-8">
        <div className="max-w-4xl">
          <h1 className="font-serif text-4xl md:text-6xl font-medium leading-[1.07] tracking-tight max-w-3xl">
            Merch that <em className="italic text-green font-medium">plants mangroves</em>
          </h1>
          <p className="text-secondary-t mt-6 text-lg max-w-2xl">
            Every purchase from our TreeMerch store funds mangrove restoration through Treegens. Look good, do good.
          </p>
        </div>
      </SectionWrapper>

      <SectionWrapper id="merch-products" className="py-8">
        <MerchWidget />
      </SectionWrapper>
    </div>
  );
}
