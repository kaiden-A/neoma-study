// Video link parsing for in-app embeds. Deliberately tiny and dependency-free:
// the only value that ever reaches an iframe is an id that matched a strict
// pattern, so a saved URL can never smuggle in another host or markup.

export type VideoProvider = "youtube" | "vimeo";

export interface VideoLink {
  provider: VideoProvider;
  id: string;
  start: number | null;
  list: string | null;
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d+$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"]);
const VIMEO_HOSTS = new Set(["vimeo.com", "player.vimeo.com"]);
const YOUTUBE_PATH_PREFIXES = new Set(["shorts", "live", "embed", "v"]);

function parseTime(value: string): number | null {
  const text = value.trim().toLowerCase();
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text);
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(text);
  if (!match || match[0] === "") return null;
  const seconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  return seconds > 0 ? seconds : null;
}

function startSeconds(params: URLSearchParams): number | null {
  const raw = params.get("t") ?? params.get("start");
  return raw ? parseTime(raw) : null;
}

function youtubeId(host: string, parts: string[], params: URLSearchParams): string | null {
  if (host === "youtu.be") {
    const candidate = parts[0] ?? "";
    return YOUTUBE_ID.test(candidate) ? candidate : null;
  }
  if (parts[0] && YOUTUBE_PATH_PREFIXES.has(parts[0])) {
    const candidate = parts[1] ?? "";
    return YOUTUBE_ID.test(candidate) ? candidate : null;
  }
  const candidate = params.get("v") ?? "";
  return YOUTUBE_ID.test(candidate) ? candidate : null;
}

function vimeoId(parts: string[]): string | null {
  if (parts[0] === "video" && parts[1] && VIMEO_ID.test(parts[1])) return parts[1];
  if (parts[0] && VIMEO_ID.test(parts[0])) return parts[0];
  return null;
}

/** Recognises the YouTube and Vimeo URL shapes Neoma can embed, else null. */
export function parseVideoUrl(raw: string | null | undefined): VideoLink | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  if (YOUTUBE_HOSTS.has(host)) {
    const id = youtubeId(host, parts, url.searchParams);
    if (!id) return null;
    return { provider: "youtube", id, start: startSeconds(url.searchParams), list: url.searchParams.get("list") };
  }
  if (VIMEO_HOSTS.has(host)) {
    const id = vimeoId(parts);
    if (!id) return null;
    return { provider: "vimeo", id, start: startSeconds(url.searchParams), list: null };
  }
  return null;
}

/** The click-to-play iframe source; the facade is always shown first.
 * `startOverride` (seconds) seeks straight to a timestamp when set. */
export function videoEmbedUrl(video: VideoLink, startOverride?: number | null): string {
  const start = startOverride ?? video.start;
  if (video.provider === "youtube") {
    const params = new URLSearchParams({ autoplay: "1", rel: "0", enablejsapi: "1" });
    if (start !== null) params.set("start", String(start));
    if (video.list) params.set("list", video.list);
    return `https://www.youtube-nocookie.com/embed/${video.id}?${params.toString()}`;
  }
  const base = `https://player.vimeo.com/video/${video.id}?autoplay=1`;
  return start !== null ? `${base}#t=${start}s` : base;
}

/** YouTube gives a thumbnail; Vimeo renders a plain tinted tile instead. */
export function videoThumbUrl(video: VideoLink): string | null {
  if (video.provider === "youtube") return `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;
  return null;
}

export function videoProviderLabel(video: VideoLink): string {
  return video.provider === "youtube" ? "YouTube" : "Vimeo";
}
