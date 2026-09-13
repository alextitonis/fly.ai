import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import "@/css/index.css";
import { router } from "@/routes";
import { initializeAnalytics } from "@/lib/analytics";
import { ErrorBoundary } from "@/components/error-boundary";

initializeAnalytics();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  </StrictMode>,
);
