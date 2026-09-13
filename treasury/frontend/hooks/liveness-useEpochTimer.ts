import { useState, useEffect } from "react";
import { getEpochTimeRemaining, getCurrentWeekEpoch } from "@/lib/liveness-epoch";
import { EPOCHS_PER_WEEK } from "@/lib/constants";

interface EpochTimerState {
  hours: number;
  minutes: number;
  seconds: number;
  progress: number;
  currentEpoch: number;
  epochsPerWeek: number;
  weekProgress: number;
}

export function useEpochTimer(): EpochTimerState {
  const [state, setState] = useState<EpochTimerState>(() => {
    const remaining = getEpochTimeRemaining();
    const currentEpoch = getCurrentWeekEpoch();
    return {
      ...remaining,
      currentEpoch,
      epochsPerWeek: EPOCHS_PER_WEEK,
      weekProgress: (currentEpoch / EPOCHS_PER_WEEK) * 100,
    };
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = getEpochTimeRemaining();
      const currentEpoch = getCurrentWeekEpoch();
      setState({
        ...remaining,
        currentEpoch,
        epochsPerWeek: EPOCHS_PER_WEEK,
        weekProgress: (currentEpoch / EPOCHS_PER_WEEK) * 100,
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return state;
}
