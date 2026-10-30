"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { ApiError, apiFetch } from "@/lib/api-client";
import { useStore } from "@/lib/store";

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface AssistantContext {
  kind: "note" | "course" | "courses";
  id: string | null;
  label: string;
}

interface AssistantValue {
  open: boolean;
  openAssistant: () => void;
  closeAssistant: () => void;
  messages: AssistantMessage[];
  busy: boolean;
  error: string | null;
  context: AssistantContext | null;
  send: (text: string) => Promise<void>;
  stop: () => void;
  clear: () => void;
}

const AssistantContext = createContext<AssistantValue | null>(null);

function storageKey(userId: string): string {
  return `neoma.assistant.${userId || "anon"}`;
}

function isMessage(value: unknown): value is AssistantMessage {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    (item.role === "user" || item.role === "assistant") &&
    typeof item.content === "string"
  );
}

function loadMessages(userId: string): AssistantMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isMessage).slice(-50);
  } catch {
    return [];
  }
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function AssistantSession({ userId, children }: { userId: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const store = useStore();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>(() => loadMessages(userId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const match = pathname.match(/^\/vault\/([0-9a-f-]{36})$/i);
  const noteId = match?.[1] ?? null;
  const courseMatch = pathname.match(/^\/courses\/([0-9a-f-]{36})$/i);
  const courseId = courseMatch?.[1] ?? null;
  const note = noteId ? store.noteById(noteId) : null;
  const course = courseId ? store.courseById(courseId) : null;
  const isCoursesHome = pathname === "/courses" || pathname === "/courses/announcements";
  const courseLabel = course
    ? [course.shortname, course.fullname].filter(Boolean).join(" — ") || "This course"
    : "This course";
  const context = useMemo<AssistantContext | null>(
    () =>
      courseId
        ? { kind: "course", id: courseId, label: courseLabel }
        : noteId
          ? { kind: "note", id: noteId, label: note?.title ?? "This note" }
          : isCoursesHome
            ? { kind: "courses", id: null, label: "Your courses" }
            : null,
    [courseId, courseLabel, isCoursesHome, noteId, note?.title],
  );

  useEffect(() => {
    const handle = window.setTimeout(() => {
      try {
        window.sessionStorage.setItem(storageKey(userId), JSON.stringify(messages.slice(-50)));
      } catch {
        // Private mode or a full quota: the thread just does not survive a reload.
      }
    }, 250);
    return () => window.clearTimeout(handle);
  }, [messages, userId]);

  const openAssistant = useCallback(() => setOpen(true), []);
  const closeAssistant = useCallback(() => setOpen(false), []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;

      const userMessage: AssistantMessage = { id: newId(), role: "user", content: trimmed };
      const assistantId = newId();
      const history = [...messages, userMessage];
      setMessages([...history, { id: assistantId, role: "assistant", content: "" }]);
      setBusy(true);
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const response = await apiFetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history.slice(-20).map(({ role, content }) => ({ role, content })),
            context:
              context?.kind === "note"
                ? { noteId: context.id }
                : context?.kind === "course"
                  ? { courseId: context.id }
                  : context?.kind === "courses"
                    ? { scope: "courses" }
                    : null,
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          let message = "The assistant is not available.";
          try {
            const body = (await response.json()) as { error?: unknown };
            if (typeof body.error === "string") message = body.error;
          } catch {
            // Keep the generic message.
          }
          throw new ApiError(response.status, message);
        }
        if (!response.body) throw new Error("The assistant returned no answer.");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let content = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, "\n");
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const line = frame.split("\n").find((part) => part.startsWith("data:"));
            if (!line) continue;
            let payload: { text?: string; error?: string; done?: boolean };
            try {
              payload = JSON.parse(line.slice(5).trim()) as typeof payload;
            } catch {
              continue;
            }
            if (payload.error) {
              setError(payload.error);
              continue;
            }
            if (payload.text) {
              content += payload.text;
              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantId ? { ...message, content } : message,
                ),
              );
            }
          }
        }

        if (!content) {
          setMessages((current) => current.filter((message) => message.id !== assistantId));
          setError((current) => current ?? "The assistant did not answer. Try again.");
        }
      } catch (caught) {
        if ((caught as Error).name !== "AbortError") {
          setError(
            caught instanceof ApiError
              ? caught.message
              : caught instanceof Error
                ? caught.message
                : "The assistant is not available.",
          );
          setMessages((current) =>
            current.filter((message) => message.id !== assistantId || Boolean(message.content)),
          );
        }
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    },
    [busy, context, messages],
  );

  const value = useMemo<AssistantValue>(
    () => ({
      open,
      openAssistant,
      closeAssistant,
      messages,
      busy,
      error,
      context,
      send,
      stop,
      clear,
    }),
    [
      open,
      openAssistant,
      closeAssistant,
      messages,
      busy,
      error,
      context,
      send,
      stop,
      clear,
    ],
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const { user } = useStore();
  return (
    <AssistantSession key={user?.id ?? "anon"} userId={user?.id ?? ""}>
      {children}
    </AssistantSession>
  );
}

export function useAssistant(): AssistantValue {
  const context = useContext(AssistantContext);
  if (!context) throw new Error("useAssistant must be used inside AssistantProvider");
  return context;
}
