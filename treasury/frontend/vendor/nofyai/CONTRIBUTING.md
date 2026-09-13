# Contributing Guide

Thank you for considering contributing to NofyAI!

**Languages:** [English](CONTRIBUTING.md) | [中文](CONTRIBUTING_zh.md)

## How to Contribute

### Report Bugs

If you find a bug, please report it in GitHub Issues with the following information:

- **Title**: Brief and clear description
- **Environment**: Node.js version, OS, browser, etc.
- **Reproduction Steps**: Detailed steps
- **Expected Behavior**: What you expected to happen
- **Actual Behavior**: What actually happened
- **Screenshots**: If applicable, add screenshots to help explain
- **Logs**: Relevant console output or error logs

### Propose New Features

If you have an idea for a new feature, please discuss it in Issues first:

1. Check if there's already a related Issue
2. Create a new Issue with `enhancement` label
3. Clearly describe the feature's purpose and expected behavior
4. Wait for maintainer feedback before starting to code

### Submit Code

#### Development Workflow

1. **Fork Repository**
   ```bash
   # Click Fork button on GitHub
   git clone https://github.com/your-username/nofyai.git
   cd nofyai
   ```

2. **Create Branch**
   ```bash
   git checkout -b feature/amazing-feature
   # or
   git checkout -b fix/bug-description
   ```

3. **Install Dependencies**
   ```bash
   npm install
   ```

4. **Configure Development Environment**
   ```bash
   cp config.json.example config.json
   cp .env.local.example .env.local
   # Edit configuration files
   ```

5. **Development**
   - Write code
   - Follow code standards
   - Add necessary comments

6. **Testing**
   ```bash
   npm run lint        # Check code style
   npm run build       # Ensure build succeeds
   npm run dev         # Local testing
   ```

7. **Commit Changes**
   ```bash
   git add .
   git commit -m "feat: add some feature"
   # Follow commit message format below
   ```

8. **Push Branch**
   ```bash
   git push origin feature/amazing-feature
   ```

9. **Create Pull Request**
   - Open your Fork repository on GitHub
   - Click "New Pull Request"
   - Fill in PR description explaining your changes

