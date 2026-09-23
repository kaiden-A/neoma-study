// camelCase mirrors of the server schemas. All timestamps are integer
// milliseconds since the epoch (app/utils.py:to_ms).

export type UserKind = "member" | "guest";
export type GroupKind = "project" | "study";
export type TaskStatus = "todo" | "doing" | "done";
export type TaskPriority = "low" | "med" | "high";
export type NoteScope = "personal" | "group";
export type NoteType = "note" | "handwritten" | "slides" | "paper" | "link" | "request";
export type EventType = "exam" | "session" | "meeting" | "personal";

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  kind: UserKind;
  program: string;
  color: string;
}

export interface MemberUser {
  id: string;
  name: string;
  email: string;
  color: string;
  program: string;
  invited: boolean;
}

export interface Topic {
  id: string;
  name: string;
  color: string;
}

export interface GroupLink {
  id: string;
  label: string;
  url: string;
}

export interface Group {
  id: string;
  kind: GroupKind;
  name: string;
  subject: string;
  color: string;
  description: string;
  inviteCode: string;
  ownerId: string;
  topics: Topic[];
  links: GroupLink[];
  members: MemberUser[];
  createdAt: number;
  updatedAt: number;
}

export interface GroupPreview {
  id: string;
  kind: GroupKind;
  name: string;
  subject: string;
  color: string;
  description: string;
  inviteCode: string;
  ownerName: string;
  topics: Topic[];
  memberCount: number;
  isMember: boolean;
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface TaskLink {
  id: string;
  label: string;
  url: string;
}

export interface Task {
  id: string;
  groupId: string | null;
  title: string;
  description: string;
  dueAt: number | null;
  status: TaskStatus;
  priority: TaskPriority;
  createdBy: string | null;
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
  reminderMinutes: number;
  assigneeIds: string[];
  subtasks: Subtask[];
  links: TaskLink[];
}

export interface RequestState {
  open: boolean;
  answeredBy: string | null;
  answeredAt: number | null;
  answerNoteId: string | null;
}

export interface Note {
  id: string;
  scope: NoteScope;
  groupId: string | null;
  subjectId: string | null;
  topicId: string | null;
  type: NoteType;
  title: string;
  body: string;
  url: string | null;
  fileId: string | null;
  fileName: string | null;
  fileType: string | null;
  fileSize: number | null;
  pinned: boolean;
  tags: string[];
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
  request: RequestState | null;
}

export interface Subject {
  id: string;
  name: string;
  color: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  type: EventType;
  groupId: string | null;
  startsAt: number;
  endsAt: number | null;
  location: string;
  reminderMinutes: number;
  notes: string;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface NotificationItem {
  id: string;
  group: "overdue" | "due" | "sessions" | "assigned" | "exams" | "notes";
  title: string;
  body: string;
  tone: "danger" | "today" | "muted";
  icon: string;
  at: number;
  route: string;
  read: boolean;
  snoozedUntil: number | null;
}

export interface NotificationKinds {
  overdue: boolean;
  dueSoon: boolean;
  assigned: boolean;
  sessions: boolean;
  exams: boolean;
  notes: boolean;
}

export interface GoogleSettings {
  status: "connected" | "disconnected";
  email: string | null;
  lastSyncAt: number | null;
  calendar: string;
}

export interface ElpisSettings {
  url: string;
  enabled: boolean;
  token: string;
}

export interface UserSettings {
  theme: "light" | "dark";
  leadTimeHours: number;
  browserNotifications: boolean;
  kinds: NotificationKinds;
  google: GoogleSettings;
  elpis: ElpisSettings;
  syncLog: string[];
}

export type UserSettingsPatch = Partial<Omit<UserSettings, "kinds" | "google" | "elpis">> & {
  kinds?: Partial<NotificationKinds>;
  elpis?: Partial<ElpisSettings>;
};

export interface CalendarItem {
  id: string;
  refId: string;
  kind: "task" | "event";
  title: string;
  start: number;
  end: number | null;
  groupId: string | null;
  groupName: string;
  color: string;
  done: boolean;
  status?: TaskStatus;
  type?: EventType;
  location?: string;
  reminderMinutes?: number;
}

export interface Bootstrap {
  user: PublicUser;
  settings: UserSettings;
  subjects: Subject[];
  groups: Group[];
  tasks?: Task[];
  notes?: Note[];
  events?: CalendarEvent[];
  notifications?: NotificationItem[];
}

export interface FileOut {
  id: string;
  name: string;
  contentType: string;
  size: number;
}

export interface NoteCreateInput {
  type?: NoteType;
  title?: string;
  body?: string;
  url?: string | null;
  subjectId?: string | null;
  tags?: string[];
  fileId?: string | null;
  pinned?: boolean;
}

export interface NotePatchInput {
  title?: string;
  body?: string;
  url?: string | null;
  subjectId?: string | null;
  topicId?: string | null;
  type?: NoteType;
  tags?: string[];
  pinned?: boolean;
}

export interface GroupNoteInput {
  type?: NoteType;
  title?: string;
  body?: string;
  url?: string | null;
  topicId?: string | null;
  tags?: string[];
  fileId?: string | null;
}

export interface AnswerInput {
  url?: string | null;
  title?: string | null;
  body?: string;
}

export interface EventCreateInput {
  title: string;
  type?: EventType;
  groupId?: string | null;
  startsAt: number;
  endsAt?: number | null;
  location?: string;
  reminderMinutes?: number;
  notes?: string;
}

export type EventPatchInput = Partial<EventCreateInput>;

export interface LogoutResponse {
  logoutUrl: string | null;
}
