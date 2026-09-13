import { Dialog, DialogContent } from "@/components/ui-dialog";
import { Button } from "@/components/ui-button";

interface FeatureTourWelcomeModalProps {
  open: boolean;
  onSkip: (method: "skip_button" | "backdrop") => void;
  onStart: () => void;
}

export function FeatureTourWelcomeModal({ open, onSkip, onStart }: FeatureTourWelcomeModalProps) {
  return (
    <Dialog
      open={open}
      disablePointerDismissal
      onOpenChange={(isOpen) => {
        if (!isOpen) onSkip("backdrop");
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="w-[448px] min-w-[448px] gap-0 p-0 overflow-hidden rounded-[40px]"
      >
        {/* Text + buttons */}
        <div className="flex flex-col px-6 py-8">
          <div className="text-center mb-6">
            <h2 className="text-[20px]/[24px] font-semibold text-primary-t mb-3">
              5H1T, Redesigned
            </h2>
            <p className="text-[14px]/[20px] font-normal text-secondary-t ">
              New navigation. Convertible Deposits built in. Pulse – a real-time view of the
              protocol. And a new way to participate.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" size="md" onClick={() => onSkip("skip_button")}>
              Skip
            </Button>
            <Button variant="default" size="md" className="flex-1" onClick={onStart}>
              Take the Tour
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
