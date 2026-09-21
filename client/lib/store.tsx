"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { apiDelete, apiPatch, apiPost, apiUpload, apiGet } from "@/lib/api-client";
import { addDays, startOfDay } from "@/lib/dates";
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
  shareNote: (id: string, groupId: string, topicId: string | null) => Promise<Note>;
  answerRequest: (id: string, answer: AnswerInput) => Promise<Note>;
  createSubject: (name: string) => Promise<Subject>;
  updateSubject: (id: string, patch: { name?: string; color?: string }) => Promise<Subject>;
  deleteSubject: (id: string, moveTo?: string | null) => Promise<void>;
  uploadFile: (file: Blob, name: string, thumb?: Blob | null) => Promise<FileOut>;
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

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

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
        const task = await apiPatch<Task>(`/api/tasks/${id}`, patch);
        replaceTask(task);
        return task;
      },
      deleteTask: async (id) => {
        await apiDelete(`/api/tasks/${id}`);
        setTasks((current) => current.filter((task) => task.id !== id));
      },
      postponeTask: async (id) => {
        const offset = new Date().getTimezoneOffset();
        const task = await apiPost<Task>(`/api/tasks/${id}/postpone`, { timezoneOffsetMinutes: offset });
        replaceTask(task);
        return task;
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
        const note = await apiPatch<Note>(`/api/notes/${id}`, patch);
        replaceNote(note);
        return note;
      },
      deleteNote: async (id) => {
        await apiDelete(`/api/notes/${id}`);
        setNotes((current) => current.filter((note) => note.id !== id));
      },
      shareNote: async (id, groupId, topicId) => {
        const note = await apiPost<Note>(`/api/notes/${id}/share`, { groupId, topicId });
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
      uploadFile: async (file, name, thumb = null) => {
        const form = new FormData();
        form.append("file", file, name);
        if (thumb) form.append("thumb", thumb, `${name}.thumb.jpg`);
        return apiUpload<FileOut>("/api/files", form);
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
        const event = await apiPatch<CalendarEvent>(`/api/events/${id}`, patch);
        replaceEvent(event);
        return event;
      },
      deleteEvent: async (id) => {
        await apiDelete(`/api/events/${id}`);
        setEvents((current) => current.filter((event) => event.id !== id));
      },
      eventGoogleUrl: async (id) => {
        const result = await apiGet<{ url: string }>(`/api/events/${id}/google`);
        return result.url;
      },
      markNotificationsRead: async (ids) => {
        const items = await apiPost<NotificationItem[]>("/api/notifications/read", { ids });
        setNotifications(items);
      },
      markAllNotificationsRead: async () => {
        const items = await apiPost<NotificationItem[]>("/api/notifications/read-all");
        setNotifications(items);
      },
      snoozeNotification: async (id, minutes) => {
        const items = await apiPost<NotificationItem[]>("/api/notifications/snooze", { id, minutes });
        setNotifications(items);
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
  ]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used inside StoreProvider");
  return context;
}
