// Vault layout preference (list or grid). Kept outside React so
// useSyncExternalStore can read it without a setState-in-effect, and so the
// server snapshot ("list") matches the first client paint.

export type VaultView = "list" | "grid";

const KEY = "neoma.vault.view";

let current: VaultView = "list";
let hydrated = false;
const listeners = new Set<() => void>();

function read(): VaultView {
  if (!hydrated && typeof window !== "undefined") {
    hydrated = true;
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw === "grid" || raw === "list") current = raw;
    } catch {
      // Private mode or blocked storage: keep the default.
    }
  }
  return current;
}

export function getVaultView(): VaultView {
  return read();
}

export function getServerVaultView(): VaultView {
  return "list";
}

export function subscribeVaultView(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setVaultView(view: VaultView): void {
  current = view;
  hydrated = true;
  try {
    window.localStorage.setItem(KEY, view);
  } catch {
    // Persisting is best effort.
  }
  listeners.forEach((listener) => listener());
}
