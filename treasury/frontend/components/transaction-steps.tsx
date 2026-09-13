import { Link } from "react-router";
import { CheckIcon, ExternalLink, Info, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui-dialog";
import { Button } from "@/components/ui-button";
import { blockExplorerTxBaseUrl, formatTxHash } from "@/lib/helpers";

/** One transaction in a multi-step modal flow. */
export type TransactionStep = {
  number: number;
  title: string;
  badges?: { label: string }[];
  isActive: boolean;
  isCompleted: boolean;
  isLoading: boolean;
  hash?: `0x${string}`;
};

function StepHashLink({ hash, className }: { hash: `0x${string}`; className?: string }) {
  return (
    <Link
      target="_blank"
      rel="noopener noreferrer"
      to={`${blockExplorerTxBaseUrl}${hash}`}
      className={className ?? "flex items-center gap-1 text-xs text-blue hover:text-blue-800 mt-1"}
    >
      {formatTxHash(hash)}
      <ExternalLink className="h-3 w-3" />
    </Link>
  );
}

function StepBadges({ badges, wrap }: { badges: { label: string }[]; wrap?: boolean }) {
  return (
    <div className={wrap ? "flex flex-wrap gap-1 mt-1" : "flex gap-1 mt-1"}>
      {badges.map((badge) => (
        <span
          key={badge.label}
          className="text-xs text-secondary-t rounded-full border px-2 py-0.5 border-a10-b"
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Success dialog shown once a flow's final transaction confirms. Renders the completed
 * steps summary when `steps` are given, or a single tx-hash link for one-shot flows.
 */
export function TransactionSuccessDialog({
  isOpen,
  onClose,
  title,
  description,
  steps,
  hash,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  steps?: TransactionStep[];
  hash?: `0x${string}`;
}) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-full sm:max-w-md mx-auto p-6 gap-6">
        <div className="text-center">
          <div className="w-16 h-16 bg-green/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckIcon className="h-8 w-8 text-green" />
          </div>
          <DialogTitle className="text-xl font-semibold mb-2">{title}</DialogTitle>
          <p className={steps ? "text-sm text-secondary-t mb-6" : "text-sm text-secondary-t mb-2"}>
            {description}
          </p>
          {!steps && hash && (
            <StepHashLink
              hash={hash}
              className="inline-flex items-center gap-1 text-sm text-blue hover:text-blue-800"
            />
          )}
        </div>

        {steps && (
          <div className="bg-surface-a3 border border-a3-b rounded-3xl">
            {steps.map((step, index) => (
              <div key={step.number}>
                <div className="flex items-center gap-3 p-4">
                  <div className="w-6 h-6 rounded-full bg-green/20 flex items-center justify-center shrink-0">
                    <CheckIcon className="h-4 w-4 text-green" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">{step.title}</div>
                    {step.badges && <StepBadges badges={step.badges} wrap />}
                    {step.hash && <StepHashLink hash={step.hash} />}
                  </div>
                </div>
                {index < steps.length - 1 && <div className="border-b border-a5-b mx-4" />}
              </div>
            ))}
          </div>
        )}

        <Button onClick={onClose} className="w-full">
          Close
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/**
 * In-progress dialog for a multi-transaction flow: numbered step indicators, an optional
 * "don't close this modal" notice while the final tx is pending, and a single action
 * button whose label/handler the caller derives from the current step.
 */
export function TransactionStepperDialog({
  isOpen,
  onClose,
  title,
  currentStep,
  steps,
  showBusyNotice,
  button,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  currentStep: number;
  steps: TransactionStep[];
  /** Show the "don't close this modal" notice (typically while the final tx is pending). */
  showBusyNotice?: boolean;
  button: {
    label: string;
    /** Label rendered with a spinner while `isBusy`. */
    busyLabel: string;
    isBusy: boolean;
    onClick: () => void;
  };
}) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-full sm:max-w-md mx-auto p-0 gap-0 !rounded-3xl">
        <DialogHeader className="px-6 pt-6 pb-2 text-center !gap-6">
          <DialogTitle className="text-[20px]/[24px] font-semibold text-primary-t">
            {title}
          </DialogTitle>
          <p className="text-xs/4 font-normal text-secondary-t">
            Transaction {currentStep}/{steps.length}. Proceed with your wallet.
          </p>
        </DialogHeader>

        <div className="px-6 pb-6">
          <div className="bg-surface-a3 border border-a3-b rounded-3xl">
            {steps.map((step, index) => (
              <div key={step.number}>
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center text-xs font-medium ${
                        step.isCompleted
                          ? "text-green border-green"
                          : step.isActive
                            ? "text-primary-t border-primary-t"
                            : "text-secondary-t border-a10-b"
                      }`}
                    >
                      {step.isLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : step.isCompleted ? (
                        <CheckIcon className="h-3 w-3" />
                      ) : (
                        step.number
                      )}
                    </div>
                    <div>
                      <div className="text-sm/5 font-semibold text-primary-t">{step.title}</div>
                      {step.badges && <StepBadges badges={step.badges} />}
                      {step.isCompleted && step.hash && <StepHashLink hash={step.hash} />}
                    </div>
                  </div>
                </div>
                {index < steps.length - 1 && <div className="border-b border-a5-b mx-4" />}
              </div>
            ))}
          </div>

          {showBusyNotice && (
            <div className="mt-4 flex items-start gap-2 bg-blue/10 border border-blue/20 rounded-xl p-3">
              <Info className="w-4 h-4 text-blue mt-0.5 shrink-0" />
              <p className="text-sm text-primary-t">
                Please don't close this modal until all wallet transactions are confirmed.
              </p>
            </div>
          )}

          <div className="mt-6">
            <Button onClick={button.onClick} disabled={button.isBusy} className="w-full">
              {button.isBusy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {button.busyLabel}
                </>
              ) : (
                button.label
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
