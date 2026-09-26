"use client";

import { EmptyState } from "@/components/ui/bits";
import { useStore } from "@/lib/store";

/** Shown when bootstrap failed twice (cold start + one auto-retry). The store's
 * retry() puts the gate back into its skeleton state. */
export function BootError() {
  const { retry } = useStore();

  return (
    <div className="nm-page" role="alert">
      <EmptyState
        icon="fa-cloud-moon"
        title="Couldn’t reach Neoma"
        body="The server may still be waking up. Your notes and tasks are safe — give it a moment and try again."
        action={
          <button type="button" className="nm-btn nm-btn--primary" onClick={() => void retry()}>
            <i className="fa-solid fa-rotate-right" aria-hidden="true" />
            Try again
          </button>
        }
      />
    </div>
  );
}
