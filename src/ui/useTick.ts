import { useEffect, useState } from 'react';

/** Re-renders the calling component every `ms` so it can sample `runtime`. */
export function useTick(ms: number): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => (n + 1) % 1_000_000), ms);
    return () => clearInterval(id);
  }, [ms]);
  return tick;
}
