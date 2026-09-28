// Parsing helpers for the study marks written in a note body: `[mm:ss]`
// timestamps for video notes and `[p. 12]` page anchors for PDFs.

export interface TimeMark {
  label: string;
  seconds: number;
}

export interface PageMark {
  label: string;
  page: number;
}

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  return `${hours > 0 ? `${hours}:` : ""}${mm}:${String(rest).padStart(2, "0")}`;
}

function toSeconds(label: string): number {
  const parts = label.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parts[0] * 60 + parts[1];
}

export function parseTimeMarks(body: string): TimeMark[] {
  const marks: TimeMark[] = [];
  const seen = new Set<string>();
  const pattern = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g;
  for (const match of body.matchAll(pattern)) {
    const label = match[1];
    if (seen.has(label)) continue;
    seen.add(label);
    marks.push({ label, seconds: toSeconds(label) });
  }
  return marks;
}

export function parsePageMarks(body: string): PageMark[] {
  const marks: PageMark[] = [];
  const seen = new Set<number>();
  const pattern = /\[p\.\s*(\d{1,4})\]/gi;
  for (const match of body.matchAll(pattern)) {
    const page = Number(match[1]);
    if (page < 1 || seen.has(page)) continue;
    seen.add(page);
    marks.push({ label: match[0], page });
  }
  return marks;
}
