import { cn } from "@/lib/utils";
import { Card } from "@/components/ui-card";
import { Button } from "@/components/ui-button";

export function DashboardActions({ className }: { className?: string }) {
  return (
    <div className={cn(className)}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5 flex flex-col justify-between">
          <div>
            <h3 className="font-semibold">Bonds</h3>
            <p className="text-sm text-secondary-t mt-1">
              Buy 5H1T at a discount from the treasury.
            </p>
          </div>
          <a href="#/bonds" className="mt-4">
            <Button variant="secondary" size="sm" className="w-full">
              Open Bonds
            </Button>
          </a>
        </Card>

        <Card className="p-5 flex flex-col justify-between">
          <div>
            <h3 className="font-semibold">Stake / Wrap</h3>
            <p className="text-sm text-secondary-t mt-1">
              Stake or wrap 5H1T, st5H1T, and more.
            </p>
          </div>
          <a href="#/stake-wrap" className="mt-4">
            <Button variant="secondary" size="sm" className="w-full">
              Open Stake / Wrap
            </Button>
          </a>
        </Card>

        <Card className="p-5 flex flex-col justify-between">
          <div>
            <h3 className="font-semibold">Borrow</h3>
            <p className="text-sm text-secondary-t mt-1">
              Borrow USDC against wrapped staked 5H1T.
            </p>
          </div>
          <a href="#/borrow" className="mt-4">
            <Button variant="secondary" size="sm" className="w-full">
              Open Borrow
            </Button>
          </a>
        </Card>
      </div>
      <div className="md:hidden mt-4 text-center text-xs text-tertiary-t animate-bounce">
        ↓ Scroll down to view your balances
      </div>
    </div>
  );
}
