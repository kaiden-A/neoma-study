"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Avatar, EmptyState, MarkerChip } from "@/components/ui/bits";
import { Modal } from "@/components/ui/Modal";
import { Menu } from "@/components/ui/Menu";
import { useOverlays } from "@/components/ui/Overlays";
import { domainOf, fmtRelative } from "@/lib/dates";
import { noteType } from "@/lib/markers";
import { useStore } from "@/lib/store";
import type { Group, Note } from "@/lib/types";

type NoteView = { topic: "all" | "general" | string };

export function NotesPanel({ group }: { group: Group }) {
  const store = useStore();
  const router = useRouter();
  const { toast, confirm } = useOverlays();
  const [topic, setTopic] = useState<NoteView["topic"]>("all");
  const [requestMode, setRequestMode] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [composerTopic, setComposerTopic] = useState("");
  const [answerTarget, setAnswerTarget] = useState<Note | null>(null);
  const [answerUrl, setAnswerUrl] = useState("");
  const [answerTitle, setAnswerTitle] = useState("");
  const [answerBody, setAnswerBody] = useState("");
  const [topicManager, setTopicManager] = useState(false);
  const [newTopic, setNewTopic] = useState("");
  const [menuFor, setMenuFor] = useState<Note | null>(null);
  const [editTarget, setEditTarget] = useState<Note | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [linkDraft, setLinkDraft] = useState({ label: "", url: "" });

  const notes = store.notesForGroup(group.id);
  const filtered = notes.filter((note) => {
    if (topic === "all") return true;
    if (topic === "general") return !note.topicId;
    return note.topicId === topic;
  });
  const sorted = [...filtered].sort((a, b) => {
    const aOpen = a.type === "request" && a.request?.open ? 1 : 0;
    const bOpen = b.type === "request" && b.request?.open ? 1 : 0;
    if (aOpen !== bOpen) return bOpen - aOpen;
    return b.createdAt - a.createdAt;
  });
  const isStudy = group.kind === "study";

  async function publish() {
    const isRequest = requestMode;
    if (!title.trim() && !body.trim() && !linkUrl.trim()) return;
    if (isRequest && !title.trim()) {
      toast("Say what you are looking for", { kind: "danger" });
      return;
    }
    const isLink = !isRequest && linkOpen && linkUrl.trim();
    const finalTitle =
      title.trim() || (isLink ? linkLabel.trim() || domainOf(linkUrl.trim()) : body.trim().slice(0, 48));
    try {
      await store.createGroupNote(group.id, {
        type: isRequest ? "request" : isLink ? "link" : "note",
        title: finalTitle,
        body: body.trim(),
        url: isLink ? linkUrl.trim() : null,
        topicId: composerTopic || null,
      });
      setTitle("");
      setBody("");
      setLinkLabel("");
      setLinkUrl("");
      setLinkOpen(false);
      setRequestMode(false);
      toast(isRequest ? "Request posted — the group can answer it" : `Posted to ${group.name}`, {
        kind: "success",
        icon: isRequest ? "fa-circle-question" : "fa-paper-plane",
      });
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not post that.", { kind: "danger" });
    }
  }

  async function submitAnswer() {
    if (!answerTarget) return;
    if (!answerUrl.trim() && !answerBody.trim()) {
      toast("Add a link or a short note first", { kind: "danger" });
      return;
    }
    try {
      const answer = await store.answerRequest(answerTarget.id, {
        url: answerUrl.trim() || null,
        title: answerTitle.trim() || null,
        body: answerBody.trim(),
      });
      setAnswerTarget(null);
      setAnswerUrl("");
      setAnswerTitle("");
      setAnswerBody("");
      toast("Answer posted", {
        kind: "success",
        icon: "fa-check",
        actionLabel: "Open",
        onAction: () => router.push(`/vault/${answer.id}`),
      });
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not post the answer.", { kind: "danger" });
    }
  }

  async function saveEdit() {
    if (!editTarget) return;
    await store.updateNote(editTarget.id, { title: editTitle.trim() || editTarget.title, body: editBody });
    setEditTarget(null);
    toast("Note updated", { kind: "success" });
  }

  async function removeNote(note: Note) {
    const ok = await confirm({
      title: "Delete this note?",
      message: `“${note.title}” will be removed for everyone.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    await store.deleteNote(note.id);
    toast("Note deleted", { kind: "info" });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/groups/${group.id}?tab=notes`);
      toast("Link copied", { kind: "success" });
    } catch {
      toast("Copy failed", { kind: "danger" });
    }
  }

  return (
    <>
      <div className="nm-toolbar">
        <span className="nm-mono nm-meta">
          {group.topics.length
            ? `${group.topics.length} topic${group.topics.length === 1 ? "" : "s"}`
            : isStudy
              ? "No topics yet — add the units you trade notes from"
              : "No topics yet"}
        </span>
        <div className="nm-toolbar-spacer" />
        <button type="button" className="nm-btn nm-btn--ghost nm-btn--sm" onClick={() => setTopicManager(true)}>
          <i className={`fa-solid ${group.topics.length ? "fa-sliders" : "fa-plus"}`} aria-hidden="true" />
          {group.topics.length ? "Manage topics" : "Add topics"}
        </button>
      </div>

      {group.topics.length ? (
        <div className="nm-filterchips nm-topicbar">
          <button
            type="button"
            className={`nm-chip nm-chip--sm nm-chip--link${topic === "all" ? " is-active" : ""}`}
            onClick={() => setTopic("all")}
          >
            All<span className="nm-mono">{notes.length}</span>
          </button>
          {group.topics.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nm-chip nm-chip--sm nm-chip--link nm-mk-${item.color}${topic === item.id ? " is-active" : ""}`}
              onClick={() => setTopic(item.id)}
            >
              {item.name}
              <span className="nm-mono">{notes.filter((note) => note.topicId === item.id).length}</span>
            </button>
          ))}
          <button
            type="button"
            className={`nm-chip nm-chip--sm nm-chip--link${topic === "general" ? " is-active" : ""}`}
            onClick={() => setTopic("general")}
          >
            General<span className="nm-mono">{notes.filter((note) => !note.topicId).length}</span>
          </button>
        </div>
      ) : null}

      <div className={`nm-card${isStudy ? " nm-composer--study" : ""}`}>
        <div className="nm-card-bd">
          <div className="nm-composer">
            <input
              className="nm-input nm-composer-title"
              placeholder={requestMode ? "Title — what are you after?" : "Title (optional)"}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <textarea
              className="nm-textarea"
              rows={3}
              placeholder={
                requestMode
                  ? "Add the detail — which lecture, which week, what you can trade."
                  : isStudy
                    ? "What did you find useful? Paste the summary, the method, the link."
                    : "Minutes, decisions, what changed…"
              }
              value={body}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  void publish();
                }
              }}
            />
            {linkOpen ? (
              <div className="nm-composer-link">
                <input
                  className="nm-input"
                  placeholder="Link label"
                  value={linkLabel}
                  onChange={(event) => setLinkLabel(event.target.value)}
                />
                <input
                  className="nm-input"
                  placeholder="https://…"
                  value={linkUrl}
                  onChange={(event) => setLinkUrl(event.target.value)}
                />
              </div>
            ) : null}
            <div className="nm-composer-actions">
              <button
                type="button"
                className={`nm-btn nm-btn--ghost nm-btn--sm${requestMode ? " is-active" : ""}`}
                onClick={() => setRequestMode((current) => !current)}
              >
                <i className="fa-solid fa-circle-question" aria-hidden="true" />
                {requestMode ? "Request mode on" : "Ask for a note"}
              </button>
              <button
                type="button"
                className="nm-btn nm-btn--ghost nm-btn--sm"
                onClick={() => setLinkOpen((current) => !current)}
              >
                <i className="fa-solid fa-link" aria-hidden="true" />
                Include a link
              </button>
              <div className="nm-spacer" />
              <button type="button" className="nm-btn nm-btn--primary nm-btn--sm" onClick={() => void publish()}>
                <i className={`fa-solid ${requestMode ? "fa-circle-question" : "fa-paper-plane"}`} aria-hidden="true" />
                {requestMode ? "Post request" : "Post to group"}
              </button>
            </div>
            {group.topics.length ? (
              <div className="nm-composer-topic">
                <div className="nm-field">
                  <label className="nm-label" htmlFor="np-topic">
                    Topic
                  </label>
                  <select
                    id="np-topic"
                    className="nm-select"
                    value={composerTopic}
                    onChange={(event) => setComposerTopic(event.target.value)}
                  >
                    <option value="">General</option>
                    {group.topics.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon="fa-note-sticky"
          title={topic === "all" ? "Nothing shared yet" : "Nothing under this topic yet"}
          body={
            isStudy
              ? "Share what you have — a summary, a photo, a link — or ask the group for what they are missing."
              : "Post minutes, decisions or a link to the shared drive. Everyone in the group sees it."
          }
        />
      ) : (
        <div className="nm-notefeed">
          {sorted.map((note) => {
            const type = noteType(note.type);
            const author = store.userById(note.createdBy ?? "");
            const isRequest = note.type === "request";
            const topicInfo = note.topicId ? group.topics.find((item) => item.id === note.topicId) : null;
            return (
              <article className={`nm-notefeed-item nm-mk-${type.marker}${isRequest ? " nm-request" : ""}${isRequest && note.request?.open ? " is-open" : ""}`} key={note.id}>
                <span className="nm-notefeed-icon">
                  <i className={`fa-solid ${type.icon}`} aria-hidden="true" />
                </span>
                <div className="nm-notefeed-bd">
                  <div className="nm-notefeed-top">
                    {author ? <Avatar name={author.name} email={author.email} color={author.color} size={22} /> : null}
                    <span className="nm-notefeed-author">{author?.name ?? "Someone"}</span>
                    <span className="nm-mono">{fmtRelative(note.createdAt)}</span>
                    {topicInfo ? <MarkerChip name={topicInfo.name} markerKey={topicInfo.color} small /> : null}
                    {isRequest ? (
                      note.request?.open ? (
                        <span className="nm-chip nm-chip--sm nm-chip--warn">
                          <i className="fa-solid fa-hourglass-half" aria-hidden="true" />
                          Waiting
                        </span>
                      ) : (
                        <span className="nm-chip nm-chip--sm nm-chip--ok">
                          <i className="fa-solid fa-check" aria-hidden="true" />
                          Answered
                        </span>
                      )
                    ) : null}
                    {note.type === "link" && note.url ? (
                      <a className="nm-notefeed-open nm-link" href={note.url} target="_blank" rel="noopener">
                        Open link
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="nm-iconbtn nm-iconbtn--sm"
                      aria-label="Note actions"
                      onClick={() => setMenuFor(note)}
                    >
                      <i className="fa-solid fa-ellipsis" aria-hidden="true" />
                    </button>
                  </div>
                  <h3 className="nm-notefeed-title">{note.title}</h3>
                  {note.body ? <p className="nm-notefeed-body">{note.body}</p> : null}
                  {isRequest && note.request?.open ? (
                    <div className="nm-request-actions">
                      <button
                        type="button"
                        className="nm-btn nm-btn--primary nm-btn--sm"
                        onClick={() => setAnswerTarget(note)}
                      >
                        <i className="fa-solid fa-share-nodes" aria-hidden="true" />
                        Answer with a link
                      </button>
                    </div>
                  ) : null}
                  {isRequest && !note.request?.open ? (
                    <div className="nm-request-answer">
                      <i className="fa-solid fa-check" aria-hidden="true" />
                      Answered by {store.userName(note.request?.answeredBy)}
                      {note.request?.answerNoteId ? (
                        <>
                          {" · "}
                          <a className="nm-link" href={`/vault/${note.request.answerNoteId}`}>
                            {store.noteById(note.request.answerNoteId)?.title ?? "the answer"}
                          </a>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="nm-card">
        <div className="nm-card-hd">
          <h2 className="nm-card-title">Group links</h2>
          <span className="nm-card-actions">briefs, drives, references</span>
        </div>
        <div className="nm-card-bd">
          {group.links.length ? (
            <div className="nm-linklist">
              {group.links.map((link) => (
                <div className="nm-linkrow" key={link.id}>
                  <i className="fa-solid fa-link" aria-hidden="true" />
                  <a className="nm-linkrow-label" href={link.url} target="_blank" rel="noopener">
                    {link.label}
                  </a>
                  <span className="nm-linkrow-url nm-mono">{domainOf(link.url)}</span>
                  <button
                    type="button"
                    className="nm-iconbtn nm-iconbtn--sm"
                    aria-label="Remove link"
                    onClick={() => void store.removeGroupLink(group.id, link.id)}
                  >
                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="nm-inline-add">
            <input
              className="nm-input"
              placeholder="Label"
              value={linkDraft.label}
              onChange={(event) => setLinkDraft((current) => ({ ...current, label: event.target.value }))}
            />
            <input
              className="nm-input"
              placeholder="https://…"
              value={linkDraft.url}
              onChange={(event) => setLinkDraft((current) => ({ ...current, url: event.target.value }))}
            />
            <button
              type="button"
              className="nm-btn nm-btn--secondary"
              onClick={() => {
                if (!linkDraft.url.trim()) return;
                void store
                  .addGroupLink(group.id, linkDraft.label.trim(), linkDraft.url.trim())
                  .then(() => {
                    setLinkDraft({ label: "", url: "" });
                    toast("Link attached", { kind: "success", icon: "fa-link" });
                  })
                  .catch((caught: unknown) =>
                    toast(caught instanceof Error ? caught.message : "Could not attach that.", { kind: "danger" }),
                  );
              }}
            >
              Attach
            </button>
          </div>
        </div>
      </div>

      {answerTarget ? (
        <Modal
          title={`Answer “${answerTarget.title}”`}
          subtitle="A link works best — a drive folder, the slides, or your own note."
          size="sm"
          onClose={() => setAnswerTarget(null)}
          footer={
            <>
              <div className="nm-spacer" />
              <button type="button" className="nm-btn nm-btn--ghost" onClick={() => setAnswerTarget(null)}>
                Cancel
              </button>
              <button type="button" className="nm-btn nm-btn--primary" onClick={() => void submitAnswer()}>
                Post answer
              </button>
            </>
          }
        >
          <div className="nm-field">
            <label className="nm-label" htmlFor="an-url">
              Link
            </label>
            <input
              id="an-url"
              type="url"
              className="nm-input"
              placeholder="https://…"
              value={answerUrl}
              onChange={(event) => setAnswerUrl(event.target.value)}
            />
          </div>
          <div className="nm-field">
            <label className="nm-label" htmlFor="an-title">
              Title
            </label>
            <input
              id="an-title"
              className="nm-input"
              placeholder="Leave blank to use the domain"
              value={answerTitle}
              onChange={(event) => setAnswerTitle(event.target.value)}
            />
          </div>
          <div className="nm-field">
            <label className="nm-label" htmlFor="an-body">
              Note
            </label>
            <textarea
              id="an-body"
              className="nm-textarea"
              rows={3}
              placeholder="Anything they should know."
              value={answerBody}
              onChange={(event) => setAnswerBody(event.target.value)}
            />
          </div>
        </Modal>
      ) : null}

      {editTarget ? (
        <Modal
          title="Edit note"
          onClose={() => setEditTarget(null)}
          footer={
            <>
              <div className="nm-spacer" />
              <button type="button" className="nm-btn nm-btn--ghost" onClick={() => setEditTarget(null)}>
                Cancel
              </button>
              <button type="button" className="nm-btn nm-btn--primary" onClick={() => void saveEdit()}>
                Save note
              </button>
            </>
          }
        >
          <div className="nm-field">
            <label className="nm-label" htmlFor="en-title">
              Title
            </label>
            <input
              id="en-title"
              className="nm-input"
              value={editTitle}
              onChange={(event) => setEditTitle(event.target.value)}
            />
          </div>
          <div className="nm-field">
            <label className="nm-label" htmlFor="en-body">
              Body
            </label>
            <textarea
              id="en-body"
              className="nm-textarea"
              rows={6}
              value={editBody}
              onChange={(event) => setEditBody(event.target.value)}
            />
          </div>
        </Modal>
      ) : null}

      {topicManager ? (
        <Modal
          title={`Topics in ${group.name}`}
          subtitle="Shared notes are filed under these, so the crew can filter by unit."
          size="sm"
          onClose={() => setTopicManager(false)}
          footer={
            <>
              <div className="nm-spacer" />
              <button type="button" className="nm-btn nm-btn--primary" onClick={() => setTopicManager(false)}>
                Done
              </button>
            </>
          }
        >
          {group.topics.length === 0 ? (
            <p className="nm-help mb-3">No topics yet. Add the units you trade notes from.</p>
          ) : (
            <div className="nm-topiclist">
              {group.topics.map((item) => (
                <div className="nm-topicrow" key={item.id}>
                  <span className={`nm-dot nm-mk-${item.color}`} aria-hidden="true" />
                  <input
                    className="nm-input"
                    defaultValue={item.name}
                    aria-label="Topic name"
                    onBlur={(event) => {
                      const value = event.target.value.trim();
                      if (value && value !== item.name) {
                        void store
                          .renameTopic(group.id, item.id, value)
                          .then(() => toast("Topic renamed", { kind: "success" }));
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="nm-iconbtn nm-iconbtn--sm"
                    aria-label={`Remove ${item.name}`}
                    onClick={() => void store.removeTopic(group.id, item.id)}
                  >
                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="nm-inline-add">
            <input
              className="nm-input"
              placeholder="Add a topic, e.g. MATH201"
              value={newTopic}
              onChange={(event) => setNewTopic(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && newTopic.trim()) {
                  void store.addTopic(group.id, newTopic.trim()).then(() => setNewTopic(""));
                }
              }}
            />
            <button
              type="button"
              className="nm-btn nm-btn--secondary"
              onClick={() => {
                if (!newTopic.trim()) return;
                void store.addTopic(group.id, newTopic.trim()).then(() => setNewTopic(""));
              }}
            >
              Add
            </button>
          </div>
        </Modal>
      ) : null}

      {menuFor ? (
        <Menu
          label="Note actions"
          onClose={() => setMenuFor(null)}
          style={{ position: "fixed", right: 24, top: 150 }}
          items={[
            {
              label: "Edit note",
              icon: "fa-pen",
              onSelect: () => {
                setEditTitle(menuFor.title);
                setEditBody(menuFor.body);
                setEditTarget(menuFor);
              },
            },
            { label: "Copy link", icon: "fa-link", onSelect: () => void copyLink() },
            { separator: true },
            { label: "Delete note", icon: "fa-trash", danger: true, onSelect: () => void removeNote(menuFor) },
          ]}
        />
      ) : null}
    </>
  );
}
