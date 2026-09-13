import { LiquidityChart } from "./components/LiquidityChart";
import { VolumeChart } from "./components/VolumeChart";
import { TopTokensTable } from "./components/TopTokensTable";

export function Dashboard() {
  return (
    <div className="p-3 md:p-5 max-w-[1600px] mx-auto flex flex-col gap-4 md:gap-5">
      <div className="grid grid-cols-1 lg:grid-cols-[58%_minmax(0,1fr)] gap-4 md:gap-5">
        <LiquidityChart />
        <VolumeChart />
      </div>
      <TopTokensTable />
    </div>
  );
}
