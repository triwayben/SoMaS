import { useEffect, useState } from "react";

/** Re-renders periodically so elapsed time can be extrapolated smoothly. */
export function useTicker(active = true, interval = 1000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setTick((tick) => tick + 1), interval);
    return () => window.clearInterval(id);
  }, [active, interval]);
}
