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
    context,
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

  const prompts =
    context?.kind === "note"
      ? ["Explain this note", "Summarise it", "Make 5 questions from it"]
      : context?.kind === "course"
        ? ["What's due next?", "Summarise this course", "What did I miss?"]
        : context?.kind === "courses"
          ? ["What needs attention this week?", "Which course needs the most work?"]
          : [];
  const placeholder =
    context?.kind === "note"
      ? "Ask about this note…"
      : context?.kind === "course"
        ? "Ask about this course…"
        : context?.kind === "courses"
          ? "Ask about your courses…"
          : "Ask Elpis…";

  function submit() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    if (inputRef.current) inputRef.current.style.height = "auto";
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

        {context ? (
          <div className="nm-assistant-context">
            <span className="nm-chip nm-chip--sm nm-chip--link">
              <i
                className={`fa-solid ${
                  context.kind === "note"
                    ? "fa-note-sticky"
                    : context.kind === "course"
                      ? "fa-book-open"
                      : "fa-book-bookmark"
                }`}
                aria-hidden="true"
              />
              <span className="nm-chip-name">{context.label}</span>
            </span>
          </div>
        ) : null}

        <div ref={listRef} className="nm-assistant-list" aria-live="polite">
          {messages.length === 0 ? (
            <div className="nm-assistant-empty">
              <p className="nm-assistant-lead">
                Ask about the page you are on, or paste something you want explained.
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
                <p className="nm-help">Open a note or a course first to give Elpis something to read.</p>
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

        <form
          className="nm-assistant-composer"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <textarea
            ref={inputRef}
            className="nm-assistant-input"
            rows={1}
            placeholder={placeholder}
            aria-label="Message Elpis"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              const field = event.target;
              field.style.height = "auto";
              field.style.height = `${Math.min(field.scrollHeight, 140)}px`;
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
          />
          {busy ? (
            <button
              type="button"
              className="nm-assistant-send is-stop"
              aria-label="Stop the reply"
              onClick={stop}
            >
              <i className="fa-solid fa-stop" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="submit"
              className="nm-assistant-send"
              aria-label="Send message"
              disabled={!draft.trim()}
            >
              <i className="fa-solid fa-arrow-up" aria-hidden="true" />
            </button>
          )}
        </form>
        <p className="nm-help nm-assistant-foot">Elpis can make mistakes. Check the note.</p>
      </aside>
    </>
  );
}
