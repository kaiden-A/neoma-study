"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { MembersPanel } from "@/components/groups/MembersPanel";
import { NotesPanel } from "@/components/groups/NotesPanel";
import { TasksPanel } from "@/components/groups/TasksPanel";
import { EventModal } from "@/components/calendar/EventModal";
import { Avatar, Dial, EmptyState, MarkerChip } from "@/components/ui/bits";
import { Modal } from "@/components/ui/Modal";
import { Menu } from "@/components/ui/Menu";
import { useOverlays } from "@/components/ui/Overlays";
import { fmtRelative } from "@/lib/dates";
import { MARKERS } from "@/lib/markers";
import { useStore } from "@/lib/store";
import { useNow } from "@/lib/useNow";

type TabId = "tasks" | "notes" | "members" | "plan";

export function GroupPage({ groupId }: { groupId: string }) {
  const store = useStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast, confirm, prompt } = useOverlays();
  const [menuOpen, setMenuOpen] = useState(false);
  const [colourOpen, setColourOpen] = useState(false);
  const [topicManagerOpen, setTopicManagerOpen] = useState(false);
  const [sessionStart, setSessionStart] = useState<number | null>(null);
  const now = useNow();

  const group = store.groupById(groupId);

  if (!group) {
    return (
      <div className="nm-page">
        <EmptyState
          icon="fa-circle-question"
          title={store.ready ? "That group is gone" : "Loading…"}
          body={store.ready ? "It may have been deleted. Head back to the group list." : undefined}
          action={
            store.ready ? (
              <Link className="nm-btn nm-btn--secondary" href="/groups">
                Back to groups
              </Link>
            ) : undefined
          }
        />
      </div>
    );
  }

  const stats = store.groupStats(group.id);
  const study = store.studyStats(group.id);
  const notesCount = store.notesForGroup(group.id).length;
  const current = group;

  const tabs: { id: TabId; label: string; icon: string; count: number }[] =
    group.kind === "study"
      ? [
          { id: "notes", label: "Notes", icon: "fa-note-sticky", count: notesCount },
          { id: "members", label: "Members", icon: "fa-user-group", count: group.members.length },
          { id: "plan", label: "Plan", icon: "fa-list-check", count: stats.open },
        ]
      : [
          { id: "tasks", label: "Tasks", icon: "fa-list-check", count: stats.open },
          { id: "notes", label: "Notes", icon: "fa-note-sticky", count: notesCount },
          { id: "members", label: "Members", icon: "fa-user-group", count: group.members.length },
        ];

  const fallbackTab: TabId = group.kind === "study" ? "notes" : "tasks";
  const requested = searchParams.get("tab") as TabId | null;
  const activeTab = tabs.some((tab) => tab.id === requested) ? (requested as TabId) : fallbackTab;

  const inviteUrl = typeof window === "undefined" ? "" : `${window.location.origin}/join/${current.inviteCode}`;

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast("Invite link copied", { kind: "success", icon: "fa-link" });
    } catch {
      toast(`Copy failed — code is ${current.inviteCode}`, { kind: "danger", icon: "fa-link" });
    }
  }

  async function rename() {
    const name = await prompt({
      title: "Rename group",
      label: "Group name",
      value: current.name,
      confirmLabel: "Rename",
    });
    if (name && name.trim()) await store.updateGroup(current.id, { name: name.trim() });
  }

  async function changeColour(markerKey: string) {
    await store.updateGroup(current.id, { color: markerKey });
    setColourOpen(false);
    toast("Colour updated", { kind: "success" });
  }

  async function remove() {
    const ok = await confirm({
      title: `Delete “${current.name}”?`,
      message: "All of its tasks, shared notes and activity will be removed. This cannot be undone.",
      confirmLabel: "Delete group",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await store.deleteGroup(current.id);
      toast("Group deleted", { kind: "info" });
      router.push("/groups");
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not delete the group.", { kind: "danger" });
    }
  }

  return (
    <div className="nm-page">
      <div className="nm-ghead">
        <div className="nm-ghead-top">
          <Link className="nm-backlink" href="/groups">
            <i className="fa-solid fa-arrow-left" aria-hidden="true" />
            All groups
          </Link>
          <div className="nm-ghead-actions">
            {group.kind === "study" ? (
              <button
                type="button"
                className="nm-btn nm-btn--primary nm-btn--sm"
                onClick={() => {
                  const start = new Date();
                  start.setDate(start.getDate() + 1);
                  start.setHours(19, 0, 0, 0);
                  setSessionStart(start.getTime());
                }}
              >
                <i className="fa-solid fa-book-open-reader" aria-hidden="true" />
                Schedule session
              </button>
            ) : null}
            <button
              type="button"
              className="nm-btn nm-btn--secondary nm-btn--sm"
              onClick={() => void copyInvite()}
            >
              <i className="fa-solid fa-user-plus" aria-hidden="true" />
              Invite
            </button>
            <button
              type="button"
              className="nm-iconbtn"
              aria-label="Group actions"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <i className="fa-solid fa-ellipsis" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="nm-ghead-main">
          <span className={`nm-ghead-bar nm-mk-${group.color}`} aria-hidden="true" />
          <div>
            <div className="nm-ghead-chips">
              <span className="nm-chip nm-chip--sm nm-chip--muted">
                <i className={`fa-solid ${group.kind === "study" ? "fa-note-sticky" : "fa-list-check"}`} aria-hidden="true" />
                {group.kind === "study" ? "Study group" : "Project group"}
              </span>
              {group.subject ? <MarkerChip name={group.subject} markerKey={group.color} small /> : null}
              {group.kind === "project" && stats.overdue > 0 ? (
                <span className="nm-chip nm-chip--sm nm-chip--danger">
                  <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
                  {stats.overdue} overdue
                </span>
              ) : null}
            </div>
            <h1 className="nm-title" id="page-title" tabIndex={-1}>
              {group.name}
            </h1>
            <p className="nm-meta">
              {group.description || "No description yet — add one from the group menu."}
            </p>
          </div>
          <div className="nm-ghead-side">
            <span className="nm-avatars">
              {group.members.slice(0, 5).map((member) => (
                <Avatar key={member.id} name={member.name} email={member.email} color={member.color} size={28} />
              ))}
              {group.members.length > 5 ? (
                <span className="nm-avatar nm-avatar--more">+{group.members.length - 5}</span>
              ) : null}
            </span>
          </div>
        </div>

        <div className="nm-strip">
          {group.kind === "project" ? (
            <>
              <span className="nm-mono">{stats.open} open</span>
              <span className="nm-mono">
                {stats.done}/{stats.total} done
              </span>
              <span className="nm-mono">{stats.pct}%</span>
              {stats.next?.dueAt ? (
                <span className="nm-strip-next">
                  <Dial dueAt={stats.next.dueAt} showLabel={false} />
                  next {fmtRelative(stats.next.dueAt, now)}
                </span>
              ) : (
                <span className="nm-mono nm-meta">nothing dated</span>
              )}
            </>
          ) : (
            <>
              <span className="nm-mono">
                {study.notes} shared note{study.notes === 1 ? "" : "s"}
              </span>
              <span className="nm-mono">
                {group.members.length} member{group.members.length === 1 ? "" : "s"}
              </span>
              <span className="nm-mono">
                {study.topicCount} topic{study.topicCount === 1 ? "" : "s"}
              </span>
              {study.openRequests > 0 ? (
                <span className="nm-chip nm-chip--sm nm-chip--warn">
                  <i className="fa-solid fa-hourglass-half" aria-hidden="true" />
                  {study.openRequests} request{study.openRequests === 1 ? "" : "s"} waiting
                </span>
              ) : null}
              {study.nextSession ? (
                <span className="nm-strip-next">
                  <Dial dueAt={study.nextSession.startsAt} showLabel={false} />
                  next session {fmtRelative(study.nextSession.startsAt, now)}
                </span>
              ) : (
                <span className="nm-mono nm-meta">no session booked</span>
              )}
            </>
          )}
        </div>

        <nav className="nm-tabs" aria-label="Group sections">
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              href={`/groups/${group.id}${tab.id === fallbackTab ? "" : `?tab=${tab.id}`}`}
              className={`nm-tab${activeTab === tab.id ? " is-active" : ""}`}
            >
              <i className={`fa-solid ${tab.icon}`} aria-hidden="true" />
              {tab.label}
              <span className="nm-tab-count">{tab.count}</span>
            </Link>
          ))}
        </nav>
      </div>

      <div className="nm-tabpanel">
        {activeTab === "members" ? <MembersPanel group={group} /> : null}
        {activeTab === "tasks" || activeTab === "plan" ? <TasksPanel group={group} /> : null}
        {activeTab === "notes" ? <NotesPanel group={group} /> : null}
      </div>

      {menuOpen ? (
        <Menu
          label="Group actions"
          onClose={() => setMenuOpen(false)}
          style={{ right: 24, top: 96 }}
          items={[
            {
              header: `${group.kind === "study" ? "Study group" : "Project group"}${
                group.subject ? ` · ${group.subject}` : ""
              }`,
            },
            { label: "Copy invite link", icon: "fa-link", onSelect: () => void copyInvite() },
            { label: "Rename group", icon: "fa-pen", onSelect: () => void rename() },
            { label: "Change colour", icon: "fa-palette", onSelect: () => setColourOpen(true) },
            ...(group.kind === "study"
              ? [{ label: "Manage topics", icon: "fa-tags", onSelect: () => setTopicManagerOpen(true) }]
              : []),
            {
              label: "New invite code",
              icon: "fa-rotate",
              onSelect: () => {
                void store
                  .regenerateInvite(group.id)
                  .then(() => toast("New invite code generated", { kind: "success" }))
                  .catch((caught: unknown) =>
                    toast(caught instanceof Error ? caught.message : "Could not rotate the code.", {
                      kind: "danger",
                    }),
                  );
              },
            },
            { separator: true },
            { label: "Delete group", icon: "fa-trash", danger: true, onSelect: () => void remove() },
          ]}
        />
      ) : null}

      {colourOpen ? (
        <Modal title="Group colour" size="sm" onClose={() => setColourOpen(false)}>
          <div className="nm-swatches" role="radiogroup" aria-label="Group colour">
            {MARKERS.map((item) => (
              <label
                key={item.key}
                className={`nm-swatch nm-mk-${item.key}${group.color === item.key ? " is-selected" : ""}`}
                title={item.label}
              >
                <input
                  type="radio"
                  name="gc"
                  checked={group.color === item.key}
                  onChange={() => void changeColour(item.key)}
                />
                <span className="nm-swatch-dot" />
                <span className="nm-sr">{item.label}</span>
              </label>
            ))}
          </div>
        </Modal>
      ) : null}

      {topicManagerOpen ? (
        <TopicManager
          groupId={group.id}
          onClose={() => setTopicManagerOpen(false)}
        />
      ) : null}

      {sessionStart !== null ? (
        <EventModal
          defaults={{
            type: "session",
            groupId: group.id,
            start: sessionStart,
            title: `${group.name} session`,
          }}
          onClose={() => setSessionStart(null)}
        />
      ) : null}
    </div>
  );
}

