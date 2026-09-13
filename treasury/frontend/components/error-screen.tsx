import { RefreshCw } from "lucide-react";
import { Icon } from "@/components/icon.tsx";
import { Button } from "@/components/ui-button";

interface ErrorScreenProps {
  /** Error to display. Stack trace is only shown in dev. */
  error?: Error;
  /**
   * Reset handler — typically clears local error state and re-renders.
   * If not provided, the "Try again" button is hidden.
   */
  onReset?: () => void;
}

/**
 * Branded full-screen error UI. Used by both the React error boundary
 * (`<ErrorBoundary>`) and the React Router error element.
 */
export function ErrorScreen({ error, onReset }: ErrorScreenProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-surface-bg-l1">
      <div className="max-w-lg w-full text-center space-y-8">
        {/* 5H1T Logo and Branding */}
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-x-[10px]">
            <Icon name="SHITTokenIcon" className="text-primary-t" size={40} />
            <div className="text-3xl font-bold text-primary-t">5H1T</div>
          </div>
        </div>

        {/* Error Message */}
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold text-primary-t">Oops! Something went wrong</h1>
          <p className="text-secondary-t max-w-md mx-auto">
            We encountered an unexpected error. Please try again or refresh the page.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
          {onReset && (
            <Button onClick={onReset} variant="default" size="md">
              <RefreshCw className="size-4" />
              Try again
            </Button>
          )}
          <Button onClick={() => window.location.reload()} variant="secondary" size="md">
            Refresh page
          </Button>
        </div>

        {/* Development Error Details */}
        {error && (
          <details className="text-left mt-8" open>
            <summary className="text-sm cursor-pointer text-secondary-t hover:text-primary-t mb-2">
              🔧 Error Details
            </summary>
            <div className="bg-surface-a3 rounded-lg p-4 border border-a10-b">
              <pre className="text-xs overflow-auto text-primary-t whitespace-pre-wrap">
                {error.stack ?? error.message}
              </pre>
            </div>
          </details>
        )}

        {/* Footer */}
        <p className="text-xs text-tertiary-t mt-8">
          If this problem continues, please contact the 5H1T team
        </p>
      </div>
    </div>
  );
}
