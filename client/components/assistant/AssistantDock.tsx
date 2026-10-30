"use client";

import { useEffect, useRef, useState } from "react";

import { useAssistant } from "@/lib/assistant";
import { renderMarkdown } from "@/lib/markdown";
import { useStore } from "@/lib/store";

export function AssistantDock() {
  const {
    open,
    closeAssistant,
    messages,
    busy,
    error,
    noteTitle,
    send,
    stop,
    clear,
  } = useAssistant();
  const { aiStatus } = useStore();
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeAssistant();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeAssistant]);

  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, open]);

  if (!open) return null;

  const prompts = noteTitle
    ? ["Explain this note", "Summarise it", "Make 5 questions from it"]
    : [];

  function submit() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    void send(text);
  }

  return (
    <>
      <div
        className="nm-assistant-scrim"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeAssistant();
        }}
      />
      <aside className="nm-assistant" aria-label="Elpis assistant">
        <header className="nm-assistant-hd">
          <span className="nm-assistant-mark" aria-hidden="true">
            <i className="fa-solid fa-wand-magic-sparkles" />
          </span>
          <div className="nm-assistant-titles">
            <h2 className="nm-assistant-title">Elpis</h2>
            <span className="nm-mono nm-assistant-sub">
              {aiStatus?.chat ? "study assistant" : "not connected"}
            </span>
          </div>
          <div className="nm-assistant-actions">
            {messages.length ? (
              <button
                type="button"
                className="nm-iconbtn nm-iconbtn--sm"
                aria-label="Clear chat"
                onClick={clear}
              >
                <i className="fa-solid fa-eraser" aria-hidden="true" />
              </button>
            ) : null}
            <button
              type="button"
              className="nm-iconbtn nm-iconbtn--sm"
              aria-label="Close assistant"
              onClick={closeAssistant}
            >
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          </div>
        </header>

        {noteTitle ? (
          <div className="nm-assistant-context">
            <span className="nm-chip nm-chip--sm nm-chip--link">
              <i className="fa-solid fa-note-sticky" aria-hidden="true" />
              <span className="nm-chip-name">{noteTitle}</span>
            </span>
          </div>
        ) : null}

        <div ref={listRef} className="nm-assistant-list" aria-live="polite">
          {messages.length === 0 ? (
            <div className="nm-assistant-empty">
              <p className="nm-assistant-lead">
                Ask about the note you are reading, or paste something you want explained.
              </p>
              {prompts.length ? (
                <div className="nm-assistant-suggest">
                  {prompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className="nm-chip nm-chip--sm nm-chip--link"
                      disabled={busy}
                      onClick={() => void send(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="nm-help">Open a note first to give Elpis something to read.</p>
              )}
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className={`nm-assistant-msg is-${message.role}`}>
                {message.role === "assistant" ? (
                  message.content ? (
                    <div
                      className="nm-assistant-prose"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
                    />
                  ) : (
                    <span className="nm-assistant-typing" aria-label="Thinking">
                      <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" />
                    </span>
                  )
                ) : (
                  <p>{message.content}</p>
                )}
              </div>
            ))
          )}
          {error ? <p className="nm-error">{error}</p> : null}
        </div>

        <div className="nm-assistant-form">
          <textarea
            ref={inputRef}
            className="nm-textarea"
            rows={2}
            placeholder={noteTitle ? "Ask about this note…" : "Ask Elpis…"}
            aria-label="Message Elpis"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
          />
          {busy ? (
            <button type="button" className="nm-btn nm-btn--secondary nm-btn--sm" onClick={stop}>
              <i className="fa-solid fa-stop" aria-hidden="true" />
              Stop
            </button>
          ) : (
            <button
              type="button"
              className="nm-btn nm-btn--primary nm-btn--sm"
              onClick={submit}
              disabled={!draft.trim()}
            >
              <i className="fa-solid fa-arrow-up" aria-hidden="true" />
              Send
            </button>
          )}
        </div>
        <p className="nm-help nm-assistant-foot">Elpis can make mistakes. Check the note.</p>
      </aside>
    </>
  );
}
