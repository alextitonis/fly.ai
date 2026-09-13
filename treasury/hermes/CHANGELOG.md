# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog,
and this project follows Semantic Versioning.

## [Unreleased]

### Added
- CI hardening: coverage gate job, security job (bandit + pip-audit), and weekly Dependabot config.
- Release workflow for semantic tags (`vX.Y.Z`) that creates GitHub Releases from CHANGELOG sections.

### Changed
- Onboarding docs and contributor experience improvements (README quick start, CONTRIBUTING, pre-commit, Makefile).

## [10.0.1] - 2026-04-20

### Added
- Production-hardened Aave looping mechanism baseline under `strategies/aave-looping-mechanism/`.

## [10.0.0] - 2026-04-20

### Added
- Unified package metadata in `pyproject.toml` and modernized dev tooling defaults.
