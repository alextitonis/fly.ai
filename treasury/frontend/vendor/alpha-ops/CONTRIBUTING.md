# Contributing to AlphaOpsDash

AlphaOpsDash is a compact full-stack project intended to simulate a realistic trading operations dashboard. Even though this repository is primarily a portfolio project, it follows a contribution workflow similar to a production codebase.

This document explains how to run the project locally, how to submit changes, and what conventions are used across the repository.

---

## Getting Started

### Backend

```bash

cd backend

npm install

npm run dev
```

The backend will start on the port configured in `backend/.env` (default: **4000**).

### Frontend

`cd frontend
npm install
npm run dev`

By default, Vite serves the frontend at:

`http://localhost:5173`

The frontend communicates with the backend through `VITE_API_BASE`\
(see `frontend/.env.example`).

* * * * *

Environment Configuration
-------------------------

Do **not** commit `.env` files to the repository.

Use the provided examples:

-   `backend/.env.example`

-   `frontend/.env.example`

For local development:

1.  Copy each `.env.example` → `.env`

2.  Adjust values if needed (ports, CORS origin, external API URLs)
* * * * *

Code Style and Architecture
---------------------------

The project is structured to cleanly separate concerns.

### Backend Structure

-   **routes/** -- define HTTP endpoints and URL structure

-   **controllers/** -- handle request/response and delegate to services

-   **services/** -- implement business logic

-   **connectors/** -- external integrations (mock or real APIs)

-   **middleware/** -- logging, error handling, request metadata

### Frontend Structure

-   **pages/** -- top-level views

-   **components/** -- reusable UI and layout elements

-   **hooks/** -- reusable stateful logic (e.g. wallet connectivity)

-   **services/** -- typed clients for backend API calls

### When adding new functionality

Follow the backend flow:

`route → controller → service → connector`

Follow the frontend flow:

`API client (services) → page/component → UI state update`

Keep props minimal and avoid mixing API logic directly inside components.

* * * * *

Testing
-------

Both backend and frontend include minimal but representative test coverage.

### Backend Tests

`cd backend
npm test`

Backend tests use **Jest + Supertest**, located in:

`src/server.test.js`

When adding new endpoints, consider tests that:

-   call the endpoint via HTTP

-   assert status codes and response shape

* * * * *

### Frontend Tests

`cd frontend
npm test`

Frontend tests use **Vitest + React Testing Library**, located in:

`src/pages/Dashboard.test.tsx`

When adding new UI that depends on API data:

-   mock functions from `services/mockApi`

-   assert loading states, error states, and final rendering

All tests run automatically in **CI** on every push and pull request.

* * * * *

Continuous Integration (CI)
---------------------------

This repository uses GitHub Actions:

`.github/workflows/ci.yml`

CI performs:

-   Backend tests (Jest)

-   Frontend tests (Vitest)

-   Frontend production build (Vite)

The README badge reflects CI status for `main`.

> Do not merge into `main` when CI is failing.

* * * * *

Commit Messages and Branching
-----------------------------

Commit messages should be concise and descriptive.

Preferred prefixes:

-   `feat:` -- new feature (API, UI, behavior)

-   `fix:` -- bugfix

-   `refactor:` -- internal changes without altering behavior

-   `test:` -- tests only

-   `docs:` -- documentation only

-   `chore:` -- tooling, CI, maintenance

### Examples

`feat(api): add endpoint for strategy performance breakdown
fix(frontend): handle empty signals list gracefully`

For larger changes, create a feature branch and submit a pull request.

* * * * *

Reporting Issues and Proposing Enhancements
-------------------------------------------

When creating issues, include:

-   A short summary in the title

-   Clear description of the problem or enhancement

-   Steps to reproduce (for bugs)

-   Relevant logs, screenshots, or payloads

Suggested labels:

-   `bug`

-   `enhancement`

-   `documentation`

-   `question`

* * * * *

Scope and Intent
----------------

AlphaOpsDash is intentionally small but designed to be extended:

-   Replace mock connectors with real exchange or on-chain providers

-   Persist portfolio, signals, and trades in a database

-   Add authentication and multi-portfolio support

-   Improve observability and risk metrics

Contributions and refactors should preserve clarity and maintainability, ensuring the project remains understandable for technical reviewers and interviewers
