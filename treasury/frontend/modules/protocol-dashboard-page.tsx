import { BalancesPage } from "@/modules/shit-balance-page";
import { DashboardActions } from "@/components/dashboard-actions";

export function DashboardPage() {
  return (
    <div className="py-8">
      <h1 className="font-serif text-3xl mb-2">Dashboard</h1>
      <p className="text-secondary-t mb-6">
        Grow, mint, borrow — your treasury share at a glance.
      </p>

      <DashboardActions className="md:sticky top-14 z-20 bg-surface-bg-l1 pb-4 mb-8" />

      <BalancesPage />
    </div>
  );
}
