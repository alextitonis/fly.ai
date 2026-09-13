import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LayoutShell } from "./components/layout/LayoutShell";
import { DashboardPage } from "./pages/Dashboard";
import { SignalsPage } from "./pages/Signals";
import { TradesPage } from "./pages/Trades";
import { InfraPage } from "./pages/Infra";

function App() {
  return (
    <BrowserRouter>
      <LayoutShell>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/signals" element={<SignalsPage />} />
          <Route path="/trades" element={<TradesPage />} />
          <Route path="/infra" element={<InfraPage />} />
        </Routes>
      </LayoutShell>
    </BrowserRouter>
  );
}

export default App;
