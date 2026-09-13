import { useState, useEffect, useCallback } from "react";
import { useChainId, useSwitchChain } from "wagmi";
import { usePrivySignMessage } from "@/hooks/use-privy-sign";
import { useConnectedAddress } from "@/hooks/use-connected-address";
import { verifyMessage } from "viem";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import {
  RiCheckLine,
  RiTwitterXLine,
  RiCloudLine,
  RiWallet3Line,
  RiShieldCheckLine,
  RiFileCopyLine,
  RiCheckboxCircleLine,
  RiGroupLine,
} from "@remixicon/react";
import { Card } from "@/components/ui-card";
import { Button } from "@/components/ui-button";
import { Input } from "@/components/ui-input";
import { ConnectButton } from "@/components/connect-button";
import { SHITLogo } from "@/components/shit-logo";
import { cn } from "@/lib/utils";
import { activeChains } from "@/lib/chains.ts";

type Status = "idle" | "signing" | "success" | "error";

type FormData = {
  twitter: string;
  bluesky: string;
};

type WhitelistEntry = {
  address: string;
  twitter?: string;
  bluesky?: string;
  timestamp: string;
};

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function buildMessage(address: string, twitter: string, bluesky: string): string {
  return [
    "5H1T Whitelist Registration",
    "",
    "I confirm that I want to join the 5H1T whitelist.",
    `Wallet: ${address}`,
    `Twitter: ${twitter || "N/A"}`,
    `Bluesky: ${bluesky || "N/A"}`,
    `Timestamp: ${new Date().toISOString()}`,
    "",
    "This signature proves wallet ownership. No transaction is made.",
  ].join("\n");
}

