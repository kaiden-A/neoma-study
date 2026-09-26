"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

/** Thin amber progress line under the top of the viewport.
 *
 * The state lives in a module store instead of component state so the click
 * listener and the pathname watcher can both drive it without a setState in an
 * effect. The bar is armed only after 150ms, so instant prefetched
 * navigations never flash it. */

type Phase = "idle" | "arming" | "active" | "done";

let phase: Phase = "idle";
let armTimer: ReturnType<typeof setTimeout> | null = null;
let guardTimer: ReturnType<typeof setTimeout> | null = null;
let doneTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function getPhase(): Phase {
  return phase;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function clearTimers() {
  if (armTimer) clearTimeout(armTimer);
  if (guardTimer) clearTimeout(guardTimer);
  armTimer = null;
  guardTimer = null;
}

function start() {
  if (phase === "arming" || phase === "active") return;
  if (doneTimer) {
    clearTimeout(doneTimer);
    doneTimer = null;
  }
  phase = "arming";
  emit();
  armTimer = setTimeout(() => {
    armTimer = null;
    phase = "active";
    emit();
  }, 150);
  // If the navigation never lands (blocked, cancelled), stop pretending.
  guardTimer = setTimeout(finish, 6000);
}

function finish() {
  clearTimers();
  if (phase === "idle") return;
  phase = "done";
  emit();
  doneTimer = setTimeout(() => {
    doneTimer = null;
    phase = "idle";
    emit();
  }, 350);
}

export function RouteProgress() {
  const pathname = usePathname();
  const current = useSyncExternalStore(subscribe, getPhase, () => "idle" as Phase);

  useEffect(() => {
    // The route changed: the navigation landed.
    finish();
  }, [pathname]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest?.("a");
      if (!anchor) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || !href.startsWith("/")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      start();
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  if (current === "idle") return null;

  return (
    <div
      className={`nm-progress${current === "active" ? " is-active" : ""}${current === "done" ? " is-done" : ""}`}
      aria-hidden="true"
    >
      <span className="nm-progress-bar" />
    </div>
  );
}
