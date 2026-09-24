"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { useOverlays } from "@/components/ui/Overlays";
import { apiDelete, apiPatch, apiPost, apiGet } from "@/lib/api-client";
import { addDays, startOfDay } from "@/lib/dates";
import { putToR2 } from "@/lib/files";
import { eventType } from "@/lib/markers";
import { applyTheme } from "@/lib/theme";
import type {
  AnswerInput,
  Bootstrap,
  CalendarEvent,
  CalendarItem,
  EventCreateInput,
  EventPatchInput,
  FileOut,
  FilePresign,
  Group,
  GroupKind,
  GroupNoteInput,
  MemberUser,
  Note,
  NoteCreateInput,
  NotePatchInput,
  NotificationItem,
  PublicUser,
  Subject,
  Task,
  TaskPriority,
  TaskStatus,
  UserSettings,
  UserSettingsPatch,
} from "@/lib/types";

export interface GroupStats {
  total: number;
  done: number;
  open: number;
  overdue: number;
  pct: number;
  next: Task | null;
}

export interface StudyStats {
  notes: number;
  files: number;
  openRequests: number;
  topicCount: number;
  nextSession: CalendarEvent | null;
}

export interface GroupCreateInput {
  kind: GroupKind;
  name: string;
  subject?: string;
  color?: string;
  description?: string;
  topics?: string[];
}

export interface GroupPatchInput {
  name?: string;
  subject?: string;
  color?: string;
  description?: string;
}

export interface SubtaskInput {
  id?: string;
  title: string;
  done: boolean;
}

export interface TaskLinkInput {
  id?: string;
  label: string;
  url: string;
}

export interface TaskCreateInput {
  groupId?: string | null;
  title: string;
  description?: string;
  dueAt?: number | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  reminderMinutes?: number;
  assigneeIds?: string[];
  subtasks?: SubtaskInput[];
  links?: TaskLinkInput[];
}

export type TaskPatchInput = Partial<Omit<TaskCreateInput, "groupId">> & { groupId?: string | null };

