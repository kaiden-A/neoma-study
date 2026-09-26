"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

// iOS Safari has no install prompt, so the only path to the home screen is
// Share → Add to Home Screen. Show a one-line hint on iOS Safari (not in
// standalone mode) until it is dismissed.

const KEY = "neoma.install-hint";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function eligible(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return false;
  if ((window.navigator as { standalone?: boolean }).standalone) return false;
  const ua = window.navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|Chrome|Android/.test(ua);
  try {
    if (window.localStorage.getItem(KEY) === "dismissed") return false;
  } catch {
    // Storage blocked: still worth showing the hint.
  }
  return ios && safari;
}

export function InstallHint() {
  const show = useSyncExternalStore(subscribe, eligible, () => false);
  const pathname = usePathname();

  // The note page has its own fixed action bar at the bottom.
  if (!show || pathname.startsWith("/vault/")) return null;

  return (
    <div className="nm-installhint" role="note">
      <i className="fa-solid fa-arrow-up-from-bracket nm-installhint-icon" aria-hidden="true" />
      <p className="nm-installhint-text">
        Install Neoma for one-tap access: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
      </p>
      <button
        type="button"
        className="nm-installhint-close"
        aria-label="Dismiss install hint"
        onClick={() => {
          try {
            window.localStorage.setItem(KEY, "dismissed");
          } catch {
            // Dismissing is best effort.
          }
          listeners.forEach((listener) => listener());
        }}
      >
        <i className="fa-solid fa-xmark" aria-hidden="true" />
      </button>
    </div>
  );
}
