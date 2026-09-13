const TOKENOMICS_URL = "/tokenomics/";

export function TokenomicsLabPage() {
  return (
    <div className="w-full min-h-[600px] h-[calc(100vh-7rem)] min-[650px]:h-[calc(100vh-6rem)] overflow-y-auto">
      <iframe
        src={TOKENOMICS_URL}
        title="5H1T Tokenomics Lab"
        className="w-full h-full border-0 min-h-[600px]"
        loading="lazy"
        allow="clipboard-write"
        scrolling="yes"
      />
    </div>
  );
}

export default TokenomicsLabPage;
