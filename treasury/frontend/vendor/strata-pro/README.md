# Strata Pro Crypto UI

Open-source React crypto dashboard UI for builders who want a premium market terminal aesthetic without starting from a blank canvas.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-646cff.svg)](https://vite.dev/)
[![Bun](https://img.shields.io/badge/package_manager-Bun-f9f1e1.svg)](https://bun.sh/)
[![Stars](https://img.shields.io/github/stars/bymilon/strata-pro-crypto-ui?style=social)](https://github.com/bymilon/strata-pro-crypto-ui/stargazers)
[![Follow on X](https://img.shields.io/badge/follow-%40milonspace-111111?logo=x)](https://x.com/milonspace)

Strata Pro is a polished frontend starter for crypto products, trading interfaces, market data dashboards, and premium fintech concepts. If you like the direction, give the repo a star, follow [@milonspace](https://x.com/milonspace), and sponsor open-source work on GitHub to help fund more ambitious UI releases.

If you want a custom dashboard, design system, or frontend build for your product, reach out through [X](https://x.com/milonspace). This repo is meant to be both a useful starting point and a public proof of execution quality.

## Features

- Premium dark trading-dashboard visual language with responsive sidebar and topbar.
- Liquidity and volume chart modules powered by `lightweight-charts`.
- Token analytics table built with TanStack Table.
- TypeScript-first React 19 + Vite setup with Tailwind CSS 4 tokens.
- Clean OSS-ready structure with contribution, security, funding, and issue templates.

## Status

- Current scope: frontend-only UI.
- Data layer: mock market data for demo and customization purposes.
- Live trading, auth, and backend integrations are not included yet.

## Stack

- React 19
- TypeScript
- Vite 6
- Tailwind CSS 4
- Lightweight Charts
- TanStack Table
- Bun

## Quick Start

```bash
git clone git@github.com:bymilon/strata-pro-crypto-ui.git
cd strata-pro-crypto-ui
bun install
bun run dev
```

Open `http://localhost:3000`.

## Scripts

```bash
bun run dev
bun run build
bun run preview
bun run lint
bun run clean
```

## Project Structure

```txt
src/
  components/
    layout/        App shell, sidebar, topbar
    ui/            Shared UI atoms
  features/
    dashboard/     Charts, cards, table, mock data
  lib/             Utilities
```

## Customization

- Update market copy, token rows, and chart series in `src/features/dashboard`.
- Tune colors, typography, and spacing tokens in `src/index.css`.
- Adjust shell behavior and external links in `src/components/layout`.

## Why Star This

- You get a production-friendly crypto UI base instead of a flat screenshot clone.
- Stars and sponsors directly influence how many more open-source UI systems get shipped publicly.
- Public support helps turn this work into deeper templates, breakdowns, and client-grade component packs.

## Roadmap

- Add repository screenshots and demo assets.
- Add CI for Bun install, lint, and production build verification.
- Expand sidebar destinations into real product states.
- Package more sections into a reusable template kit.

Tracked in [TODO.md](TODO.md).

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), open an issue, or send a focused PR with screenshots for UI changes.

## Security

Please report vulnerabilities through the process in [SECURITY.md](SECURITY.md).

## Support

- Follow updates: [x.com/milonspace](https://x.com/milonspace)
- Sponsor the work: [github.com/sponsors/bymilon](https://github.com/sponsors/bymilon)
- Hire for builds: DM on [X](https://x.com/milonspace)

## License

Released under the [MIT License](LICENSE).
