# OSS Release Playbook

Use this when turning a generated, private, or prototype frontend project into a GitHub-ready open-source release.

Default package manager: Bun.

## Goal

Ship a repository that feels native to GitHub:

- Clear project identity.
- No generated-platform residue.
- Fast local setup.
- Honest scope and roadmap.
- Community files in expected locations.
- Clean lockfile and dependency graph.
- Reproducible build verification.

The output should feel like a maintained open-source project, not a landing-page export.

## Operating Rules

- Use Bun commands by default: `bun install`, `bun run lint`, `bun run build`, `bun run dev`.
- Keep npm commands out of project docs unless the repo intentionally supports npm.
- Prefer one tracked lockfile: `bun.lock`.
- Remove unused dependencies before writing docs.
- Do not overfit the README to the current implementation. Describe the reusable value.
- Keep copy direct. No hype, no filler, no fake enterprise claims.
- Treat screenshots, CI, accessibility, and performance work as roadmap items if they are not completed yet.
- Before pushing, run a residue search for old platform names, API keys, template names, and stale package-manager references.

## Agent Team Pattern

Use agents when the repo has enough surface area to benefit from parallel review.

Suggested split:

- Branding auditor: search for generated platform, old product, template, secret, and vendor footprints.
- Docs strategist: inspect the app and draft README/TODO/community-file structure.
- Main implementer: apply scoped edits, refresh package metadata, verify build, and push.

Agents should inspect and report. The main implementer should make final edits to keep style and scope coherent.

## Step 1: Inventory

Run:

```bash
rg --files --glob '!node_modules/**'
rg -n --glob '!node_modules/**' "Google|AI Studio|Gemini|genai|react-example|package-lock|npm|TODO|FIXME|API_KEY|APP_URL|Generated|template"
Get-Content -Raw package.json
Get-Content -Raw README.md
Get-Content -Raw vite.config.ts
```

Also inspect:

- `index.html`
- `.env.example`
- metadata files from generation platforms
- lockfiles
- config files
- `src/App.*`
- major components
- current `.gitignore`

Record exact files to change.

## Step 2: Remove Generated Footprint

Common cleanup:

- Delete generated platform README content.
- Delete unused `.env.example` if the app has no runtime env.
- Delete platform metadata files.
- Remove injected API-key definitions from Vite or framework config.
- Remove generated title/meta copy from `index.html`.
- Remove generated license headers if they do not match the intended project license.
- Replace old import paths caused by generator package choices.
- Remove unused dependencies and dev dependencies.

For AI-generated app exports, search for:

```txt
Google
AI Studio
Gemini
genai
GEMINI_API_KEY
APP_URL
react-example
My Google
```

Do not leave cleanup notes in source unless they are actionable roadmap items.

## Step 3: Package Metadata

Update `package.json`:

```json
{
  "name": "project-name",
  "version": "0.1.0",
  "description": "Short, concrete project description.",
  "license": "MIT",
  "author": "Name <https://github.com/handle>",
  "repository": {
    "type": "git",
    "url": "git+ssh://git@github.com/handle/repo.git"
  },
  "bugs": {
    "url": "https://github.com/handle/repo/issues"
  },
  "homepage": "https://github.com/handle/repo#readme",
  "packageManager": "bun@<current-version>",
  "keywords": ["react", "vite", "tailwindcss", "landing-page"]
}
```

Keep dependencies honest:

- Runtime deps only in `dependencies`.
- Tooling in `devDependencies`.
- Remove unused SDKs, servers, icon libraries, dotenv, and generated helpers.
- Keep Vite in `devDependencies`.

Refresh Bun:

```bash
bun install --lockfile-only
```

If Bun has Windows temp/cache trouble, retry with escalation rather than switching to npm.

## Step 4: README Shape

The README should answer, fast:

- What is this?
- Why would someone star or fork it?
- What stack does it use?
- How do I run it?
- Where do I customize it?
- What is the roadmap?
- How do I contribute?

Recommended structure:

```md
# Project Name

One-sentence value proposition.

Badges.

Short paragraph with concrete positioning.

## Features
## Stack
## Quick Start
## Scripts
## Project Structure
## Customization
## Roadmap
## Contributing
## Security
## License
```

README rules:

- No fake maturity.
- No long marketing prose.
- No stale API-key setup if the app does not require env vars.
- Include screenshots only if they exist in the repo or stable hosted assets.
- Prefer `bun` commands.

## Step 5: Linear-Style TODO

Create `TODO.md` with issue-like IDs:

