import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState } from "react";

export type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
  theme: "system",
  resolvedTheme: "dark",
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

/**
 * Suppress CSS transitions for a single frame so that swapping the theme class
 * does not trigger mid-transition animations on shadows, backgrounds, etc.
 * Pattern borrowed from next-themes.
 *
 * Do NOT suppress `animation` here: Base UI detects popup close via
 * `element.getAnimations().finished`, so cancelling an in-flight exit animation
 * leaves the popup mounted forever (e.g. stuck tooltips on theme switch).
 */
function disableTransitionsOnce() {
  const style = document.createElement("style");
  style.appendChild(
    document.createTextNode(
      "*,*::before,*::after{-webkit-transition:none!important;transition:none!important}",
    ),
  );
  document.head.appendChild(style);
  // Force a reflow so the style takes effect before the class swap.
  (() => window.getComputedStyle(document.body))();
  window.setTimeout(() => {
    document.head.removeChild(style);
  }, 1);
}

export function ThemeProvider({
  children,
  defaultTheme = "dark",
  storageKey = "shit-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme,
  );

  const resolvedTheme = useMemo<"light" | "dark">(() => {
    if (theme === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return theme;
  }, [theme]);

  const isFirstRun = useRef(true);

  useLayoutEffect(() => {
    const root = window.document.documentElement;
    // Skip the transition kill on the first run — the class is already set by the
    // blocking script in index.html, so there is nothing to animate away from.
    if (!isFirstRun.current) {
      disableTransitionsOnce();
    }
    isFirstRun.current = false;
    root.classList.remove("light", "dark");
    root.classList.add(resolvedTheme);
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  const value = useMemo<ThemeProviderState>(
    () => ({
      theme,
      resolvedTheme,
      setTheme: (next: Theme) => {
        localStorage.setItem(storageKey, next);
        setTheme(next);
      },
    }),
    [theme, resolvedTheme, storageKey],
  );

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined) throw new Error("useTheme must be used within a ThemeProvider");

  return context;
};
