import { Card } from "@/components/ui-card";

export function YieldSplitWidget() {
  return (
    <Card className="p-6">
      <h3 className="font-serif text-xl mb-4">Yield Split — Pendle Principal Tokens / Yield Tokens</h3>
      <p className="text-sm text-tertiary-t mb-4">
        Pendle Principal Tokens / Yield Tokens markets are now managed via the official Pendle frontend.
      </p>
      <a
        href="https://app.pendle.finance"
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-primary hover:underline"
      >
        Open Pendle ↗
      </a>
    </Card>
  );
}
