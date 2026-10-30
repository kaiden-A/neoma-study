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
  courseId?: string | null;
  moodle?: boolean;
}

export interface RequestState {
  open: boolean;
  answeredBy: string | null;
  answeredAt: number | null;
  answerNoteId: string | null;
}

export interface StudyPosition {
  page: number;
  scroll: number;
}

export interface StudyHighlight {
  id: string;
  page: number;
  /** Normalized [x, y, width, height] rects, relative to the page box. */
  rects: number[][];
  quote: string;
  color: string;
  createdAt: number;
  tag?: string | null;
}

export interface NoteStudy {
  position: StudyPosition;
  highlights: StudyHighlight[];
  timestamps: number[];
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
  study: NoteStudy;
  matchSnippet?: string | null;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
  request: RequestState | null;
}

export interface NoteShareState {
  enabled: boolean;
  url: string | null;
}

export interface PublicFileMeta {
  name: string;
  contentType: string;
  size: number;
}

/** What an anonymous visitor sees at /s/[token]; redacted server-side. */
export interface PublicNote {
  title: string;
  body: string;
  type: NoteType;
  url: string | null;
  tags: string[];
  file: PublicFileMeta | null;
  sharedBy: string;
  sharedAt: number;
  createdAt: number;
  updatedAt: number;
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
  group: "overdue" | "due" | "sessions" | "assigned" | "exams" | "notes" | "review";
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
  review: boolean;
  italeem: boolean;
}

export interface GoogleSettings {
  status: "connected" | "disconnected";
  email: string | null;
  lastSyncAt: number | null;
  calendar: string;
}

export interface MoodleSettings {
  status: "connected" | "disconnected";
  lastSyncAt: number | null;
  error: string | null;
}

export interface MoodleStatus {
  connected: boolean;
  username: string | null;
  release: string | null;
  lastSyncAt: number | null;
  error: string | null;
  courses: number;
  upcoming: number;
}

export interface MoodleSyncResult {
  courses: number;
  deadlines: number;
  events: number;
}

export interface Course {
  id: string;
  moodleId: number;
  shortname: string;
  fullname: string;
  color: string;
  progress: number | null;
  subjectId: string | null;
  openDeadlines: number;
  nextDueAt: number | null;
  unreadAnnouncements: number;
  archived: boolean;
}

export interface CourseFile {
  filename: string;
  mimetype: string;
  size: number;
  noteId: string | null;
}

export interface CourseModule {
  cmid: number;
  name: string;
  modname: string;
  url: string | null;
  description: string;
  link: string | null;
  files: CourseFile[];
}

export interface CourseSection {
  id: number;
  name: string;
  summary: string;
  modules: CourseModule[];
}

export interface CourseAssignment {
  taskId: string | null;
  assignId: number;
  cmid: number;
  name: string;
  dueAt: number | null;
  cutoffAt: number | null;
  submissionStatus: string;
  grade: string;
  gradeMax: string;
  url: string;
}

export interface CourseGrade {
  name: string;
  grade: string;
  max: string;
  percentage: string;
  feedback: string;
  cmid: number | null;
}

export interface CourseDetail {
  course: Course;
  sections: CourseSection[];
  assignments: CourseAssignment[];
  grades: CourseGrade[];
  outlineAt: number | null;
  outlineError: string | null;
  truncated: boolean;
}

export interface Announcement {
  id: string;
  courseId: string;
  courseShortname: string;
  courseColor: string;
  forumName: string;
  forumType: string;
  discussionId: number;
  subject: string;
  body: string;
  author: string;
  postedAt: number | null;
  modifiedAt: number | null;
  replies: number;
  url: string;
  read: boolean;
}

export interface AnnouncementsResponse {
  items: Announcement[];
  unread: number;
  syncedAt: number | null;
  warning: string | null;
}

export interface AnnouncementReadResponse {
  updated: number;
  unread: number;
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
  linkEmbeds: boolean;
  officePreview: boolean;
  kinds: NotificationKinds;
  google: GoogleSettings;
  moodle: MoodleSettings;
  elpis: ElpisSettings;
  syncLog: string[];
}

export type UserSettingsPatch = Partial<Omit<UserSettings, "kinds" | "google" | "moodle" | "elpis">> & {
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
  courses?: Course[];
  notifications?: NotificationItem[];
  flashcards?: Flashcard[];
  study?: StudyOverview;
  ai?: AiStatus;
}

export interface AiStatus {
  configured: boolean;
  refine: boolean;
  chat: boolean;
}

export interface FileOut {
  id: string;
  name: string;
  contentType: string;
  size: number;
}

export interface FilePresign {
  id: string;
  name: string;
  contentType: string;
  size: number;
  uploadUrl: string;
  thumbUploadUrl: string | null;
}

export interface LinkPreview {
  title: string | null;
  author: string | null;
  thumbnailUrl: string | null;
}

export interface FileText {
  text: string;
  truncated: boolean;
}

export type FlashcardGrade = "again" | "hard" | "good" | "easy";

export interface Flashcard {
  id: string;
  noteId: string;
  noteTitle: string | null;
  front: string;
  back: string;
  sourceHighlightId: string | null;
  dueAt: number;
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
  suspended: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface FlashcardInput {
  noteId: string;
  front: string;
  back?: string;
  sourceHighlightId?: string | null;
}

export interface FlashcardPatchInput {
  front?: string;
  back?: string;
  suspended?: boolean;
}

export type FlashcardKind = "basic" | "cloze";

export interface FlashcardDraft {
  front: string;
  back: string;
  kind: FlashcardKind;
  source: string;
  page: number | null;
  duplicate: boolean;
  distractors: string[];
}

export interface GenerateCardsResponse {
  noteId: string;
  noteTitle: string;
  engine: "rules" | "ai";
  refined: boolean;
  cards: FlashcardDraft[];
  notice: string | null;
}

export interface StudySession {
  id: string;
  noteId: string | null;
  noteTitle: string | null;
  subjectId: string | null;
  startedAt: number;
  endedAt: number | null;
  seconds: number;
  source: "timer" | "manual";
}

export interface StudySessionInput {
  noteId?: string | null;
  subjectId?: string | null;
  startedAt: number;
  endedAt?: number | null;
  seconds: number;
  source?: "timer" | "manual";
}

export interface SubjectStudyStats {
  subjectId: string;
  name: string;
  color: string;
  notes: number;
  files: number;
  cardsDue: number;
  minutesThisWeek: number;
  lastStudiedAt: number | null;
}

export interface ContinueStudy {
  noteId: string;
  title: string;
  subjectId: string | null;
  type: NoteType;
  page: number;
  videoSeconds: number | null;
  lastAt: number;
}

export interface StudyOverview {
  streakDays: number;
  minutesThisWeek: number;
  subjects: SubjectStudyStats[];
  continueStudy: ContinueStudy | null;
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
  study?: NoteStudy;
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
