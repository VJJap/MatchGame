import { useEffect, useState } from 'react';

/** Re-render every `ms` while `active` (used for timers). Returns performance.now(). */
export function useNow(ms = 100, active = true): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    setNow(performance.now());
    const id = setInterval(() => setNow(performance.now()), ms);
    return () => clearInterval(id);
  }, [ms, active]);
  return now;
}

/** Same as useNow but in Date.now() time (for wall-clock deadlines). */
export function useClock(ms = 500, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms, active]);
  return now;
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function hasFinePointer(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(pointer: fine)').matches;
}
