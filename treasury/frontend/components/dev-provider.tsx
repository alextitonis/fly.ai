import { DevMockProvider } from "@/lib/mock-provider";
import { DevToolbar } from "@/components/dev-toolbar";

export function DevProvider({ children }: { children: React.ReactNode }) {
  if (import.meta.env.DEV) {
    return (
      <DevMockProvider>
        {children}
        <DevToolbar />
      </DevMockProvider>
    );
  }
  return <>{children}</>;
}
