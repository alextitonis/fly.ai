# AlphaOpsDash – Architecture Overview

AlphaOpsDash is a full-stack operational dashboard for algorithmic trading systems. It is structured as a small, realistic production-style project with a clear separation between frontend and backend concerns.

This document summarizes the main architectural decisions, how the layers are organized, and how data flows through the system.

---

## High-Level View

The project is split into two main applications:

- **frontend/** – React + TypeScript + Vite + Tailwind  
- **backend/** – Node.js + Express (JavaScript, ready for migration to TypeScript if desired)

The frontend is responsible for:

- Rendering the trading and operations dashboard  
- Connecting to the backend API for portfolio, signals, trades and ops data  
- Displaying live BTC/USD price retrieved from an external market data provider via the backend  
- Managing wallet connectivity for EVM-compatible providers

The backend is responsible for:

- Exposing a clean HTTP API (`/api/*`)  
- Encapsulating business logic and data access behind services and connectors  
- Providing a stable abstraction over external providers (e.g. Coingecko, future CEX/DEX, or on-chain data)

---

## Backend Architecture

**Location:** `backend/src`

The backend follows a layered architecture:

- `server.js`  
  Application entrypoint.  
  - Configures Express, CORS, JSON parsing and logging  
  - Wires route modules under `/api/*`  
  - Exposes `/api/health` for basic monitoring  
  - Registers the global error handler middleware  

- `config.js`  
  Centralized configuration based on environment variables (port, CORS origin, log level, external API base URL).

- `middleware/`  
  Cross-cutting concerns applied to incoming requests.
  - `requestLogger.js` – assigns a request ID and logs request/response metadata in structured JSON (method, path, status, duration, timestamp).  
  - `errorHandler.js` – central error handler that logs failures and returns a consistent 500 response payload to clients.

- `routes/`  
  HTTP route definitions. Each route module wires endpoints to controllers:
  - `portfolioRoutes.js` → `/api/portfolio` and `/api/portfolio/history`  
  - `signalRoutes.js` → `/api/signals`  
  - `tradeRoutes.js` → `/api/trades`  
  - `opsRoutes.js` → `/api/ops`  
  - `marketRoutes.js` → `/api/market/price`

- `controllers/`  
  HTTP-level handlers. Controllers:
  - receive Express `req`/`res` objects  
  - call services for business logic  
  - shape the HTTP response (status + JSON payload)  
  - delegate error handling to the global error handler via `next(err)`

- `services/`  
  Business logic layer. Services:
  - implement operations in domain terms such as  
    - “fetch portfolio summary”  
    - “fetch recent signals”  
    - “fetch live market price”
  - orchestrate one or more connectors  
  - keep controllers free of data source details

- `connectors/`  
  Integration layer for upstream data sources:
  - `mockExchangeConnector.js` – in-memory mock of portfolio, signals, trades and ops health.  
  - `marketDataConnector.js` – live market data integration using Coingecko (or another external provider via `EXTERNAL_MARKET_API_URL`).

Connectors are designed so they can later be replaced with real exchange APIs, databases, or on-chain providers without changing controllers or the frontend.

---

## Frontend Architecture

**Location:** `frontend/src`

The frontend is a React + TypeScript SPA built with Vite and Tailwind CSS.

Key areas:

- `components/`
  - `layout/Sidebar.tsx` – main navigation for the dashboard.  
  - `layout/Topbar.tsx` – top bar with title, environment hints and wallet connectivity.  
  - `charts/PortfolioEquityChart.tsx` – equity curve chart rendered with Recharts using data from the portfolio history endpoint.

- `pages/`
  - `Dashboard.tsx` – main landing view showing:
    - portfolio summary cards  
    - live BTC/USD price widget  
    - equity chart  
    - recent signals and operational health panels  
  - `Signals.tsx` – signals table view (mocked for the MVP).  
  - `Infra.tsx` – infrastructure health view (mocked for the MVP).

- `hooks/`
  - `useWallet.ts` – EVM wallet connectivity (Metamask-compatible).  
    - Reads `window.ethereum`  
    - Requests accounts  
    - Exposes address + connect/disconnect handlers to the UI

- `services/`
  - `mockApi.ts` – typed client for all backend API endpoints:
    - `/api/portfolio`  
    - `/api/portfolio/history`  
    - `/api/signals`  
    - `/api/trades`  
    - `/api/ops`  
    - `/api/market/price`  

  All calls are built using `VITE_API_BASE` so the same code can run in local development (via Vite proxy) and production (via the deployed backend URL).

- `setupTests.ts`
  - Shared test initialization for Vitest + React Testing Library.

---

## Data Flow (Example: Dashboard)

1. A user opens the dashboard in the browser (`DashboardPage`).  
2. React `useEffect` hooks trigger calls to:
   - `fetchPortfolioSummary`  
   - `fetchRecentSignals`  
   - `fetchOpsHealth`  
   - `fetchMarketPrice`
3. Each function in `mockApi.ts` issues an HTTP GET request to `VITE_API_BASE + /api/...`.  
4. On the backend:
   - Express routes forward the request to the corresponding controller.  
   - Controllers call services, which read from `mockExchangeConnector` or `marketDataConnector`.  
   - The response is serialized as JSON and returned to the frontend.
5. The frontend updates local React state and re-renders:
   - top-level metrics cards  
   - signals list  
   - ops health panel  
   - live BTC price widget  
   - equity chart (for portfolio history)

---

## Testing and CI

- **Backend**  
  - Jest + Supertest tests (`src/server.test.js`) exercise key HTTP endpoints:
    - `/api/health`  
    - `/api/portfolio`  
    - `/api/signals`  
    - `/api/market/price`
  - The tests run as part of the CI workflow.

- **Frontend**  
  - Vitest + React Testing Library tests (`src/pages/Dashboard.test.tsx`) cover:
    - dashboard rendering  
    - live BTC price widget behavior  
  - The equity chart is mocked to keep tests fast and deterministic.

- **CI**  
  - GitHub Actions workflow (`.github/workflows/ci.yml`) runs backend tests, frontend tests and a production build on every push and pull request targeting `main`.

---

## Future Extensions

The current architecture is intentionally small but ready to be extended with:

- Real exchange connectors (Binance, Bybit) replacing the mock connector  
- On-chain data providers (via ethers.js or viem) for Web3 metrics  
- Database persistence (PostgreSQL or similar) for historical signals and trades  
- Authentication and multi-portfolio management  
- More granular observability (latency, error rates, per-exchange status)
