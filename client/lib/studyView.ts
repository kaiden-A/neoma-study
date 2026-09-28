// Focus-view preference (split ratio + material/notes visibility). Kept outside
// React so useSyncExternalStore can read it without a setState-in-effect, and
// so the server snapshot ("split") matches the first client paint.

export type StudyMode = "split" | "material" | "write";

export interface StudyView {
  mode: StudyMode;
  /** Material pane share of the width in split mode, 0.25–0.75. */
  ratio: number;
}

const KEY = "neoma.study.view";
const DEFAULT_RATIO = 0.55;
const MIN_RATIO = 0.25;
const MAX_RATIO = 0.75;
const CYCLE: StudyMode[] = ["split", "material", "write"];

const SERVER_VIEW: StudyView = { mode: "split", ratio: DEFAULT_RATIO };

let current: StudyView = { ...SERVER_VIEW };
let hydrated = false;
const listeners = new Set<() => void>();

function normalize(value: Partial<StudyView>): StudyView {
  return {
    mode: CYCLE.includes(value.mode as StudyMode) ? (value.mode as StudyMode) : "split",
    ratio:
      typeof value.ratio === "number" && value.ratio >= MIN_RATIO && value.ratio <= MAX_RATIO
        ? value.ratio
        : DEFAULT_RATIO,
  };
}

function read(): StudyView {
  if (!hydrated && typeof window !== "undefined") {
    hydrated = true;
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) current = normalize(JSON.parse(raw) as Partial<StudyView>);
    } catch {
      // Private mode or blocked storage: keep the default.
    }
  }
  return current;
}

export function getStudyView(): StudyView {
  return read();
}

export function getServerStudyView(): StudyView {
  return SERVER_VIEW;
}

export function subscribeStudyView(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(next: StudyView): void {
  current = next;
  hydrated = true;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Persisting is best effort.
  }
  listeners.forEach((listener) => listener());
}

export function setStudyMode(mode: StudyMode): void {
  publish({ ...read(), mode });
}

export function setStudyRatio(ratio: number): void {
  const clamped = Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
  publish({ ...read(), ratio: clamped });
}

export function nextStudyMode(mode: StudyMode): StudyMode {
  return CYCLE[(CYCLE.indexOf(mode) + 1) % CYCLE.length];
}

export function studyRatioBounds(): { min: number; max: number } {
  return { min: MIN_RATIO, max: MAX_RATIO };
}
