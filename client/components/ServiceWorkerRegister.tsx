"use client";

import { useEffect } from "react";

/** Registers the service worker that makes Neoma installable and serves the
 * offline page. Production only: in dev a stale worker fights Turbopack HMR. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration is best effort; the app works without it.
    });
  }, []);

  return null;
}
