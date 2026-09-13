import { NavLink } from "react-router-dom";

const navItems = [
  { label: "Dashboard", to: "/" },
  { label: "Signals", to: "/signals" },
  { label: "Trades", to: "/trades" },
  { label: "Infra Health", to: "/infra" },
];

export function Sidebar() {
  return (
    <aside className="h-screen w-64 border-r border-slate-800 bg-slate-950 text-slate-100 flex flex-col">
      <div className="px-4 py-4 border-b border-slate-800">
        <div className="text-xs uppercase tracking-wide text-slate-500">
          AlphaOps
        </div>
        <div className="text-lg font-semibold">AlphaOpsDash</div>
        <div className="text-[11px] text-slate-500">
          Algo Trading Ops Panel
        </div>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              [
                "flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-slate-800 text-slate-50"
                  : "text-slate-400 hover:bg-slate-900 hover:text-slate-100",
              ].join(" ")
            }
          >
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-slate-800 text-xs text-slate-500">
        v0.1 · MVP
      </div>
    </aside>
  );
}