```md
# TODO

Linear-style backlog for the OSS release. Status values: `Backlog`, `Todo`, `In Progress`, `Done`.

## Release Foundation

| ID | Status | Priority | Owner | Task |
| --- | --- | --- | --- | --- |
| PROJ-001 | Done | P0 | Docs | Remove generated platform README, metadata, env placeholders, and API-key wiring. |
| PROJ-002 | Todo | P1 | Platform | Add GitHub Actions for install, type-check, build, and dependency audit. |
```

Useful categories:

- Release Foundation
- Product Scope
- UX and Accessibility
- Performance
- Community
- Quality
- Deployment

Keep tasks specific enough to turn into GitHub issues later.

## Step 6: Community Files

Add:

```txt
LICENSE
CONTRIBUTING.md
SECURITY.md
CODE_OF_CONDUCT.md
.github/ISSUE_TEMPLATE/bug_report.yml
.github/ISSUE_TEMPLATE/feature_request.yml
.github/PULL_REQUEST_TEMPLATE.md
```

Minimum content expectations:

- `LICENSE`: actual chosen license, usually MIT for templates.
- `CONTRIBUTING.md`: setup, checks, PR standards, screenshots for UI work.
- `SECURITY.md`: private vulnerability reporting path.
- `CODE_OF_CONDUCT.md`: expected behavior and enforcement path.
- Issue templates: bug reproduction, expected behavior, environment, screenshots.
- PR template: summary, screenshots, lint/build checklist.

GitHub recognizes community profile files in the root, `docs`, or `.github` depending on file type. Issue forms belong under `.github/ISSUE_TEMPLATE`.

## Step 7: Gitignore

For frontend OSS repos:

```gitignore
node_modules/
dist/
build/
coverage/
.bun-tmp/
.wrangler/
.DS_Store
*.log
.env*
```

Only unignore env examples if the repo intentionally ships one:

```gitignore
!.env.example
```

## Step 8: Verification

Run:

```bash
bun run lint
bun run build
rg -n --glob '!node_modules/**' --glob '!bun.lock' --glob '!dist/**' "Google|AI Studio|Gemini|genai|GEMINI|APP_URL|react-example|package-lock|npm"
git status --short --ignored
```

Expected:

- Type-check passes.
- Production build passes.
- Residue search returns nothing relevant.
- Ignored folders include `node_modules/`, `dist/`, and local temp folders.
- No `package-lock.json` unless intentionally supporting npm.

If Vite/esbuild fails with `spawn EPERM` in a sandbox, rerun the build with the required approval. Do not mark build verified until it passes.

## Step 9: GitHub Release Push

If the folder is not a Git repo:

```bash
git init
git remote add origin git@github.com:handle/repo.git
git add .
git commit -m "feat: prepare project for open source release"
git branch -M main
git push -u origin main
```

Before commit:

```bash
git diff --cached --name-only
git status --short --ignored
```

Do not commit ignored local artifacts. Do not push without confirming the remote.

## Step 10: Post-Push Repository Setup

After pushing:

- Add repository topics.
- Add screenshot or demo GIF.
- Enable private vulnerability reporting if desired.
- Add GitHub Actions for Bun install, type-check, build, and audit.
- Convert TODO rows into GitHub issues.
- Label issues: `good first issue`, `help wanted`, `docs`, `a11y`, `performance`, `design`.
- Pin or feature the repo if it is part of a public launch.

## Tweet Template

Short launch post:

```txt
WIP: PROJECT

Refactored PROJECT for OSS release.

Removed generated app residue, cleaned the repo for Bun, added README, TODO, license, security, contributing, and GitHub templates.

Still needs screenshots, but the bones are solid.

Grab it:
https://github.com/handle/repo

#oss #OpenSource
```

Keep it under the platform character limit. Remove one sentence before removing the link.

## Definition of Done

The OSS release pass is done when:

- Generated-platform references are gone.
- README is accurate and concise.
- `TODO.md` tracks next improvements.
- Community files are present.
- `package.json` metadata is correct.
- Bun lockfile is refreshed.
- Lint/type-check passes.
- Build passes.
- Remote is set.
- Commit is pushed to `main`.

## References

- GitHub Docs: [About community profiles for public repositories](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/about-community-profiles-for-public-repositories)
- GitHub Docs: [Setting guidelines for repository contributors](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/setting-guidelines-for-repository-contributors)
- Open Source Guides: [Building Welcoming Communities](https://opensource.guide/building-community/)
- Open Source Guides: [Your Code of Conduct](https://opensource.guide/code-of-conduct/)
- Contributor Covenant: [Code of Conduct for Digital Communities](https://www.contributor-covenant.org/)
