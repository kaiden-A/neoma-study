"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useStore } from "@/lib/store";
import type { Note } from "@/lib/types";

const IDLE_MS = 5 * 60_000;
const MIN_SECONDS = 30;

function fmtElapsed(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${minutes}:${String(rest).padStart(2, "0")}`;
}

/** Start/pause/finish timer for the note page. Finishing writes a study
 * session; five idle minutes auto-finish so a forgotten tab does not inflate
 * the stats. */
export function StudyTimer({ note }: { note: Note }) {
  const store = useStore();
  const [phase, setPhase] = useState<"idle" | "running" | "paused">("idle");
  const [display, setDisplay] = useState(0);
  const [saving, setSaving] = useState(false);
  const stateRef = useRef({ accumulated: 0, startedAt: 0, running: false });
  const lastActivity = useRef(0);

  const finish = useCallback(async () => {
    const state = stateRef.current;
    const total = Math.round(
      state.accumulated + (state.running ? (Date.now() - state.startedAt) / 1000 : 0),
    );
    stateRef.current = { accumulated: 0, startedAt: 0, running: false };
    setPhase("idle");
    setDisplay(0);
    if (total < MIN_SECONDS) return;
    setSaving(true);
    try {
      const endedAt = Date.now();
      await store.saveSession({
        noteId: note.id,
        subjectId: note.subjectId,
        startedAt: endedAt - total * 1000,
        endedAt,
        seconds: total,
        source: "timer",
      });
    } catch {
      // Best effort: the store already told the user what happened.
    }
    setSaving(false);
  }, [note.id, note.subjectId, store]);

  useEffect(() => {
    if (phase !== "running") return;
    const timer = setInterval(() => {
      const state = stateRef.current;
      setDisplay(state.accumulated + (Date.now() - state.startedAt) / 1000);
      if (Date.now() - lastActivity.current > IDLE_MS) void finish();
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, finish]);

  useEffect(() => {
    lastActivity.current = Date.now();
    const bump = () => {
      lastActivity.current = Date.now();
    };
    window.addEventListener("pointerdown", bump);
    window.addEventListener("pointermove", bump);
    window.addEventListener("keydown", bump);
    window.addEventListener("scroll", bump, true);
    return () => {
      window.removeEventListener("pointerdown", bump);
      window.removeEventListener("pointermove", bump);
      window.removeEventListener("keydown", bump);
      window.removeEventListener("scroll", bump, true);
    };
  }, []);

  if (phase === "idle") {
    return (
      <div className="nm-studytimer">
        <button type="button" className="nm-btn nm-btn--ghost nm-btn--sm" disabled={saving} onClick={() => {
          stateRef.current = { accumulated: 0, startedAt: Date.now(), running: true };
          lastActivity.current = Date.now();
          setDisplay(0);
          setPhase("running");
        }}>
          <i className="fa-solid fa-stopwatch" aria-hidden="true" />
          {saving ? "Saving session…" : "Start studying"}
        </button>
      </div>
    );
  }

  return (
    <div className="nm-studytimer is-live">
      <span className="nm-mono nm-studytimer-clock" aria-live="polite">
        {fmtElapsed(display)}
      </span>
      <button
        type="button"
        className="nm-iconbtn nm-iconbtn--sm"
        aria-label={phase === "running" ? "Pause timer" : "Resume timer"}
        onClick={() => {
          if (phase === "running") {
            const state = stateRef.current;
            state.accumulated += (Date.now() - state.startedAt) / 1000;
            state.running = false;
            setPhase("paused");
          } else {
            stateRef.current = { ...stateRef.current, startedAt: Date.now(), running: true };
            lastActivity.current = Date.now();
            setPhase("running");
          }
        }}
      >
        <i className={`fa-solid ${phase === "running" ? "fa-pause" : "fa-play"}`} aria-hidden="true" />
      </button>
      <button type="button" className="nm-btn nm-btn--secondary nm-btn--sm" onClick={() => void finish()}>
        <i className="fa-solid fa-flag-checkered" aria-hidden="true" />
        Finish
      </button>
    </div>
  );
}
