"use client";

import { useEffect, useState } from "react";

/**
 * A ticking clock for deadline UI. Reading the clock during render is impure
 * by nature, so the React Compiler rule is silenced in this one place instead
 * of in every page that shows "in 2d". The interval keeps long-open tabs
 * honest; hydration happens milliseconds after SSR, so the labels agree.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