function TopicManager({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const store = useStore();
  const group = store.groupById(groupId);
  const { toast } = useOverlays();
  const [name, setName] = useState("");

  if (!group) return null;

  return (
    <Modal
      title={`Topics in ${group.name}`}
      subtitle="Shared notes are filed under these, so the crew can filter by unit."
      size="sm"
      onClose={onClose}
      footer={
        <>
          <div className="nm-spacer" />
          <button type="button" className="nm-btn nm-btn--primary" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      {group.topics.length === 0 ? (
        <p className="nm-help mb-3">No topics yet. Add the units you trade notes from.</p>
      ) : (
        <div className="nm-topiclist">
          {group.topics.map((topic) => (
            <div className="nm-topicrow" key={topic.id}>
              <span className={`nm-dot nm-mk-${topic.color}`} aria-hidden="true" />
              <input
                className="nm-input"
                defaultValue={topic.name}
                aria-label="Topic name"
                onBlur={(event) => {
                  const value = event.target.value.trim();
                  if (value && value !== topic.name) {
                    void store
                      .renameTopic(group.id, topic.id, value)
                      .then(() => toast("Topic renamed", { kind: "success" }));
                  }
                }}
              />
              <button
                type="button"
                className="nm-iconbtn nm-iconbtn--sm"
                aria-label={`Remove ${topic.name}`}
                onClick={() => void store.removeTopic(group.id, topic.id)}
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
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && name.trim()) {
              void store.addTopic(group.id, name.trim()).then(() => setName(""));
            }
          }}
        />
        <button
          type="button"
          className="nm-btn nm-btn--secondary"
          onClick={() => {
            if (!name.trim()) return;
            void store.addTopic(group.id, name.trim()).then(() => setName(""));
          }}
        >
          Add
        </button>
      </div>
    </Modal>
  );
}