interface StoreValue {
  ready: boolean;
  user: PublicUser | null;
  settings: UserSettings | null;
  groups: Group[];
  subjects: Subject[];
  tasks: Task[];
  notes: Note[];
  events: CalendarEvent[];
  notifications: NotificationItem[];
  refresh: () => Promise<void>;
  updateSettings: (patch: UserSettingsPatch) => Promise<UserSettings>;
  groupById: (id: string) => Group | null;
  subjectById: (id: string) => Subject | null;
  taskById: (id: string) => Task | null;
  noteById: (id: string) => Note | null;
  eventById: (id: string) => CalendarEvent | null;
  userById: (id: string) => MemberUser | null;
  userName: (id: string | null | undefined) => string;
  membersOf: (groupId: string) => MemberUser[];
  groupStats: (groupId: string) => GroupStats;
  studyStats: (groupId: string) => StudyStats;
  personalTasks: () => Task[];
  tasksForGroup: (groupId: string) => Task[];
  overdueTasks: (now?: number) => Task[];
  dueSoonTasks: (hours: number, now?: number) => Task[];
  allEvents: () => CalendarItem[];
  eventsOnDay: (day: number | Date) => CalendarItem[];
  personalNotes: () => Note[];
  notesForGroup: (groupId: string) => Note[];
  unreadCount: () => number;
  createGroup: (input: GroupCreateInput) => Promise<Group>;
  updateGroup: (id: string, patch: GroupPatchInput) => Promise<Group>;
  deleteGroup: (id: string) => Promise<void>;
  addTopic: (id: string, name: string) => Promise<Group>;
  renameTopic: (id: string, topicId: string, name: string) => Promise<Group>;
  removeTopic: (id: string, topicId: string) => Promise<Group>;
  addGroupLink: (id: string, label: string, url: string) => Promise<Group>;
  removeGroupLink: (id: string, linkId: string) => Promise<Group>;
  inviteMember: (id: string, email: string) => Promise<MemberUser>;
  removeMember: (id: string, memberId: string, reassignTo?: string | null) => Promise<Group>;
  regenerateInvite: (id: string) => Promise<Group>;
  joinGroupByCode: (code: string) => Promise<Group>;
  createTask: (input: TaskCreateInput) => Promise<Task>;
  updateTask: (id: string, patch: TaskPatchInput) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;
  postponeTask: (id: string) => Promise<Task>;
  duplicateTask: (id: string) => Promise<Task>;
  createNote: (input: NoteCreateInput) => Promise<Note>;
  createGroupNote: (groupId: string, input: GroupNoteInput) => Promise<Note>;
  updateNote: (id: string, patch: NotePatchInput) => Promise<Note>;
  deleteNote: (id: string) => Promise<void>;
  shareNote: (id: string, groupId: string, topicId: string | null, includeFile?: boolean) => Promise<Note>;
  answerRequest: (id: string, answer: AnswerInput) => Promise<Note>;
  createSubject: (name: string) => Promise<Subject>;
  updateSubject: (id: string, patch: { name?: string; color?: string }) => Promise<Subject>;
  deleteSubject: (id: string, moveTo?: string | null) => Promise<void>;
  uploadFile: (file: Blob, name: string, thumb?: Blob | null, groupId?: string | null) => Promise<FileOut>;
  fileUrl: (id: string, thumb?: boolean) => Promise<string>;
  createEvent: (input: EventCreateInput) => Promise<CalendarEvent>;
  updateEvent: (id: string, patch: EventPatchInput) => Promise<CalendarEvent>;
  deleteEvent: (id: string) => Promise<void>;
  eventGoogleUrl: (id: string) => Promise<string>;
  markNotificationsRead: (ids: string[]) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  snoozeNotification: (id: string, minutes: number) => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

type LocalRow = Task | Note | CalendarEvent;

// Optimistic merges: a patch lands in local state before the server answers,
// so a tick or a column move is instant. The server response replaces it.
function mergeTaskPatch(task: Task, patch: TaskPatchInput): Task {
  const next: Task = { ...task, updatedAt: Date.now() };
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.description !== undefined) next.description = patch.description;
  if (patch.dueAt !== undefined) next.dueAt = patch.dueAt;
  if (patch.status !== undefined) {
    next.status = patch.status;
    next.completedAt = patch.status === "done" ? Date.now() : null;
  }
  if (patch.priority !== undefined) next.priority = patch.priority;
  if (patch.reminderMinutes !== undefined) next.reminderMinutes = patch.reminderMinutes;
  if (patch.groupId !== undefined) {
    next.groupId = patch.groupId;
    if (patch.groupId === null) next.assigneeIds = [];
  }
  if (patch.assigneeIds !== undefined) next.assigneeIds = patch.assigneeIds;
  if (patch.subtasks !== undefined) {
    next.subtasks = patch.subtasks.map((subtask, index) => ({
      id: subtask.id ?? `pending-${index}`,
      title: subtask.title,
      done: subtask.done,
    }));
  }
  if (patch.links !== undefined) {
    next.links = patch.links.map((link, index) => ({
      id: link.id ?? `pending-${index}`,
      label: link.label,
      url: link.url,
    }));
  }
  return next;
}

function mergeNotePatch(note: Note, patch: NotePatchInput): Note {
  const next: Note = { ...note, updatedAt: Date.now() };
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.body !== undefined) next.body = patch.body;
  if (patch.url !== undefined) next.url = patch.url;
  if (patch.subjectId !== undefined) next.subjectId = patch.subjectId;
  if (patch.topicId !== undefined) next.topicId = patch.topicId;
  if (patch.type !== undefined) next.type = patch.type;
  if (patch.tags !== undefined) next.tags = patch.tags;
  if (patch.pinned !== undefined) next.pinned = patch.pinned;
  return next;
}

function mergeEventPatch(event: CalendarEvent, patch: EventPatchInput): CalendarEvent {
  const next: CalendarEvent = { ...event, updatedAt: Date.now() };
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.type !== undefined) next.type = patch.type;
  if (patch.groupId !== undefined) next.groupId = patch.groupId;
  if (patch.startsAt !== undefined) next.startsAt = patch.startsAt;
  if (patch.endsAt !== undefined) next.endsAt = patch.endsAt;
  if (patch.location !== undefined) next.location = patch.location;
  if (patch.reminderMinutes !== undefined) next.reminderMinutes = patch.reminderMinutes;
  if (patch.notes !== undefined) next.notes = patch.notes;
  return next;
}

