import { useEffect } from "react";
import posthog from "posthog-js";

function isChunkLoadError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("error loading dynamically imported module")
  );
}

function handleChunkLoadError(error: unknown) {
  posthog.captureException(error instanceof Error ? error : new Error(String(error)), {
    source: "chunk-load-failure",
  });
  // Auto-reload after a short delay — the chunk may have been redeployed
  setTimeout(() => {
    window.location.reload();
  }, 1500);
}

export function useGlobalErrorHandler() {
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      if (reason?.message?.includes("User rejected")) return;
      if (isChunkLoadError(reason)) {
        handleChunkLoadError(reason);
        return;
      }
      posthog.captureException(reason instanceof Error ? reason : new Error(String(reason)));
    };

    const handleError = (event: ErrorEvent) => {
      if (event.error) {
        if (isChunkLoadError(event.error)) {
          handleChunkLoadError(event.error);
          return;
        }
        posthog.captureException(event.error);
      } else if (event.message && isChunkLoadError(event.message)) {
        handleChunkLoadError(new Error(event.message));
      }
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("error", handleError);

    return () => {
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      window.removeEventListener("error", handleError);
    };
  }, []);
}
