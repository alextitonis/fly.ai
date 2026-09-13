import { useCallback, useState } from "react";

const STORAGE_KEY = "shit-feature-tour";

type TourState = number | "completed" | "skipped";

function readState(): TourState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    if (raw === "completed" || raw === "skipped") return raw;
    const n = Number(raw);
    if (!isNaN(n)) return n;
    return null;
  } catch {
    return null;
  }
}

function writeState(state: TourState) {
  try {
    localStorage.setItem(STORAGE_KEY, String(state));
  } catch {
    // ignore
  }
}

export function useFeatureTour() {
  const [state, setState] = useState<TourState | null>(readState);

  const shouldShowModal = false;

  const startTour = useCallback(() => {
    writeState(0);
    setState(0);
  }, []);

  const skipTour = useCallback(() => {
    writeState("skipped");
    setState("skipped");
  }, []);

  const completeTour = useCallback(() => {
    writeState("completed");
    setState("completed");
  }, []);

  const saveStep = useCallback((step: number) => {
    writeState(step);
    setState(step);
  }, []);

  return { state, shouldShowModal, startTour, skipTour, completeTour, saveStep };
}