export function WhitelistPage() {
  const { address, isConnected } = useConnectedAddress();
  const { signMessageAsync } = usePrivySignMessage();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const [status, setStatus] = useState<Status>("idle");
  const [signature, setSignature] = useState<string | null>(null);
  const [entries, setEntries] = useState<WhitelistEntry[]>([]);
  const [signerCount, setSignerCount] = useState(0);
  const [alreadySigned, setAlreadySigned] = useState(false);

  const expectedChainId = activeChains[0].id;
  const isWrongNetwork = isConnected && chainId !== expectedChainId;

  const {
    register,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: { twitter: "", bluesky: "" },
  });

  const twitter = watch("twitter");
  const bluesky = watch("bluesky");

  useEffect(() => {
    fetch("/api/whitelist/join")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setEntries(data.entries);
          setSignerCount(data.count);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (address) {
      fetch(`/api/whitelist/join?address=${address}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.ok) setAlreadySigned(data.signed);
        })
        .catch(() => {});
    } else {
      setAlreadySigned(false);
    }
  }, [address]);

  useEffect(() => {
    if (status === "success") {
      confetti({
        particleCount: 120,
        spread: 70,
        origin: { y: 0.6 },
        colors: ["#10b981", "#fbbf24", "#3b82f6", "#fff"],
      });
    }
  }, [status]);

  const handleSign = useCallback(async () => {
    if (!address || isWrongNetwork) return;
    setStatus("signing");
    try {
      const message = buildMessage(address, twitter, bluesky);
      const sig = await signMessageAsync({ message });
      const valid = await verifyMessage({ address, message, signature: sig });
      if (!valid) {
        throw new Error("Signature verification failed");
      }
      const res = await fetch("/api/whitelist/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          signature: sig,
          twitter,
          bluesky,
        }),
      });
      const data = await res.json();
      if (!data.ok && data.error !== "Already on whitelist") {
        throw new Error(data.error || "Failed to store signature");
      }
      setSignature(sig);
      setAlreadySigned(true);
      setSignerCount((c) => c + 1);
      setEntries((prev) => [
        { address, twitter: twitter || undefined, bluesky: bluesky || undefined, timestamp: new Date().toISOString() },
        ...prev,
      ]);
      setStatus("success");
      toast.success("You're on the whitelist!");
    } catch (err) {
      setStatus("error");
      if (err instanceof Error && err.message.includes("User rejected")) {
        toast.error("Signing cancelled");
      } else {
        toast.error("Failed to join whitelist. Please try again.");
      }
    }
  }, [address, twitter, bluesky, signMessageAsync, isWrongNetwork]);

  const copyToClipboard = useCallback(async () => {
    if (!address || !signature) return;
    const text = `5H1T Whitelist\nAddress: ${address}\nSignature: ${signature}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  }, [address, signature]);

  if (status === "success") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 py-8">
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center justify-center size-16 rounded-full bg-green/20">
            <RiCheckboxCircleLine className="size-10 text-green" />
          </div>
          <h1 className="text-3xl font-serif font-semibold text-primary-t text-center">
            Welcome to the 5H1T Whitelist
          </h1>
          <p className="text-secondary-t text-center max-w-md">
            Your wallet has been verified and your spot is reserved.
          </p>
        </div>

        <Card className="w-full max-w-md p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-secondary-t">Wallet</span>
            <span className="text-sm font-mono text-primary-t">
              {address && shortenAddress(address)}
            </span>
          </div>
          {twitter && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-secondary-t">Twitter</span>
              <span className="text-sm text-primary-t">{twitter}</span>
            </div>
          )}
          {bluesky && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-secondary-t">Bluesky</span>
              <span className="text-sm text-primary-t">{bluesky}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-secondary-t">Signature</span>
            <span className="text-sm font-mono text-primary-t">
              {signature && `${signature.slice(0, 10)}...${signature.slice(-8)}`}
            </span>
          </div>
          <Button variant="secondary" size="md" onClick={copyToClipboard} className="w-full mt-2">
            <RiFileCopyLine className="size-4" />
            Copy Confirmation
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-8 py-8 max-w-2xl mx-auto">
      {/* Hero */}
      <div className="flex flex-col items-center gap-4 text-center">
        <SHITLogo className="size-16" />
        <h1 className="text-3xl md:text-4xl font-serif font-semibold text-primary-t">
          Join the 5H1T Whitelist
        </h1>
        <p className="text-secondary-t max-w-lg">
          Connect your Base wallet and sign a message to secure your spot. No gas, no
          transaction — just cryptographic proof of ownership.
        </p>
      </div>

      {/* Step 1: Sign In */}
      <Card className="w-full p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-8 rounded-full bg-surface-a10">
            <RiWallet3Line className="size-5 text-primary-t" />
          </div>
          <h2 className="text-lg font-semibold text-primary-t">Step 1 — Sign In</h2>
        </div>
        {isConnected && address ? (
          <div className="flex items-center gap-2 text-sm">
            <RiCheckLine className="size-4 text-green" />
            <span className="font-mono text-primary-t">{shortenAddress(address)}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-secondary-t">
              Connect your wallet to get started. Base network only.
            </p>
            <ConnectButton />
          </div>
        )}
      </Card>

      {/* Step 2: Social Verification (Optional) */}
      <Card className="w-full p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-8 rounded-full bg-surface-a10">
            <RiShieldCheckLine className="size-5 text-primary-t" />
          </div>
          <h2 className="text-lg font-semibold text-primary-t">
            Step 2 — Social Verification <span className="text-secondary-t text-sm font-normal">(optional)</span>
          </h2>
        </div>
        <p className="text-sm text-secondary-t">
          Link your social accounts for additional verification and early access perks.
        </p>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-secondary-t flex items-center gap-1.5" htmlFor="twitter">
              <RiTwitterXLine className="size-4" />
              Twitter handle
            </label>
            <Input
              id="twitter"
              placeholder="@yourhandle"
              {...register("twitter", {
                pattern: /^@[a-zA-Z0-9_]{1,15}$|^$/,
              })}
            />
            {errors.twitter && (
              <span className="text-xs text-red">Must start with @ and contain only letters, numbers, underscores</span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-secondary-t flex items-center gap-1.5" htmlFor="bluesky">
              <RiCloudLine className="size-4" />
              Bluesky handle
            </label>
            <Input
              id="bluesky"
              placeholder="yourhandle.bsky.social"
              {...register("bluesky", {
                pattern: /^[a-zA-Z0-9.-]+(\.bsky\.social|\.[a-zA-Z]{2,})$|^$/,
              })}
            />
            {errors.bluesky && (
              <span className="text-xs text-red">Must be a valid handle like yourhandle.bsky.social</span>
            )}
          </div>
        </div>
      </Card>

      {/* Step 3: Sign Message */}
      <Card className="w-full p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-8 rounded-full bg-surface-a10">
            <RiShieldCheckLine className="size-5 text-primary-t" />
          </div>
          <h2 className="text-lg font-semibold text-primary-t">Step 3 — Sign to Join</h2>
        </div>
        <p className="text-sm text-secondary-t">
          Sign a message with your wallet to prove ownership. This is free — no transaction,
          no gas fees.
        </p>
        {alreadySigned ? (
          <div className="flex items-center gap-2 text-sm text-green justify-center">
            <RiCheckboxCircleLine className="size-5" />
            <span>This wallet has already joined the whitelist.</span>
          </div>
        ) : isWrongNetwork ? (
          <Button
            size="lg"
            onClick={() => switchChain({ chainId: expectedChainId })}
            disabled={isSwitching}
            className="w-full"
          >
            {isSwitching ? "Switching network..." : "Switch to Base"}
          </Button>
        ) : (
          <Button
            size="lg"
            onClick={handleSign}
            disabled={!isConnected || status === "signing"}
            className={cn("w-full")}
          >
            {status === "signing" ? "Waiting for signature..." : "Sign to Join Whitelist"}
          </Button>
        )}
        {status === "error" && (
          <p className="text-sm text-red text-center">
            Something went wrong. Please try again.
          </p>
        )}
      </Card>

      {/* Signer List */}
      {entries.length > 0 && (
        <Card className="w-full p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center size-8 rounded-full bg-surface-a10">
              <RiGroupLine className="size-5 text-primary-t" />
            </div>
            <h2 className="text-lg font-semibold text-primary-t">
              Whitelist Signers
              <span className="text-secondary-t text-sm font-normal ml-2">({signerCount})</span>
            </h2>
          </div>
          <div className="flex flex-col gap-2">
            {entries.map((entry, i) => (
              <div
                key={`${entry.address}-${i}`}
                className="flex items-center justify-between py-2 px-3 rounded-xl bg-surface-a3"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-primary-t">
                    {shortenAddress(entry.address)}
                  </span>
                  {entry.twitter && (
                    <span className="text-xs text-secondary-t flex items-center gap-0.5">
                      <RiTwitterXLine className="size-3" />
                      {entry.twitter}
                    </span>
                  )}
                  {entry.bluesky && (
                    <span className="text-xs text-secondary-t flex items-center gap-0.5">
                      <RiCloudLine className="size-3" />
                      {entry.bluesky}
                    </span>
                  )}
                </div>
                <span className="text-xs text-tertiary-t">
                  {new Date(entry.timestamp).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
