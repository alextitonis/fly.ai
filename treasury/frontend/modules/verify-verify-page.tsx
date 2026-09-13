import { useEffect, useState, useRef, useCallback } from "react";
import { ConnectButton } from "@/components/connect-button";
import { usePrivySignMessage } from "@/hooks/use-privy-sign";
import { useConnectedAddress } from "@/hooks/use-connected-address";
import { trackShareClick } from "@/lib/analytics";

const WORKER_URL = import.meta.env.VITE_WALLET_VERIFY_WORKER_URL || "";

type Status = "idle" | "loading" | "success" | "error";

export function VerifyPage() {
  const { address, isConnected, chainId } = useConnectedAddress();
  const { signMessageAsync } = usePrivySignMessage();
  const [status, setStatus] = useState<Status>("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [step1Done, setStep1Done] = useState(false);
  const [step2Done, setStep2Done] = useState(false);
  const [verifiedAddress, setVerifiedAddress] = useState("");
  const verifyInProgress = useRef(false);

  const session = new URLSearchParams(window.location.hash.split("?")[1] || "").get("session");

  useEffect(() => {
    if (!session) {
      setStatus("error");
      setStatusMsg("No session ID found in URL. Please use the link provided by the bot.");
    }
    if (!WORKER_URL) {
      setStatus("error");
      setStatusMsg("Configuration error: worker URL not set.");
    }
  }, [session]);

  useEffect(() => {
    if (isConnected && address && session && WORKER_URL) {
      setStep1Done(true);
      setStatus("idle");
      setStatusMsg("");
    }
  }, [isConnected, address, session]);

  const checkVerificationStatus = useCallback(async () => {
    if (!session || !WORKER_URL) return false;
    try {
      const res = await fetch(`${WORKER_URL}/status/${session}`);
      if (res.ok) {
        const data = await res.json();
        if (data.verified && data.address) {
          setStep2Done(true);
          setStatus("success");
          setStatusMsg("Wallet verified! You can close this page and return to Matrix.");
          setVerifiedAddress(data.address);
          return true;
        }
      }
    } catch {}
    return false;
  }, [session]);

  const signAndVerify = useCallback(async () => {
    if (!address || !session || verifyInProgress.current) return;
    verifyInProgress.current = true;
    setStatus("loading");
    setStatusMsg("Fetching nonce...");

    try {
      const nonceRes = await fetch(`${WORKER_URL}/nonce/${session}`);
      if (!nonceRes.ok) throw new Error("Failed to fetch nonce");
      const { nonce } = await nonceRes.json();

      const siweMessage = `${window.location.host} wants you to sign in with your Ethereum account:
${address}

I accept the Matrix onboarding verification.

URI: ${window.location.origin}
Version: 1
Chain ID: ${chainId || 1}
Nonce: ${nonce}
Issued At: ${new Date().toISOString()}`;

      setStatusMsg("Please sign the verification message in your wallet...");

      let signature: string | null = null;
      try {
        const signPromise = signMessageAsync({ message: siweMessage });
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Signature timeout")), 120000),
        );
        signature = await Promise.race([signPromise, timeoutPromise]);
      } catch (signErr) {
        if (signErr instanceof Error && signErr.message === "Signature timeout") {
          setStatusMsg("Signature timed out. Checking if verification completed...");
          const verified = await checkVerificationStatus();
          if (verified) {
            verifyInProgress.current = false;
            return;
          }
          throw new Error("Signature timed out. Please try again.");
        }
        throw signErr;
      }

      if (!signature) throw new Error("No signature received");

      setStatusMsg("Verifying signature...");
      const verifyRes = await fetch(`${WORKER_URL}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session, message: siweMessage, signature, address }),
      });
      const data = await verifyRes.json();

      if (verifyRes.ok && data.success) {
        setStep2Done(true);
        setStatus("success");
        setStatusMsg("Wallet verified! You can close this page and return to Matrix.");
        setVerifiedAddress(data.address);
      } else {
        setStatus("error");
        setStatusMsg(data.error || "Verification failed");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (msg.includes("User rejected") || msg.includes("rejected")) {
        setStatus("idle");
        setStatusMsg("Signature rejected. Click the button to try again.");
      } else {
        setStatus("error");
        setStatusMsg(msg);
      }
    } finally {
      verifyInProgress.current = false;
    }
  }, [address, session, chainId, signMessageAsync, checkVerificationStatus]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] px-4">
      <div className="w-full max-w-md text-center">
        <div className="text-3xl font-bold mb-1 bg-gradient-to-br from-indigo-500 to-purple-500 bg-clip-text text-transparent">
          5H1T
        </div>
        <div className="text-gray-500 text-sm mb-8">Verify your wallet to complete onboarding</div>

        <div className="bg-[#15151f] border border-[#25253a] rounded-2xl p-6 mb-6 text-left">
          <div
            className={`flex items-center gap-3 py-3 border-b border-[#1e1e2e] ${step1Done ? "opacity-60" : ""}`}
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${step1Done ? "bg-green-500 text-white" : "bg-[#25253a] text-indigo-400"}`}
            >
              {step1Done ? "✓" : "1"}
            </div>
            <div
              className={`text-sm ${step1Done ? "text-green-500 line-through" : "text-gray-400"}`}
            >
              Connect your wallet
            </div>
          </div>
          <div
            className={`flex items-center gap-3 py-3 border-b border-[#1e1e2e] ${step2Done ? "opacity-60" : ""}`}
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${step2Done ? "bg-green-500 text-white" : "bg-[#25253a] text-indigo-400"}`}
            >
              {step2Done ? "✓" : "2"}
            </div>
            <div
              className={`text-sm ${step2Done ? "text-green-500 line-through" : "text-gray-400"}`}
            >
              Sign the verification message
            </div>
          </div>
          <div className="flex items-center gap-3 py-3">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${status === "success" ? "bg-green-500 text-white" : "bg-[#25253a] text-indigo-400"}`}
            >
              {status === "success" ? "✓" : "3"}
            </div>
            <div className={`text-sm ${status === "success" ? "text-green-500" : "text-gray-400"}`}>
              Return to Matrix — you're verified!
            </div>
          </div>
        </div>

        <div className="mb-6">
          <ConnectButton />
        </div>

        {isConnected && !step2Done && status !== "loading" && status !== "success" && (
          <button
            onClick={signAndVerify}
            className="mb-4 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors"
          >
            Sign &amp; Verify Wallet
          </button>
        )}

        {status === "loading" && (
          <button
            onClick={() => {
              setStatus("idle");
              setStatusMsg("");
            }}
            className="mb-4 px-4 py-2 text-sm text-gray-400 hover:text-gray-300 underline"
          >
            Cancel / Retry
          </button>
        )}

        {status === "error" && (
          <button
            onClick={signAndVerify}
            className="mb-4 px-4 py-2 text-sm text-indigo-400 hover:text-indigo-300 underline"
          >
            Try Again
          </button>
        )}

        {status !== "idle" && (
          <div
            className={`mt-4 p-4 rounded-lg text-sm ${
              status === "success"
                ? "bg-green-500/10 border border-green-500/30 text-green-500"
                : status === "error"
                  ? "bg-red-500/10 border border-red-500/30 text-red-500"
                  : "bg-indigo-500/10 border border-indigo-500/30 text-indigo-400"
            }`}
          >
            {statusMsg}
          </div>
        )}

        {verifiedAddress && (
          <div className="mt-4 font-mono text-sm text-indigo-400 break-all">
            Verified: {verifiedAddress}
          </div>
        )}

        {status === "success" && (
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent("Just verified my wallet on @shitfinance — a decentralized treasury protocol on Base 🌱")}&url=${encodeURIComponent("https://shit.finance")}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackShareClick({ platform: "twitter", content_type: "verify_success" })}
            className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 bg-[#1DA1F2] hover:bg-[#1a91da] text-white text-sm font-semibold rounded-xl transition-colors"
          >
            <svg className="size-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            Share on Twitter
          </a>
        )}

        <div className="mt-8 text-gray-600 text-xs">
          Powered by WalletConnect &amp; Sign-In with Ethereum
        </div>
      </div>
    </div>
  );
}
