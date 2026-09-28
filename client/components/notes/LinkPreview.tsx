"use client";

import { useEffect, useRef, useState } from "react";

import { parseVideoUrl, videoEmbedUrl, videoProviderLabel, videoThumbUrl } from "@/lib/links";
import { useStore } from "@/lib/store";
import type { Note } from "@/lib/types";

/** Every link note renders through here: video links become a click-to-play
 * facade (the provider is only contacted once you press play, and only when
 * the linkEmbeds setting is on), everything else keeps the plain link card.
 *
 * `seek` reloads the player at a timestamp; while a YouTube player runs its
 * clock is reported through `onTimeUpdate` so the editor can stamp it. */
export function LinkPreview({
  note,
  initialSeconds = null,
  seek = null,
  onTimeUpdate,
}: {
  note: Note;
  initialSeconds?: number | null;
  seek?: { seconds: number; nonce: number } | null;
  onTimeUpdate?: (seconds: number) => void;
}) {
  const { settings } = useStore();
  const [playing, setPlaying] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [startAt, setStartAt] = useState<number | null>(initialSeconds);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timeCallback = useRef(onTimeUpdate);
  const seekNonce = useRef(0);

  useEffect(() => {
    timeCallback.current = onTimeUpdate;
  }, [onTimeUpdate]);

  useEffect(() => {
    if (!seek || seek.nonce === seekNonce.current) return;
    seekNonce.current = seek.nonce;
    setStartAt(seek.seconds);
    setPlaying(true);
  }, [seek]);

  const url = note.url;
  const video = parseVideoUrl(url);
  const embeds = settings?.linkEmbeds !== false;

  // A plain iframe has no clock API, but YouTube's widget channel answers
  // postMessage commands once `enablejsapi=1` is set.
  useEffect(() => {
    if (!playing || video?.provider !== "youtube") return;
    const frame = iframeRef.current;
    const target = frame?.contentWindow;
    if (!target) return;
    const post = (payload: object) => target.postMessage(JSON.stringify(payload), "*");
    post({ event: "listening", id: 1, channel: "widget" });
    const poll = setInterval(() => post({ event: "command", func: "getCurrentTime", args: [] }), 1000);
    function onMessage(event: MessageEvent) {
      if (event.source !== target) return;
      let data: unknown;
      try {
        data = JSON.parse(String(event.data));
      } catch {
        return;
      }
      const info = (data as { info?: { currentTime?: number } }).info;
      if (info && typeof info.currentTime === "number") timeCallback.current?.(info.currentTime);
    }
    window.addEventListener("message", onMessage);
    return () => {
      clearInterval(poll);
      window.removeEventListener("message", onMessage);
    };
  }, [playing, video?.provider]);

  if (!url) return null;

  if (video && embeds) {
    const provider = videoProviderLabel(video);
    const thumb = videoThumbUrl(video);
    return (
      <figure className={`nm-preview nm-preview--video nm-mk-${video.provider === "youtube" ? "coral" : "sky"}`}>
        {playing ? (
          <iframe
            ref={iframeRef}
            className="nm-preview-frame nm-preview-frame--video"
            src={videoEmbedUrl(video, startAt)}
            title={`${provider} player — ${note.title}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            className="nm-videofacade"
            aria-label={`Play on ${provider}`}
            onClick={() => setPlaying(true)}
          >
            {video.provider === "youtube" && !thumbFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb ?? ""} alt="" loading="lazy" onError={() => setThumbFailed(true)} />
            ) : (
              <span className="nm-videofacade-fallback">
                <i className={`fa-brands ${video.provider === "youtube" ? "fa-youtube" : "fa-vimeo-v"}`} aria-hidden="true" />
              </span>
            )}
            <span className="nm-videofacade-play">
              <i className="fa-solid fa-play" aria-hidden="true" />
            </span>
          </button>
        )}
        <figcaption className="nm-preview-bar">
          <span className="nm-preview-barinfo">
            <span className="nm-preview-name" title={note.title}>
              {note.title}
            </span>
            <span className="nm-mono nm-preview-meta">{url}</span>
          </span>
          <span className="nm-preview-actions">
            <a className="nm-btn nm-btn--secondary nm-btn--sm" href={url} target="_blank" rel="noopener">
              <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
              Open on {provider}
            </a>
          </span>
        </figcaption>
      </figure>
    );
  }

  return (
    <div className="nm-linkcard">
      <i className="fa-solid fa-link nm-linkcard-icon" aria-hidden="true" />
      <div className="nm-linkcard-bd">
        <div className="nm-linkcard-label">{note.title}</div>
        <div className="nm-linkcard-url nm-mono">{url}</div>
      </div>
      <a className="nm-btn nm-btn--secondary nm-btn--sm" href={url} target="_blank" rel="noopener">
        {video ? `Open on ${videoProviderLabel(video)}` : "Open link"}
      </a>
    </div>
  );
}
