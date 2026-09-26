"use client";

import { useSyncExternalStore } from "react";

/** Breakpoint as live state. The server snapshot is always false so the first
 * paint matches the desktop layout exactly; the real value lands on hydration
 * without a setState-in-effect. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (listener) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", listener);
      return () => list.removeEventListener("change", listener);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Phones and small tablets: the notes UI drops its desktop chrome here. */
export function useIsPhone(): boolean {
  return useMediaQuery("(max-width: 900px)");
}
