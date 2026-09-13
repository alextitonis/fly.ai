import { Card } from "@/components/ui-card";
import { Button } from "@/components/ui-button";
import { baseSepolia } from "@/lib/chains";

const SEVERITY_ROWS = [
  { severity: "Critical / serious bug", examples: "Irrecoverable loss of treasury or user funds, infinite mint, unauthorized access to privileged functions", reward: "Up to 5% of the token allocation before mainnet launch, paid in testnet SHIT with a mainnet reward weight" },
  { severity: "High", examples: "Temporary freezing of funds, significant oracle manipulation, bypass of the 2-day timelock", reward: "Large testnet allocation + mainnet reward weight" },
  { severity: "Medium", examples: "Logic errors causing incorrect haircuts, UI misrepresentation, edge-case reverts", reward: "Moderate testnet allocation + mainnet reward weight" },
  { severity: "Low / Informational", examples: "Gas optimization, documentation mismatch, best-practice recommendations", reward: "Acknowledgment + small testnet allocation" },
];

export function BugBountyPage() {

  return (
    <div className="min-h-screen container mx-auto max-w-4xl px-4 py-12">
      <div className="mb-10">
        <span className="font-mono text-sm uppercase tracking-wider text-yellow mb-2 block">
          Security
        </span>
        <h1 className="font-serif text-4xl md:text-5xl mb-3 text-primary-t">
          Bug bounty
        </h1>
        <p className="text-secondary-t text-lg max-w-3xl">
          Help find real bugs before mainnet. Reports are rewarded in testnet SHIT and
          weighted for a future mainnet allocation. The people who find bugs are exactly
          the kind of technical, skeptical people we want knowing the project exists.
        </p>
      </div>

      <div className="mb-10">
        <h2 className="font-serif text-2xl mb-4 text-primary-t">Scope</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="p-6">
            <h3 className="font-serif text-lg mb-2 text-primary-t">In scope</h3>
            <ul className="list-disc list-inside space-y-2 text-secondary-t text-sm">
              <li>SHIT token and staking contracts</li>
              <li>SHIT Protocol-style treasury, minter, and RBS modules</li>
              <li>Token onboarding, registry, and oracle adapter</li>
              <li>DSS-style stablecoin vaults (Bucky)</li>
              <li>PSM and AMO contracts</li>
              <li>Bonding (standard and inverse) pricers and capacity logic</li>
              <li>Any haircuts, oracle, or circuit-breaker bypass</li>
            </ul>
          </Card>

          <Card className="p-6">
            <h3 className="font-serif text-lg mb-2 text-primary-t">Out of scope</h3>
            <ul className="list-disc list-inside space-y-2 text-secondary-t text-sm">
              <li>
                Front-end UI bugs that do not affect contract state — report these in our{" "}
                <a
                  href="https://matrix.to/#/#shit-finance:matrix.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green underline"
                >
                  Matrix group
                </a>
              </li>
              <li>Third-party dependencies unless they directly put treasury funds at risk</li>
              <li>Known testnet-only behavior that is already documented</li>
              <li>Social engineering, phishing, or infrastructure attacks</li>
              <li>Denial-of-service that does not lead to loss of funds</li>
            </ul>
          </Card>
        </div>
      </div>

      <div className="mb-10">
        <h2 className="font-serif text-2xl mb-4 text-primary-t">Rewards</h2>
        <p className="text-secondary-t mb-4 text-sm">
          Rewards are paid in testnet SHIT. Severity is decided by the core team after a
          public or private report. A future mainnet allocation weight is also assigned
          based on severity and report quality.
        </p>
        <div className="overflow-x-auto rounded-2xl border border-a10-b">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-surface-a5 text-left">
                <th className="p-3 border-b border-a10-b text-primary-t">Severity</th>
                <th className="p-3 border-b border-a10-b text-primary-t">Examples</th>
                <th className="p-3 border-b border-a10-b text-primary-t">Reward</th>
              </tr>
            </thead>
            <tbody className="text-secondary-t">
              {SEVERITY_ROWS.map((row) => (
                <tr key={row.severity} className="border-b border-a10-b last:border-b-0">
                  <td className="p-3 align-top font-semibold text-primary-t">{row.severity}</td>
                  <td className="p-3 align-top">{row.examples}</td>
                  <td className="p-3 align-top">{row.reward}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-10">
        <Card className="p-6">
          <h3 className="font-serif text-xl mb-2 text-primary-t">Rules</h3>
          <ol className="list-decimal list-inside space-y-2 text-secondary-t text-sm">
            <li>Only test on Base Sepolia.</li>
            <li>Do not exploit the protocol for profit outside of the bounty.</li>
            <li>Do not publicly disclose a bug before the fix is live and we agree on disclosure.</li>
            <li>Do not attack other users, infrastructure, or third-party services.</li>
            <li>Provide a clear proof-of-concept and reproduction steps.</li>
            <li>We reserve the right to determine final severity and eligibility.</li>
          </ol>
        </Card>

        <Card className="p-6">
          <h3 className="font-serif text-xl mb-2 text-primary-t">What makes a good report</h3>
          <ul className="list-disc list-inside space-y-2 text-secondary-t text-sm">
            <li>Contract and function affected</li>
            <li>Exact transaction, script, or test case to reproduce</li>
            <li>Demonstrated impact, not just a hunch</li>
            <li>Suggested fix or mitigation</li>
            <li>Address to receive testnet rewards</li>
          </ul>
        </Card>
      </div>

      <Card className="p-8 text-center bg-surface-a5 border border-a10-b mb-10">
        <h2 className="font-serif text-2xl mb-2 text-primary-t">Report a bug</h2>
        <p className="text-secondary-t text-sm mb-6 max-w-xl mx-auto">
          Report bugs in our Matrix group. Include a Base Sepolia testnet address if you want
          to receive rewards.
        </p>
        <a
          href="https://matrix.to/#/#shit-finance:matrix.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="default" size="lg">
            Open Matrix group
          </Button>
        </a>
      </Card>

      <div className="text-sm text-tertiary-t">
        <p>
          Base Sepolia chain ID for testing: {baseSepolia.id}. The deployed contract
          addresses are shown on the live Treasury page so you can verify which contracts
          are in scope.
        </p>
      </div>
    </div>
  );
}
