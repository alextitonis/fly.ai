import { Component, type ReactNode } from "react";
import posthog from "posthog-js";
import { ErrorScreen } from "@/components/error-screen";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Top-level React error boundary — catches synchronous render errors that
 * aren't already handled by React Router's per-route `errorElement`.
 * Reports to PostHog so we see them in production.
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Error caught by boundary:", error);
    posthog.captureException(error, { componentStack: info.componentStack });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  public render() {
    if (this.state.hasError) {
      return <ErrorScreen error={this.state.error} onReset={this.handleReset} />;
    }
    return this.props.children;
  }
}
