"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { NewGroupModal } from "@/components/groups/NewGroupModal";
import { Avatar, EmptyState, MarkerChip, Progress } from "@/components/ui/bits";
import { fmtRelative, truncate } from "@/lib/dates";
import { useStore } from "@/lib/store";
import { useNow } from "@/lib/useNow";

export default function GroupsPage() {
  const { ready, groups, groupStats, studyStats } = useStore();
  const router = useRouter();
  const now = useNow();
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);

  async function openCode() {
    const clean = code.trim().toUpperCase();
    if (!clean) return;
    try {
      const response = await fetch(`/api/invites/${encodeURIComponent(clean)}`, { cache: "no-store" });
      if (!response.ok) {
        setCodeError("No group matches that code. Check the link your group sent.");
        return;
      }
      router.push(`/join/${clean}`);
    } catch {
      setCodeError("No group matches that code. Check the link your group sent.");
    }
  }

  return (
    <div className="nm-page">
      <div className="nm-page-head">
        <div className="nm-head-top">
          <span className="nm-eyebrow">
            Groups · <span className="nm-mono">{groups.length} active</span>
          </span>
        </div>
        <div className="nm-head-row">
          <h1 className="nm-title" id="page-title" tabIndex={-1}>
            Groups
          </h1>
          <div className="nm-head-actions">
            <button type="button" className="nm-btn nm-btn--primary" onClick={() => setCreating(true)}>
              <i className="fa-solid fa-plus" aria-hidden="true" />
              New group
            </button>
          </div>
        </div>
        <p className="nm-meta">
          Project groups run a task board. Study groups trade notes and book sessions — invite by email or share
          the link.
        </p>
      </div>

      <div className="nm-groupgrid">
        {groups.map((group) => {
          const stats = groupStats(group.id);
          const study = studyStats(group.id);
          return (
            <Link key={group.id} href={`/groups/${group.id}`} className={`nm-groupcard nm-mk-${group.color}`}>
              <span className="nm-groupcard-bar" aria-hidden="true" />
              <div className="nm-groupcard-bd">
                <div className="nm-groupcard-top">
                  <span className="nm-chip nm-chip--sm nm-chip--muted">
                    <i className={`fa-solid ${group.kind === "study" ? "fa-note-sticky" : "fa-list-check"}`} aria-hidden="true" />
                    {group.kind === "study" ? "Study" : "Project"}
                  </span>
                  {group.kind === "project" && group.subject ? (
                    <MarkerChip name={group.subject} markerKey={group.color} small />
                  ) : null}
                  {group.kind === "study" && study.openRequests > 0 ? (
                    <span className="nm-chip nm-chip--sm nm-chip--warn">
                      <i className="fa-solid fa-circle-question" aria-hidden="true" />
                      {study.openRequests} request{study.openRequests === 1 ? "" : "s"}
                    </span>
                  ) : null}
                  {group.kind === "project" && stats.overdue > 0 ? (
                    <span className="nm-chip nm-chip--sm nm-chip--danger">
                      <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
                      {stats.overdue} overdue
                    </span>
                  ) : null}
                </div>
                <h2 className="nm-groupcard-title">{group.name}</h2>
                <p className="nm-groupcard-desc">
                  {truncate(group.description || "No description yet.", 96)}
                </p>
                <div className="nm-groupcard-meta nm-mono">
                  {group.kind === "study" ? (
                    <>
                      <span>
                        {study.notes} shared note{study.notes === 1 ? "" : "s"}
                      </span>
                      <span>
                        {study.topicCount} subject{study.topicCount === 1 ? "" : "s"}
                      </span>
                      <span>
                        {study.files} file{study.files === 1 ? "" : "s"}
                      </span>
                      <span>
                        {study.nextSession ? `session ${fmtRelative(study.nextSession.startsAt, now)}` : "no session booked"}
                      </span>
                    </>
                  ) : (
                    <>
                      <span>{stats.total} tasks</span>
                      <span>{stats.done} done</span>
                      <span>
                        {stats.next ? `next ${fmtRelative(stats.next.dueAt ?? now, now)}` : "nothing open"}
                      </span>
                    </>
                  )}
                </div>
                <div className="nm-groupcard-ft">
                  {group.kind === "study" ? (
                    <div className="nm-inline-actions">
                      {group.topics.slice(0, 4).map((topic) => (
                        <MarkerChip key={topic.id} name={topic.name} markerKey={topic.color} small />
                      ))}
                      {group.topics.length === 0 ? <span className="nm-mono nm-meta">no subjects yet</span> : null}
                    </div>
                  ) : (
                    <div className="nm-groupcard-prog">
                      <Progress pct={stats.pct} markerKey={group.color} label={`${group.name} progress`} />
                      <span className="nm-mono">{stats.pct}%</span>
                    </div>
                  )}
                  <span className="nm-avatars">
                    {group.members.slice(0, 4).map((member) => (
                      <Avatar key={member.id} name={member.name} email={member.email} color={member.color} size={26} />
                    ))}
                    {group.members.length > 4 ? (
                      <span className="nm-avatar nm-avatar--more">+{group.members.length - 4}</span>
                    ) : null}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}

        <div className="nm-card nm-card--join">
          <div className="nm-card-bd">
            <h2 className="nm-card-title">Have an invite link?</h2>
            <p className="nm-meta">
              Paste the code your group sent you — it looks like <span className="nm-mono">CAP-8F3K</span>.
            </p>
            <div className="nm-inline-add">
              <input
                className="nm-input"
                placeholder="Group code"
                aria-label="Group invite code"
                value={code}
                onChange={(event) => {
                  setCode(event.target.value);
                  setCodeError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void openCode();
                }}
              />
              <button type="button" className="nm-btn nm-btn--secondary" onClick={() => void openCode()}>
                Open
              </button>
            </div>
            {codeError ? <p className="nm-error">{codeError}</p> : null}
          </div>
        </div>
      </div>

      {ready && groups.length === 0 ? (
        <EmptyState
          icon="fa-users"
          title="No groups yet"
          body="Start one for a unit, a lab team or a presentation crew. Invite by email or share the link."
          action={
            <button type="button" className="nm-btn nm-btn--primary" onClick={() => setCreating(true)}>
              Create your first group
            </button>
          }
        />
      ) : null}

      {creating ? (
        <NewGroupModal
          onClose={() => setCreating(false)}
        />
      ) : null}
    </div>
  );
}
