export type EditorMode = "write" | "preview";

const KEY = "neoma.editor.view";
const SERVER_MODE: EditorMode = "write";

let current: EditorMode = SERVER_MODE;
let hydrated = false;
const listeners = new Set<() => void>();

function read(): EditorMode {
  if (!hydrated && typeof window !== "undefined") {
    hydrated = true;
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw === "write" || raw === "preview") current = raw;
    } catch {
      // Private mode or blocked storage: keep the default.
    }
  }
  return current;
}

export function getEditorMode(): EditorMode {
  return read();
}

export function getServerEditorMode(): EditorMode {
  return SERVER_MODE;
}

export function subscribeEditorMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setEditorMode(mode: EditorMode): void {
  current = mode;
  hydrated = true;
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    // Persisting is best effort.
  }
  listeners.forEach((listener) => listener());
}