/** The server's postpone rule, mirrored so the change shows before it lands. */
function postponedDue(dueAt: number | null): number {
  if (dueAt !== null) return dueAt + 86_400_000;
  const local = new Date();
  return new Date(local.getFullYear(), local.getMonth(), local.getDate() + 1, 9, 0, 0, 0).getTime();
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const autoSyncDone = useRef(false);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const { toast } = useOverlays();
  // Optimistic bookkeeping: `stable` is the last server-confirmed row (the
  // rollback target) and `pending` counts in-flight mutations per row, so a
  // slow response cannot clobber a newer optimistic change.
  const stableRows = useRef(new Map<string, LocalRow>());
  const pendingRows = useRef(new Map<string, number>());

  const beginMutation = useCallback((id: string, current: LocalRow | undefined) => {
    const inflight = pendingRows.current.get(id) ?? 0;
    if (inflight === 0 && current) stableRows.current.set(id, current);
    pendingRows.current.set(id, inflight + 1);
  }, []);

  const finishMutation = useCallback((id: string): { last: boolean; rollback: LocalRow | null } => {
    const left = Math.max(0, (pendingRows.current.get(id) ?? 1) - 1);
    if (left > 0) {
      pendingRows.current.set(id, left);
      return { last: false, rollback: null };
    }
    pendingRows.current.delete(id);
    return { last: true, rollback: stableRows.current.get(id) ?? null };
  }, []);

  const notifyFailure = useCallback(() => {
    toast("Couldn’t save that change", {
      kind: "danger",
      body: "Check your connection — it’s back the way it was.",
    });
  }, [toast]);

  const applyBootstrap = useCallback((data: Bootstrap) => {
    setUser(data.user);
    setSettings(data.settings);
    applyTheme(data.settings.theme);
    setGroups(data.groups ?? []);
    setSubjects(data.subjects ?? []);
    setTasks(data.tasks ?? []);
    setNotes(data.notes ?? []);
    setEvents(data.events ?? []);
    setNotifications(data.notifications ?? []);
    setReady(true);
  }, []);

  const refresh = useCallback(async () => {
    try {
      // Plain fetch, not apiFetch: on public pages (the join preview) an
      // anonymous visitor must not be bounced to /login.
      const response = await fetch("/api/bootstrap", { cache: "no-store" });
      if (response.status === 401) {
        setReady(true);
        return;
      }
      if (!response.ok) return;
      applyBootstrap((await response.json()) as Bootstrap);
    } catch {
      // offline or transient; pages render their empty states
    }
  }, [applyBootstrap]);

  useEffect(() => {
    // Fetch-on-mount; the await settles before any state lands.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  useEffect(() => {
    // Background sync once per page load, and at most once a day per user;
    // the server also collapses simultaneous auto calls from other tabs.
    if (!ready || settings?.google.status !== "connected") return;
    if (autoSyncDone.current) return;
    const last = settings.google.lastSyncAt;
    if (last && new Date(last).toDateString() === new Date().toDateString()) return;
    autoSyncDone.current = true;
    void (async () => {
      try {
        await apiPost("/api/google/sync?auto=true");
        await refresh();
      } catch {
        // Offline or a Google hiccup; the next visit tries again.
      }
    })();
  }, [ready, settings, refresh]);

  const replaceGroup = useCallback((group: Group) => {
    setGroups((current) => {
      const exists = current.some((item) => item.id === group.id);
      return exists ? current.map((item) => (item.id === group.id ? group : item)) : [group, ...current];
    });
  }, []);

  const replaceTask = useCallback((task: Task) => {
    setTasks((current) => {
      const exists = current.some((item) => item.id === task.id);
      return exists ? current.map((item) => (item.id === task.id ? task : item)) : [task, ...current];
    });
  }, []);

  const replaceNote = useCallback((note: Note) => {
    setNotes((current) => {
      const exists = current.some((item) => item.id === note.id);
      return exists ? current.map((item) => (item.id === note.id ? note : item)) : [note, ...current];
    });
  }, []);

  const replaceEvent = useCallback((event: CalendarEvent) => {
    setEvents((current) => {
      const exists = current.some((item) => item.id === event.id);
      return exists ? current.map((item) => (item.id === event.id ? event : item)) : [...current, event];
    });
  }, []);

  const value = useMemo<StoreValue>(() => {
    const groupById = (id: string) => groups.find((group) => group.id === id) ?? null;
    const subjectById = (id: string) => subjects.find((subject) => subject.id === id) ?? null;
    const taskById = (id: string) => tasks.find((task) => task.id === id) ?? null;
    const noteById = (id: string) => notes.find((note) => note.id === id) ?? null;
    const eventById = (id: string) => events.find((event) => event.id === id) ?? null;
    const userById = (id: string) => {
      for (const group of groups) {
        const member = group.members.find((item) => item.id === id);
        if (member) return member;
      }
      if (user && user.id === id) {
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          color: user.color,
          program: user.program,
          invited: false,
        };
      }
      return null;
    };
    const userName = (id: string | null | undefined) => (id ? (userById(id)?.name ?? "Someone") : "Someone");
    const membersOf = (groupId: string) => groupById(groupId)?.members ?? [];

    const tasksForGroup = (groupId: string) =>
      tasks
        .filter((task) => task.groupId === groupId)
        .sort((a, b) => (a.dueAt ?? 9_999_999_999_999) - (b.dueAt ?? 9_999_999_999_999));

    const groupStats = (groupId: string): GroupStats => {
      const list = tasksForGroup(groupId);
      const done = list.filter((task) => task.status === "done").length;
      const now = Date.now();
      const open = list.filter((task) => task.status !== "done");
      return {
        total: list.length,
        done,
        open: open.length,
        overdue: open.filter((task) => task.dueAt !== null && task.dueAt < now).length,
        pct: list.length ? Math.round((done / list.length) * 100) : 0,
        next: open[0] ?? null,
      };
    };

    const studyStats = (groupId: string): StudyStats => {
      const groupNotes = notes.filter((note) => note.groupId === groupId);
      const now = Date.now();
      const nextSession =
        events
          .filter(
            (event) => event.groupId === groupId && event.type === "session" && event.startsAt >= now,
          )
          .sort((a, b) => a.startsAt - b.startsAt)[0] ?? null;
      return {
        notes: groupNotes.filter((note) => note.type !== "request").length,
        files: groupNotes.filter((note) => note.fileId !== null).length,
        openRequests: groupNotes.filter((note) => note.type === "request" && note.request?.open).length,
        topicCount: groupById(groupId)?.topics.length ?? 0,
        nextSession,
      };
    };

    const personalTasks = () => tasks.filter((task) => task.groupId === null);
    const overdueTasks = (now: number = Date.now()) =>
      tasks.filter((task) => task.status !== "done" && task.dueAt !== null && task.dueAt < now);
    const dueSoonTasks = (hours: number, now: number = Date.now()) =>
      tasks.filter(
        (task) =>
          task.status !== "done" &&
          task.dueAt !== null &&
          task.dueAt >= now &&
          task.dueAt <= now + hours * 3_600_000,
      );

    const allEvents = (): CalendarItem[] => {
      const items: CalendarItem[] = [];
      for (const task of tasks) {
        if (task.dueAt === null) continue;
        const group = task.groupId ? groupById(task.groupId) : null;
        items.push({
          id: `task:${task.id}`,
          refId: task.id,
          kind: "task",
          title: task.title,
          start: task.dueAt,
          end: task.dueAt + 30 * 60_000,
          groupId: task.groupId,
          groupName: group?.name ?? "",
          color: group?.color ?? "amber",
          done: task.status === "done",
          status: task.status,
        });
      }
      for (const event of events) {
        const group = event.groupId ? groupById(event.groupId) : null;
        items.push({
          id: `event:${event.id}`,
          refId: event.id,
          kind: "event",
          title: event.title,
          start: event.startsAt,
          end: event.endsAt,
          groupId: event.groupId,
          groupName: group?.name ?? "",
          color: group?.color ?? eventType(event.type).marker,
          done: false,
          type: event.type,
          location: event.location,
          reminderMinutes: event.reminderMinutes,
        });
      }
      return items.sort((a, b) => a.start - b.start);
    };

    const eventsOnDay = (day: number | Date) => {
      const start = startOfDay(day).getTime();
      const end = addDays(start, 1).getTime();
      return allEvents().filter((item) => item.start >= start && item.start < end);
    };

    const personalNotes = () => notes.filter((note) => note.scope === "personal");
    const notesForGroup = (groupId: string) =>
      notes.filter((note) => note.scope === "group" && note.groupId === groupId);

    const unreadCount = () => notifications.filter((item) => !item.read).length;

    return {
      ready,
      user,
      settings,
      groups,
      subjects,
      tasks,
      notes,
      events,
      notifications,
      refresh,
      updateSettings: async (patch: UserSettingsPatch) => {
        const next = await apiPatch<UserSettings>("/api/settings", patch);
        setSettings(next);
        applyTheme(next.theme);
        return next;
      },
      groupById,
      subjectById,
      taskById,
      noteById,
      eventById,
      userById,
      userName,
      membersOf,
      groupStats,
      studyStats,
      personalTasks,
      tasksForGroup,
      overdueTasks,
      dueSoonTasks,
      allEvents,
      eventsOnDay,
      personalNotes,
      notesForGroup,
      unreadCount,
      createGroup: async (input) => {
        const group = await apiPost<Group>("/api/groups", input);
        replaceGroup(group);
        return group;
      },
      updateGroup: async (id, patch) => {
        const group = await apiPatch<Group>(`/api/groups/${id}`, patch);
        replaceGroup(group);
        return group;
      },
      deleteGroup: async (id) => {
        await apiDelete(`/api/groups/${id}`);
        setGroups((current) => current.filter((group) => group.id !== id));
        setTasks((current) => current.filter((task) => task.groupId !== id));
        setNotes((current) => current.filter((note) => note.groupId !== id));
        setEvents((current) =>
          current.map((event) => (event.groupId === id ? { ...event, groupId: null } : event)),
        );
      },
      addTopic: async (id, name) => {
        const group = await apiPost<Group>(`/api/groups/${id}/topics`, { name });
        replaceGroup(group);
        return group;
      },
      renameTopic: async (id, topicId, name) => {
        const group = await apiPatch<Group>(`/api/groups/${id}/topics/${topicId}`, { name });
        replaceGroup(group);
        return group;
      },
      removeTopic: async (id, topicId) => {
        const group = await apiDelete<Group>(`/api/groups/${id}/topics/${topicId}`);
        replaceGroup(group);
        setNotes((current) =>
          current.map((note) => (note.topicId === topicId ? { ...note, topicId: null } : note)),
        );
        return group;
      },
      addGroupLink: async (id, label, url) => {
        const group = await apiPost<Group>(`/api/groups/${id}/links`, { label, url });
        replaceGroup(group);
        return group;
      },
      removeGroupLink: async (id, linkId) => {
        const group = await apiDelete<Group>(`/api/groups/${id}/links/${linkId}`);
        replaceGroup(group);
        return group;
      },
      inviteMember: async (id, email) => {
        const member = await apiPost<MemberUser>(`/api/groups/${id}/invite`, { email });
        setGroups((current) =>
          current.map((group) =>
            group.id === id ? { ...group, members: [...group.members, member] } : group,
          ),
        );
        return member;
      },
      removeMember: async (id, memberId, reassignTo = null) => {
        const group = await apiDelete<Group>(`/api/groups/${id}/members/${memberId}`);
        replaceGroup(group);
        if (reassignTo) await refresh();
        return group;
      },
      regenerateInvite: async (id) => {
        const group = await apiPost<Group>(`/api/groups/${id}/invite-code`);
        replaceGroup(group);
        return group;
      },
      joinGroupByCode: async (code) => {
        const group = await apiPost<Group>(`/api/invites/${encodeURIComponent(code)}/join`);
        replaceGroup(group);
        return group;
      },
      createTask: async (input) => {
        const task = await apiPost<Task>("/api/tasks", input);
        replaceTask(task);
        return task;
      },
      updateTask: async (id, patch) => {
        const current = tasks.find((task) => task.id === id);
        beginMutation(id, current);
        setTasks((rows) => rows.map((task) => (task.id === id ? mergeTaskPatch(task, patch) : task)));
        try {
          const task = await apiPatch<Task>(`/api/tasks/${id}`, patch);
          if (finishMutation(id).last) {
            stableRows.current.set(id, task);
            replaceTask(task);
          }
          return task;
        } catch (error) {
          const { rollback } = finishMutation(id);
          if (rollback) replaceTask(rollback as Task);
          notifyFailure();
          throw error;
        }
      },
      deleteTask: async (id) => {
        beginMutation(id, tasks.find((task) => task.id === id));
        setTasks((current) => current.filter((task) => task.id !== id));
        try {
          await apiDelete(`/api/tasks/${id}`);
          if (finishMutation(id).last) stableRows.current.delete(id);
        } catch (error) {
          const { rollback } = finishMutation(id);
          if (rollback) replaceTask(rollback as Task);
          notifyFailure();
          throw error;
        }
      },
      postponeTask: async (id) => {
        const current = tasks.find((task) => task.id === id);
        beginMutation(id, current);
        if (current) {
          setTasks((rows) =>
            rows.map((task) => (task.id === id ? { ...task, dueAt: postponedDue(task.dueAt) } : task)),
          );
        }
        try {
          const offset = new Date().getTimezoneOffset();
          const task = await apiPost<Task>(`/api/tasks/${id}/postpone`, { timezoneOffsetMinutes: offset });
          if (finishMutation(id).last) {
            stableRows.current.set(id, task);
            replaceTask(task);
          }
          return task;
        } catch (error) {
          const { rollback } = finishMutation(id);
          if (rollback) replaceTask(rollback as Task);
          notifyFailure();
          throw error;
        }
      },
      duplicateTask: async (id) => {
        const task = await apiPost<Task>(`/api/tasks/${id}/duplicate`);
        replaceTask(task);
        return task;
      },
      createNote: async (input) => {
        const note = await apiPost<Note>("/api/notes", input);
        replaceNote(note);
        return note;
      },
      createGroupNote: async (groupId, input) => {
        const note = await apiPost<Note>(`/api/groups/${groupId}/notes`, input);
        replaceNote(note);
        return note;
      },
      updateNote: async (id, patch) => {
        const current = notes.find((note) => note.id === id);
        beginMutation(id, current);
        setNotes((rows) => rows.map((note) => (note.id === id ? mergeNotePatch(note, patch) : note)));
        try {
          const note = await apiPatch<Note>(`/api/notes/${id}`, patch);
          if (finishMutation(id).last) {
            stableRows.current.set(id, note);
            replaceNote(note);
          }
          return note;
        } catch (error) {
          const { rollback } = finishMutation(id);
          if (rollback) replaceNote(rollback as Note);
          notifyFailure();
          throw error;
        }
      },
      deleteNote: async (id) => {
        beginMutation(id, notes.find((note) => note.id === id));
        setNotes((current) => current.filter((note) => note.id !== id));
        try {
          await apiDelete(`/api/notes/${id}`);
          if (finishMutation(id).last) stableRows.current.delete(id);
        } catch (error) {
          const { rollback } = finishMutation(id);
          if (rollback) replaceNote(rollback as Note);
          notifyFailure();
          throw error;
        }
      },
      shareNote: async (id, groupId, topicId, includeFile = true) => {
        const note = await apiPost<Note>(`/api/notes/${id}/share`, {
          groupId,
          topicId,
          includeFile,
        });
        replaceNote(note);
        return note;
      },
      answerRequest: async (id, answer) => {
        const note = await apiPost<Note>(`/api/notes/${id}/answer`, answer);
        setNotes((current) =>
          current.map((item) =>
            item.id === id
              ? {
                  ...item,
                  request: {
                    open: false,
                    answeredBy: note.createdBy,
                    answeredAt: note.createdAt,
                    answerNoteId: note.id,
                  },
                }
              : item,
          ),
        );
        replaceNote(note);
        return note;
      },
      createSubject: async (name) => {
        const subject = await apiPost<Subject>("/api/subjects", { name });
        setSubjects((current) => [...current, subject]);
        return subject;
      },
      updateSubject: async (id, patch) => {
        const subject = await apiPatch<Subject>(`/api/subjects/${id}`, patch);
        setSubjects((current) => current.map((item) => (item.id === id ? subject : item)));
        return subject;
      },
      deleteSubject: async (id, moveTo = null) => {
        const query = moveTo ? `?moveTo=${encodeURIComponent(moveTo)}` : "";
        await apiDelete(`/api/subjects/${id}${query}`);
        setSubjects((current) => current.filter((item) => item.id !== id));
        setNotes((current) =>
          current.map((note) =>
            note.subjectId === id ? { ...note, subjectId: moveTo } : note,
          ),
        );
      },
      uploadFile: async (file, name, thumb = null, groupId = null) => {
        const contentType = file.type || "application/octet-stream";
        const presign = await apiPost<FilePresign>("/api/files/presign", {
          name,
          contentType,
          size: file.size,
          groupId,
          thumb: Boolean(thumb),
        });
        try {
          await putToR2(presign.uploadUrl, file, contentType);
          if (thumb && presign.thumbUploadUrl) {
            await putToR2(presign.thumbUploadUrl, thumb, "image/jpeg");
          }
        } catch (error) {
          // Clean up the reserved row; otherwise a file with no object behind
          // it could be attached to a note.
          void apiDelete(`/api/files/${presign.id}`).catch(() => {});
          throw error;
        }
        return apiPost<FileOut>(`/api/files/${presign.id}/confirm`, {});
      },
      fileUrl: async (id, thumb = false) => {
        const result = await apiGet<{ url: string }>(`/api/files/${id}/url${thumb ? "?thumb=true" : ""}`);
        return result.url;
      },
      createEvent: async (input) => {
        const event = await apiPost<CalendarEvent>("/api/events", input);
        replaceEvent(event);
        return event;
      },
      updateEvent: async (id, patch) => {
        const current = events.find((event) => event.id === id);
        beginMutation(id, current);
        setEvents((rows) => rows.map((event) => (event.id === id ? mergeEventPatch(event, patch) : event)));
        try {
          const event = await apiPatch<CalendarEvent>(`/api/events/${id}`, patch);
          if (finishMutation(id).last) {
            stableRows.current.set(id, event);
            replaceEvent(event);
          }
          return event;
        } catch (error) {
          const { rollback } = finishMutation(id);
          if (rollback) replaceEvent(rollback as CalendarEvent);
          notifyFailure();
          throw error;
        }
      },
      deleteEvent: async (id) => {
        beginMutation(id, events.find((event) => event.id === id));
        setEvents((current) => current.filter((event) => event.id !== id));
        try {
          await apiDelete(`/api/events/${id}`);
          if (finishMutation(id).last) stableRows.current.delete(id);
        } catch (error) {
          const { rollback } = finishMutation(id);
          if (rollback) replaceEvent(rollback as CalendarEvent);
          notifyFailure();
          throw error;
        }
      },
      eventGoogleUrl: async (id) => {
        const result = await apiGet<{ url: string }>(`/api/events/${id}/google`);
        return result.url;
      },
      markNotificationsRead: async (ids) => {
        const before = notifications;
        setNotifications((current) =>
          current.map((item) => (ids.includes(item.id) ? { ...item, read: true } : item)),
        );
        try {
          setNotifications(await apiPost<NotificationItem[]>("/api/notifications/read", { ids }));
        } catch (error) {
          setNotifications(before);
          notifyFailure();
          throw error;
        }
      },
      markAllNotificationsRead: async () => {
        const before = notifications;
        setNotifications((current) => current.map((item) => ({ ...item, read: true })));
        try {
          setNotifications(await apiPost<NotificationItem[]>("/api/notifications/read-all"));
        } catch (error) {
          setNotifications(before);
          notifyFailure();
          throw error;
        }
      },
      snoozeNotification: async (id, minutes) => {
        const before = notifications;
        const until = Date.now() + minutes * 60_000;
        setNotifications((current) =>
          current.map((item) => (item.id === id ? { ...item, snoozedUntil: until } : item)),
        );
        try {
          setNotifications(await apiPost<NotificationItem[]>("/api/notifications/snooze", { id, minutes }));
        } catch (error) {
          setNotifications(before);
          notifyFailure();
          throw error;
        }
      },
    };
  }, [
    ready,
    user,
    settings,
    groups,
    subjects,
    tasks,
    notes,
    events,
    notifications,
    refresh,
    replaceGroup,
    replaceTask,
    replaceNote,
    replaceEvent,
    beginMutation,
    finishMutation,
    notifyFailure,
  ]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used inside StoreProvider");
  return context;
}
