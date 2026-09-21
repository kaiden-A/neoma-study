"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { EventModal } from "@/components/calendar/EventModal";
import { NewGroupModal } from "@/components/groups/NewGroupModal";
import { AddItemModal } from "@/components/notes/AddItemModal";
import { TaskModal } from "@/components/tasks/TaskModal";
import { useOverlays } from "@/components/ui/Overlays";
import { fmtDateTime, fmtRelative } from "@/lib/dates";
import { eventType, noteType } from "@/lib/markers";
import { useStore } from "@/lib/store";
import { useNow } from "@/lib/useNow";
import { applyTheme } from "@/lib/theme";

interface Command {
  id: string;
  label: string;
  icon: string;
  hint: string;
  keywords: string;
  run: () => void;
}

const RECENT_KEY = "neoma.recent";

function readRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

type ModalKind = "task" | "group-project" | "group-study" | "event" | "note";

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const router = useRouter();
  const now = useNow();
  const { toast } = useOverlays();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [recents] = useState<string[]>(readRecents);
  const [modal, setModal] = useState<ModalKind | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => {
      onClose();
      router.push(href);
    };
    const pages: Command[] = [
      { id: "page.today", label: "Go to Home", icon: "fa-house", hint: "Page", keywords: "home dashboard brief", run: go("/today") },
      { id: "page.groups", label: "Go to Groups", icon: "fa-users", hint: "Page", keywords: "projects teams", run: go("/groups") },
      { id: "page.tasks", label: "Go to My to-do", icon: "fa-list-check", hint: "Page", keywords: "todo personal checklist", run: go("/tasks") },
      { id: "page.vault", label: "Go to Notes", icon: "fa-note-sticky", hint: "Page", keywords: "notes vault study", run: go("/vault") },
      { id: "page.calendar", label: "Go to Calendar", icon: "fa-calendar-days", hint: "Page", keywords: "dates exams sessions", run: go("/calendar") },
      { id: "page.notifications", label: "Go to Notifications", icon: "fa-bell", hint: "Page", keywords: "alerts reminders", run: go("/notifications") },
      { id: "page.settings", label: "Go to Settings", icon: "fa-sliders", hint: "Page", keywords: "integrations google elpis", run: go("/settings") },
    ];

    const actions: Command[] = [
      {
        id: "action.new-task",
        label: "New task or to-do",
        icon: "fa-plus",
        hint: "Action",
        keywords: "create deadline todo personal checklist",
        run: () => setModal("task"),
      },
      {
        id: "action.new-group",
        label: "New group",
        icon: "fa-users",
        hint: "Action",
        keywords: "create team project",
        run: () => setModal("group-project"),
      },
      {
        id: "action.new-study-group",
        label: "New study group",
        icon: "fa-note-sticky",
        hint: "Action",
        keywords: "create friends share notes study",
        run: () => setModal("group-study"),
      },
      {
        id: "action.new-event",
        label: "New calendar event",
        icon: "fa-calendar-plus",
        hint: "Action",
        keywords: "exam session meeting",
        run: () => setModal("event"),
      },
      {
        id: "action.add-vault",
        label: "Add note or file",
        icon: "fa-arrow-up-from-bracket",
        hint: "Action",
        keywords: "upload note photo slides",
        run: () => setModal("note"),
      },
      {
        id: "action.export-ics",
        label: "Export calendar (.ics)",
        icon: "fa-file-arrow-down",
        hint: "Action",
        keywords: "google sync download",
        run: () => {
          void fetch("/api/calendar.ics", { cache: "no-store" })
            .then((response) => response.text())
            .then((text) => {
              const count = (text.match(/BEGIN:VEVENT/g) ?? []).length;
              if (!count) {
                toast("Nothing to export yet", { kind: "danger" });
                return;
              }
              const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = "neoma-study.ics";
              anchor.click();
              setTimeout(() => URL.revokeObjectURL(url), 2000);
              toast(`${count} events exported`, { kind: "success", icon: "fa-file-arrow-down" });
            });
        },
      },
      {
        id: "action.theme",
        label: "Toggle dark mode",
        icon: "fa-moon",
        hint: "Action",
        keywords: "theme night light",
        run: () => {
          const next = store.settings?.theme === "dark" ? "light" : "dark";
          applyTheme(next);
          void store.updateSettings({ theme: next });
        },
      },
    ];

    const groups: Command[] = store.groups.map((group) => ({
      id: `group.${group.id}`,
      label: group.name,
      icon: group.kind === "study" ? "fa-note-sticky" : "fa-users",
      hint: `${group.kind === "study" ? "Study group" : "Project group"}${
        group.kind === "project" && group.subject ? ` · ${group.subject}` : ""
      }`,
      keywords: `group ${group.subject} ${group.name}`,
      run: go(`/groups/${group.id}`),
    }));

    const notes: Command[] = [...store.personalNotes()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 12)
      .map((note) => ({
        id: `note.${note.id}`,
        label: note.title,
        icon: noteType(note.type).icon,
        hint: `Notes · ${noteType(note.type).label}`,
        keywords: `note vault ${note.tags.join(" ")} ${note.body}`,
        run: go(`/vault/${note.id}`),
      }));

    const tasks: Command[] = [...store.tasks]
      .filter((task) => task.status !== "done")
      .sort((a, b) => (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER))
      .slice(0, 10)
      .map((task) => ({
        id: `task.${task.id}`,
        label: task.title,
        icon: "fa-list-check",
        hint: `Task · ${task.dueAt ? fmtRelative(task.dueAt) : "no date"}`,
        keywords: `task ${task.title} ${task.description}`,
        run: () => setModal("task"),
      }));

    const events: Command[] = [...store.events]
      .filter((event) => event.startsAt >= now - 86_400_000)
      .sort((a, b) => a.startsAt - b.startsAt)
      .slice(0, 6)
      .map((event) => ({
        id: `event.${event.id}`,
        label: event.title,
        icon: eventType(event.type).icon,
        hint: `${eventType(event.type).label} · ${fmtDateTime(event.startsAt)}`,
        keywords: `event calendar ${event.title}`,
        run: go("/calendar"),
      }));

    return [...pages, ...actions, ...groups, ...notes, ...tasks, ...events];
  }, [onClose, router, store, toast, now]);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 10);
    return () => clearTimeout(timer);
  }, []);

  const results = useMemo(() => {
    if (!query.trim()) {
      const byId = new Map(commands.map((command) => [command.id, command]));
      const recentCommands = recents
        .map((id) => byId.get(id))
        .filter((command): command is Command => Boolean(command))
        .slice(0, 4);
      const seen = new Set(recentCommands.map((command) => command.id));
      return [...recentCommands, ...commands.filter((command) => !seen.has(command.id))].slice(0, 12);
    }
    const needle = query.trim().toLowerCase();
    return commands
      .filter((command) => `${command.label} ${command.keywords} ${command.hint}`.toLowerCase().includes(needle))
      .slice(0, 14);
  }, [commands, query, recents]);

  function activate(index: number) {
    const command = results[index];
    if (!command) return;
    try {
      const next = [command.id, ...recents.filter((id) => id !== command.id)].slice(0, 6);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // recents are a nicety
    }
    onClose();
    setTimeout(() => command.run(), 10);
  }

  return (
    <>
      <div
        className="nm-overlay nm-overlay--palette"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div className="nm-palette" role="dialog" aria-modal="true" aria-label="Command palette">
          <div className="nm-palette-input">
            <i className="fa-solid fa-magnifying-glass nm-search-icon" aria-hidden="true" />
            <input
              ref={inputRef}
              value={query}
              placeholder="Search or run a command…"
              aria-label="Search or run a command"
              autoComplete="off"
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") onClose();
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive((current) => Math.min(current + 1, results.length - 1));
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((current) => Math.max(current - 1, 0));
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  activate(active);
                }
              }}
            />
            <kbd className="nm-kbd">esc</kbd>
          </div>
          <div className="nm-palette-list" role="listbox">
            {results.length === 0 ? (
              <div className="nm-palette-empty">
                <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                <p>No match for &ldquo;{query.trim()}&rdquo;</p>
                <small>Try a group name, a note title or an action like &ldquo;new task&rdquo;.</small>
              </div>
            ) : (
              results.map((command, index) => (
                <button
                  key={command.id}
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  className={`nm-palette-item${index === active ? " is-active" : ""}`}
                  onMouseMove={() => setActive(index)}
                  onClick={() => activate(index)}
                >
                  <i className={`fa-solid ${command.icon} nm-palette-icon`} aria-hidden="true" />
                  <span className="nm-palette-text">{command.label}</span>
                  <span className="nm-palette-hint nm-mono">{command.hint}</span>
                </button>
              ))
            )}
          </div>
          <div className="nm-palette-ft">
            <kbd className="nm-kbd">↑</kbd>
            <kbd className="nm-kbd">↓</kbd>
            <span>to move ·</span>
            <kbd className="nm-kbd">↵</kbd>
            <span>to open</span>
          </div>
        </div>
      </div>

      {modal === "task" ? <TaskModal onClose={() => setModal(null)} /> : null}
      {modal === "event" ? <EventModal onClose={() => setModal(null)} /> : null}
      {modal === "note" ? <AddItemModal onClose={() => setModal(null)} /> : null}
      {modal === "group-project" ? <NewGroupModal defaultKind="project" onClose={() => setModal(null)} /> : null}
      {modal === "group-study" ? <NewGroupModal defaultKind="study" onClose={() => setModal(null)} /> : null}
    </>
  );
}
