# Contributing Guide

Welcome to the Hermes Token Screener project! We're excited to have you here. This guide will help you get started with contributing to our project.

## Code of Conduct

We expect all contributors to follow our [Code of Conduct](CODE_OF_CONDUCT.md). Please be respectful, kind, and helpful to others.

## Development Setup

### Prerequisites

- Ubuntu 22.04+
- Python 3.10+
- Node.js 18+
- Git

### Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/hermes-token-screener.git
   cd hermes-token-screener
   ```
3. Create a virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```
4. Install Python dependencies:
   ```bash
   pip install --upgrade pip
   pip install -r requirements.txt
   ```
5. Install Node dependencies:
   ```bash
   npm install -g pnpm
   cd packages/gateway
   pnpm install
   pnpm build
   cd ../..
   ```
6. Configure environment:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

## Contribution Guidelines

### Bug Fixes

If you're fixing a bug, please:
1. Check if there's an existing issue for the bug
2. If not, create a detailed issue describing the bug
3. Fork the repository and create a branch
4. Fix the bug and add tests if applicable
5. Submit a pull request with a clear description

### New Features

If you're adding a new feature, please:
1. Create an issue to discuss the feature first
2. Fork the repository and create a branch
3. Implement the feature with proper tests
4. Update documentation if needed
5. Submit a pull request

### Code Style

We follow PEP 8 for Python code and StandardJS for JavaScript code. Please ensure your code is properly formatted before submitting.

### Testing

All new features should be accompanied by tests. Bug fixes should include regression tests when appropriate.

## Pull Request Process

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes
4. Run tests and ensure they pass
5. Update documentation if necessary
6. Submit a pull request
7. Respond to review feedback promptly

## Issue Triage

Help us triage issues by:
- Confirming the issue is reproducible
- Providing additional context
- Suggesting solutions
- Helping others with similar issues

## Community

Join our community on [Discord/Telegram/Slack] for discussions and support.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

Thanks to all our contributors and supporters!