#### Commit Message Convention

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation update
- `style`: Code formatting (doesn't affect functionality)
- `refactor`: Refactoring (neither feature nor bug fix)
- `perf`: Performance optimization
- `test`: Testing related
- `chore`: Build process or tool changes

**Examples:**
```
feat(ai): add Claude AI model support

- Implement Anthropic API integration
- Add model configuration options
- Update AI prompt templates

Closes #123
```

```
fix(aster): fix Aster DEX signing error

- Fix private key format handling
- Update ethers.js wallet signing logic
- Add error messages

Fixes #456
```

### Code Standards

#### TypeScript

- **Strict Mode**: Enable TypeScript strict mode
- **Type Definitions**: Provide explicit types for all functions and variables
- **Avoid `any`**: Use specific types as much as possible
- **Interface First**: Use `interface` over `type` (unless union types needed)

#### React

- **Function Components**: Use function components and Hooks
- **Props Types**: Define Props interface for all components
- **Naming Convention**: Components use PascalCase, filenames match component names
- **Avoid Inline Styles**: Use Tailwind CSS classes

#### Styling

- **Tailwind CSS**: Prefer Tailwind utility classes
- **Responsive Design**: Use `sm:`, `md:`, `lg:` prefixes
- **Custom Classes**: Define in `globals.css` when necessary
- **Avoid `!important`**: Unless absolutely necessary

#### File Organization

- **Path Alias**: Use `@/` to import modules (e.g., `@/lib/api`)
- **Relative Paths**: Avoid deep relative paths (`../../../`)
- **Single Responsibility**: Each file should do one thing
- **Clear Naming**: Filenames clearly describe their content

#### Project-Specific Standards

##### Adding New AI Models

If you want to add support for a new AI model:

1. **Add model handler function in `/lib/ai.ts`**
   ```typescript
   async function getNewModelDecision(
     context: TradingContext,
     apiKey: string,
     customUrl?: string
   ): Promise<AIResponse> {
     // Implement API call logic
   }
   ```

2. **Add branch in `getFullDecision()`**
   ```typescript
   case 'newmodel':
     return await getNewModelDecision(context, config.newmodel_api_key);
   ```

3. **Update type definitions in `/types/index.ts`**
   ```typescript
   export interface TraderConfig {
     // ... other fields
     newmodel_api_key?: string;
     newmodel_model_name?: string;
   }
   ```

4. **Update config example file `config.json.example`**

5. **Update documentation**: README.md and CLAUDE.md

##### Adding New Exchanges

Currently the system only supports Aster DEX. To add other exchanges:

1. **Create exchange client** `/lib/exchanges/newexchange.ts`
   ```typescript
   export class NewExchangeTrader {
     async getBalance(): Promise<AccountInfo> { }
     async getPositions(): Promise<Position[]> { }
     async openPosition(params: OpenPositionParams): Promise<any> { }
     async closePosition(params: ClosePositionParams): Promise<any> { }
   }
   ```

2. **Integrate in `/lib/trading-engine.ts`**
   - Initialize exchange client in constructor
   - Update `getAccount()` and trade execution logic

3. **Update config types**: Add required credential fields for new exchange

4. **Test script**: Create `scripts/test-newexchange-connection.ts`

5. **Documentation updates**: Detail configuration method for new exchange

##### Modifying Decision Log Format

Decision logging system is in `/lib/decision-logger.ts`:

- **Don't** arbitrarily modify existing fields, this breaks backward compatibility
- **Can** add new optional fields
- **Must** update type definitions synchronously
- **Recommend** providing data migration scripts (see `scripts/migrate-closed-positions.ts`)

##### Market Data Sources

System uses Binance API for market data, logic in `/lib/market-data.ts`:

- To add new data source (like CoinGecko), implement the same interface
- Ensure returned data format is consistent
- Handle API rate limiting and error retries
- Update config to support data source selection

### Testing

Currently no automated tests, but please ensure:

#### Basic Functionality Testing

- [ ] All pages load properly
- [ ] API endpoints return correct data
- [ ] No console errors or warnings
- [ ] Test in different browsers (Chrome, Firefox, Safari)
- [ ] Responsive design displays properly on mobile

#### Trading System Testing

If your changes involve trading logic:

- [ ] **Config Testing**: Validate config loading with `config.json.example`
- [ ] **API Connection Testing**:
  ```bash
  # Test Aster DEX connection
  npx tsx scripts/test-aster-connection.ts

  # Test AI model connection
  npx tsx scripts/test-kimi.ts  # or other AI model test scripts
  ```
- [ ] **Trading Flow Testing**: Run complete trading cycle in test environment with small amounts
- [ ] **Decision Log Validation**: Check JSON file format is correct in `decision_logs/`
- [ ] **Edge Cases**: Test insufficient balance, network errors, API rate limiting, etc.

#### Performance Testing

- [ ] Performance with multiple traders running simultaneously
- [ ] SWR data refresh doesn't cause page stuttering
- [ ] Load speed with large decision logs
- [ ] Equity chart rendering performance with large datasets

#### Security Testing

- [ ] API keys don't leak to frontend
- [ ] Admin authentication works properly
- [ ] Sensitive config is properly masked for display
- [ ] No XSS or injection vulnerabilities

### Security Best Practices

When contributing code, please note:

#### API Key Protection

```typescript
// ❌ Wrong: Directly expose API key in frontend
const apiKey = process.env.NEXT_PUBLIC_DEEPSEEK_KEY;

// ✅ Correct: API key only used server-side
const config = await loadConfig(); // In API Route
const apiKey = config.traders[0].deepseek_api_key;
```

#### Input Validation

```typescript
// ✅ Validate all external input
export async function POST(request: Request) {
  const body = await request.json();

  // Validate required fields
  if (!body.trader_id || typeof body.trader_id !== 'string') {
    return NextResponse.json({ error: 'Invalid trader_id' }, { status: 400 });
  }

  // Validate numeric ranges
  if (body.amount && (body.amount <= 0 || body.amount > MAX_AMOUNT)) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
  }
}
```

#### Error Handling

```typescript
// ✅ Don't expose sensitive error information
try {
  await executeTrader(traderId);
} catch (error) {
  console.error('Trader execution failed:', error); // Server log
  return NextResponse.json(
    { error: 'Failed to execute trader' }, // User sees this
    { status: 500 }
  );
}
```

#### Config File Security

- Ensure `config.json` is in `.gitignore`
- Don't use real API keys in code examples
- Use environment variables or config files, avoid hardcoding sensitive information

### Documentation

If your changes involve:

- **New Features**: Update README.md
- **API Changes**: Update API documentation
- **Config Changes**: Update config.json.example
- **Architecture Adjustments**: Update CLAUDE.md

### Pull Request Checklist

Before submitting PR, ensure:

- [ ] Code follows project code standards
- [ ] Commit messages follow Conventional Commits
- [ ] All changes tested locally
- [ ] Build succeeds (`npm run build`)
- [ ] No ESLint errors (`npm run lint`)
- [ ] Related documentation updated
- [ ] PR description clearly explains changes
- [ ] Added necessary code comments
- [ ] No new security risks introduced
- [ ] Tested edge cases and error handling

## Development Tools and Tips

### Recommended Tools

- **VS Code**: Recommended code editor
  - ESLint extension
  - Prettier extension
  - Tailwind CSS IntelliSense extension
  - TypeScript and JavaScript Language Features

- **Browser Extensions**
  - React Developer Tools
  - Redux DevTools (if using)

### Debugging Tips

#### Debug API Routes

```typescript
// Add logs in API Route
export async function GET(request: Request) {
  console.log('[API] Request URL:', request.url);
  console.log('[API] Request headers:', request.headers);

  try {
    const result = await someOperation();
    console.log('[API] Result:', result);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[API] Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
```

#### Debug Trading Engine

Enable detailed logging in `lib/trading-engine.ts`:

```typescript
async runCycle(): Promise<void> {
  console.log(`[${this.traderId}] Starting trading cycle...`);
  const account = await this.getAccount();
  console.log(`[${this.traderId}] Account balance:`, account.total_equity);
  // ... more logs
}
```

#### View Decision Logs

```bash
# View latest decision log
cat decision_logs/aster_deepseek/$(ls -t decision_logs/aster_deepseek/ | head -1) | jq .

# View specific cycle decision
cat decision_logs/aster_deepseek/50.json | jq '.decisions'

# Extract all trading decisions
find decision_logs/aster_deepseek -name "*.json" | xargs jq -r '.decisions[] | "\(.symbol) \(.action)"'
```

#### Monitor Real-Time Logs

```bash
# Docker environment
docker compose logs -f nofyai

# Local development
npm run dev
```

### Common Development Issues

#### Hot-Reload Not Working

```bash
# Clear Next.js cache
rm -rf .next
npm run dev
```

#### TypeScript Type Errors

```bash
# Regenerate type definitions
npm run build
```

#### Port Already in Use

```bash
# Find process using port 3000
lsof -ti:3000

# Kill process
kill -9 $(lsof -ti:3000)

# Or use different port
PORT=3001 npm run dev
```

## Release Process

### Version Number Convention

Follow [Semantic Versioning](https://semver.org/):

- **Major**: Incompatible API changes
- **Minor**: Backward-compatible new features
- **Patch**: Backward-compatible bug fixes

### Release Checklist

Maintainers should when releasing new version:

- [ ] Update version number in `package.json`
- [ ] Update `CHANGELOG.md` (if exists)
- [ ] Ensure all tests pass
- [ ] Update documentation (README, CLAUDE.md, etc.)
- [ ] Create Git tag
- [ ] Publish Release Notes

### Code of Conduct

#### Our Commitment

To foster an open and welcoming environment, we commit to:

- Use friendly and inclusive language
- Respect different viewpoints and experiences
- Accept constructive criticism gracefully
- Focus on what's best for the community
- Show empathy toward other community members

#### Unacceptable Behavior

- Using sexualized language or imagery
- Insulting or derogatory comments
- Personal attacks
- Harassment
- Publishing others' private information
- Other conduct inappropriate in professional settings

## Questions and Discussions

- **Bug Reports**: Use GitHub Issues
- **Feature Requests**: Use GitHub Issues (label: `enhancement`)
- **General Questions**: Use GitHub Discussions
- **Security Issues**: Please contact maintainers privately

## Useful Resources

### Project Documentation

- [README.md](README.md) - Project overview and quick start
- [CLAUDE.md](CLAUDE.md) - AI development assistant guide
- [config.json.example](config.json.example) - Configuration file example

### Technical Documentation

- [Next.js Documentation](https://nextjs.org/docs) - Next.js official docs
- [React Documentation](https://react.dev/) - React official docs
- [TypeScript Handbook](https://www.typescriptlang.org/docs/) - TypeScript handbook
- [Tailwind CSS](https://tailwindcss.com/docs) - Tailwind CSS docs
- [SWR Documentation](https://swr.vercel.app/) - SWR data fetching library

### Exchange APIs

- [Aster DEX Documentation](https://www.asterdex.com/) - Aster DEX official docs
- [Binance API Documentation](https://binance-docs.github.io/apidocs/) - Binance API (market data)

### AI Model APIs

- [DeepSeek API](https://platform.deepseek.com/api-docs/) - DeepSeek API docs
- [Qwen API](https://help.aliyun.com/zh/dashscope/) - Tongyi Qianwen API docs
- [Kimi API](https://platform.moonshot.cn/docs) - Moonshot AI API docs

## License

By submitting code, you agree to license your contributions under the [MIT License](LICENSE).

---

Thank you again for your contribution! 🎉

<div align="center">

**If you have any questions, feel free to ask in GitHub Issues or Discussions!**

Made with ❤️ by NofyAI Community

</div>
