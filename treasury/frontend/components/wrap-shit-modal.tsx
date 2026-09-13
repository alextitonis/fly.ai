import { useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui-dialog";
import { Button } from "@/components/ui-button";
import { CheckIcon, Loader2, ExternalLink, Info, XCircle } from "lucide-react";
import { useConnectedAddress } from "@/hooks/use-connected-address";
import { trackWrapFlow, trackTransactionFailed } from "@/lib/analytics";
import { useWrapFlowSequence, type SeqStep } from "@/hooks/use-wrap-flow-sequence";
import { TOKENS } from "@/lib/tokens";
import { parseTokenAmount } from "@/lib/utils-token-amount";
import { Link } from "react-router";
import { blockExplorerTxBaseUrl } from "@/lib/helpers";
import { WRAP_FLOWS, type WrapFlow } from "@/modules/shit-wrap-flows";

interface WrapshitModalProps {
  isOpen: boolean;
  onClose: () => void;
  flow: WrapFlow;
  inputAmount: string;
  outputAmount: string;
}

export function WrapshitModal({
  isOpen,
  onClose,
  flow,
  inputAmount,
  outputAmount,
}: WrapshitModalProps) {
  const { address } = useConnectedAddress();
  console.log("[wrap-modal] render", { flow, isOpen, address, inputAmount });

  const { input, output, copy, analyticsAction } = WRAP_FLOWS[flow];
  const inputSymbol = TOKENS[input].symbol;
  const outputSymbol = TOKENS[output].symbol;

  const amountBigInt = parseTokenAmount(inputAmount, TOKENS[input].decimals);

  // Sequential multi-transaction executor (handles approve → call → approve → call).
  const { steps, run, reset, running, done, error } = useWrapFlowSequence(flow, amountBigInt);

  // Reset the sequence each time the modal is (re)opened.
  useEffect(() => {
    if (isOpen) reset();
  }, [isOpen, reset]);

  useEffect(() => {
    if (!done) return;
    trackWrapFlow({ action: analyticsAction, amount: inputAmount });
  }, [done]);

  useEffect(() => {
    if (!error) return;
    const reason = error.message?.toLowerCase().includes("reject") ? "user_rejected" : "error";
    trackTransactionFailed("shit", analyticsAction, { reason });
  }, [error]);

  const formatTxHash = (hash?: `0x${string}`) => {
    if (!hash) return "";
    return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
  };

  const capDecimals = (value: string, maxDecimals = 4) => {
    const [integer, decimal] = value.split(".");
    if (!decimal) return value;
    return `${integer}.${decimal.slice(0, maxDecimals)}`;
  };

  const { title: modalTitle, action: executeLabel } = copy;
  const executingLabel = WRAP_FLOWS[flow].toast.progressive;

  const activeIndex = steps.findIndex((s) => s.status === "wallet" || s.status === "confirming");
  const totalSteps = steps.length;

  const statusIcon = (step: SeqStep, index: number) => {
    if (step.status === "done") return <CheckIcon className="h-3 w-3" />;
    if (step.status === "error") return <XCircle className="h-3 w-3" />;
    if (step.status === "wallet" || step.status === "confirming")
      return <Loader2 className="h-3 w-3 animate-spin" />;
    return index + 1;
  };

  const statusClass = (step: SeqStep) =>
    step.status === "done"
      ? "text-green border-green"
      : step.status === "error"
        ? "text-red-500 border-red-500"
        : step.status === "wallet" || step.status === "confirming"
          ? "text-primary-t border-primary-t"
          : "text-secondary-t border-a10-b";

  // Success state
  if (done) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="w-full sm:max-w-md mx-auto p-6 gap-6 ">
          <div className="text-center">
            <div className="w-16 h-16 bg-green/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckIcon className="h-8 w-8 text-green" />
            </div>
            <DialogTitle className="text-xl font-semibold mb-2">Congrats, all done!</DialogTitle>
            <p className="text-sm text-secondary-t mb-6">Your transactions have been executed.</p>
          </div>

          <div className="bg-surface-a3 border border-a3-b rounded-3xl">
            {steps.map((step, index) => (
              <div key={step.id}>
                <div className="flex items-center gap-3 p-4">
                  <div className="w-6 h-6 rounded-full bg-green/20 flex items-center justify-center shrink-0">
                    <CheckIcon className="h-4 w-4 text-green" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">{step.label}</div>
                    {step.hash && (
                      <Link
                        target="_blank"
                        to={`${blockExplorerTxBaseUrl}${step.hash}`}
                        className="flex items-center gap-1 text-xs text-blue hover:text-blue-800 mt-1"
                      >
                        {formatTxHash(step.hash)}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                </div>
                {index < steps.length - 1 && <div className="border-b border-a5-b mx-4" />}
              </div>
            ))}
          </div>

          <Button onClick={onClose} className="w-full">
            Close
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  // Steps view
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="w-full sm:max-w-md mx-auto p-0 gap-0 !rounded-3xl">
        <DialogHeader className="px-6 pt-6 pb-2 text-center !gap-6">
          <DialogTitle className="text-[20px]/[24px] font-semibold text-primary-t">
            {modalTitle}
          </DialogTitle>
          <p className="text-xs/4 font-normal text-secondary-t">
            {totalSteps} transaction{totalSteps === 1 ? "" : "s"}. Confirm each in your wallet.
          </p>
        </DialogHeader>

        <div className="px-6 pb-6">
          {/* Amount summary */}
          <div className="flex flex-wrap gap-1 mb-4 justify-center">
            <span className="text-xs text-secondary-t rounded-full border px-2 py-0.5 border-a10-b">
              -{capDecimals(inputAmount)} {inputSymbol}
            </span>
            <span className="text-xs text-secondary-t rounded-full border px-2 py-0.5 border-a10-b">
              +{capDecimals(outputAmount)} {outputSymbol}
            </span>
          </div>

          <div className="bg-surface-a3 border border-a3-b rounded-3xl">
            {steps.map((step, index) => (
              <div key={step.id}>
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center text-xs font-medium ${statusClass(step)}`}
                    >
                      {statusIcon(step, index)}
                    </div>
                    <div>
                      <div className="text-sm/5 font-semibold text-primary-t">{step.label}</div>
                      {step.status === "done" && step.hash && (
                        <Link
                          target="_blank"
                          to={`${blockExplorerTxBaseUrl}${step.hash}`}
                          className="flex items-center gap-1 text-xs text-blue hover:text-blue-800 mt-1"
                        >
                          {formatTxHash(step.hash)}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
                {index < steps.length - 1 && <div className="border-b border-a5-b mx-4" />}
              </div>
            ))}
          </div>

          {/* Warning during execution */}
          {running && (
            <div className="mt-4 flex items-start gap-2 bg-blue/10 border border-blue/20 rounded-xl p-3">
              <Info className="w-4 h-4 text-blue mt-0.5 shrink-0" />
              <p className="text-sm text-primary-t">
                Please don't close this modal until all wallet transactions are confirmed.
              </p>
            </div>
          )}

          {/* Error */}
          {error && !running && (
            <div className="mt-4 flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-primary-t break-words">{error.message}</p>
            </div>
          )}

          <div className="mt-6">
            <Button
              onClick={() => {
                console.log("[wrap-modal] button clicked", { running, address });
                run();
              }}
              disabled={running || !address}
              className="w-full"
            >
              {running ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {executingLabel} — step {activeIndex + 1}/{totalSteps}
                </>
              ) : error ? (
                "Try Again"
              ) : (
                executeLabel
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
