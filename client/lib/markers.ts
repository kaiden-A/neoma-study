// The six highlighter markers: group colours, subject colours, topic colours
// and avatar colours all come from here. Hex values match prototype/util.js.

export interface Marker {
  key: string;
  hex: string;
  label: string;
}

export const MARKERS: Marker[] = [
  { key: "amber", hex: "#E0B93F", label: "Amber" },
  { key: "mint", hex: "#4FBF9F", label: "Mint" },
  { key: "sky", hex: "#5C9AE0", label: "Sky" },
  { key: "coral", hex: "#E8674C", label: "Coral" },
  { key: "violet", hex: "#8A76D9", label: "Violet" },
  { key: "pink", hex: "#DB7BAE", label: "Pink" },
];

const BY_KEY = new Map(MARKERS.map((marker) => [marker.key, marker]));

export function marker(key: string | null | undefined): Marker {
  return (key && BY_KEY.get(key)) || MARKERS[0];
}

export function hashInt(value: string): number {
  let h = 0;
  const text = String(value ?? "");
  for (let i = 0; i < text.length; i++) h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function avatarHex(seed: string): string {
  return MARKERS[hashInt(seed) % MARKERS.length].hex;
}

export function initials(name: string): string {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const NOTE_TYPES: Record<string, { label: string; icon: string; marker: string }> = {
  note: { label: "Note", icon: "fa-note-sticky", marker: "amber" },
  handwritten: { label: "Handwritten", icon: "fa-pen-fancy", marker: "violet" },
  slides: { label: "Slides", icon: "fa-file-powerpoint", marker: "sky" },
  paper: { label: "Question paper", icon: "fa-file-lines", marker: "coral" },
  link: { label: "Link", icon: "fa-link", marker: "mint" },
  request: { label: "Request", icon: "fa-circle-question", marker: "amber" },
};

export const EVENT_TYPES: Record<string, { label: string; icon: string; marker: string }> = {
  exam: { label: "Exam", icon: "fa-graduation-cap", marker: "coral" },
  session: { label: "Study session", icon: "fa-book-open-reader", marker: "violet" },
  meeting: { label: "Meeting", icon: "fa-people-group", marker: "sky" },
  personal: { label: "Personal", icon: "fa-mug-hot", marker: "amber" },
};

export const REMINDER_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "No reminder" },
  { value: 15, label: "15 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 1440, label: "1 day before" },
  { value: 2880, label: "2 days before" },
  { value: 10080, label: "1 week before" },
];

export const STATUS_LABEL: Record<string, string> = {
  todo: "Not started",
  doing: "In progress",
  done: "Done",
};

export const PRIORITY_LABEL: Record<string, string> = {
  low: "Low",
  med: "Medium",
  high: "High",
};

export const PRIORITY_ICON: Record<string, string> = {
  low: "fa-angle-down",
  med: "fa-equals",
  high: "fa-angles-up",
};

export function noteType(type: string) {
  return NOTE_TYPES[type] ?? NOTE_TYPES.note;
}

export function eventType(type: string) {
  return EVENT_TYPES[type] ?? EVENT_TYPES.personal;
}
