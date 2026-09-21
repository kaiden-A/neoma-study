"use client";

import { useState } from "react";

import { Avatar, EmptyState } from "@/components/ui/bits";
import { Modal } from "@/components/ui/Modal";
import { useOverlays } from "@/components/ui/Overlays";
import { useStore } from "@/lib/store";
import { useNow } from "@/lib/useNow";
import type { Group, MemberUser } from "@/lib/types";

export function MembersPanel({ group }: { group: Group }) {
  const { tasks, removeMember, inviteMember } = useStore();
  const { toast } = useOverlays();
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<MemberUser | null>(null);
  const [reassignTo, setReassignTo] = useState("");

  const inviteUrl = typeof window === "undefined" ? "" : `${window.location.origin}/join/${group.inviteCode}`;
  const now = useNow();
  const weekEnd = now + 7 * 24 * 3_600_000;

  const workload = group.members
    .map((member) => {
      const mine = tasks.filter(
        (task) =>
          task.groupId === group.id &&
          task.status !== "done" &&
          task.dueAt !== null &&
          task.dueAt <= weekEnd &&
          task.assigneeIds.includes(member.id),
      );
      return {
        member,
        count: mine.length,
        overdue: mine.filter((task) => (task.dueAt ?? 0) < now).length,
      };
    })
    .sort((a, b) => b.count - a.count);
  const maxLoad = Math.max(1, ...workload.map((row) => row.count));

  const openFor = (memberId: string) =>
    tasks.filter(
      (task) => task.groupId === group.id && task.status !== "done" && task.assigneeIds.includes(memberId),
    ).length;

  async function addMember() {
    if (!email.trim()) return;
    setInviting(true);
    try {
      const member = await inviteMember(group.id, email.trim());
      toast(`${member.name} added`, { kind: "success", icon: "fa-user-plus" });
      setEmail("");
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not add them.", { kind: "danger" });
    } finally {
      setInviting(false);
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast("Invite link copied", { kind: "success", icon: "fa-link" });
    } catch {
      toast(`Copy failed — code is ${group.inviteCode}`, { kind: "danger", icon: "fa-link" });
    }
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    try {
      await removeMember(group.id, removeTarget.id, reassignTo || null);
      toast(`${removeTarget.name} removed`, { kind: "info" });
      setRemoveTarget(null);
      setReassignTo("");
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not remove them.", { kind: "danger" });
    }
  }

  return (
    <>
      <div className="nm-card">
        <div className="nm-card-hd">
          <h2 className="nm-card-title">Invite people</h2>
          <span className="nm-card-actions nm-mono">code {group.inviteCode}</span>
        </div>
        <div className="nm-card-bd">
          <div className="nm-inline-add nm-inviterow">
            <input
              type="email"
              className="nm-input"
              placeholder="teammate@student.edu"
              aria-label="Invite by email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void addMember();
              }}
            />
            <button type="button" className="nm-btn nm-btn--primary" onClick={() => void addMember()} disabled={inviting}>
              <i className="fa-solid fa-user-plus" aria-hidden="true" />
              {inviting ? "Adding…" : "Add member"}
            </button>
          </div>
          <p className="nm-help">They get an email with the link, and show up as Invited until they sign in.</p>
          <div className="nm-invitelink">
            <span className="nm-label">Invite link</span>
            <div className="nm-inline-add">
              <input className="nm-input nm-mono" readOnly value={inviteUrl} aria-label="Invite link" />
              <button type="button" className="nm-btn nm-btn--secondary" onClick={() => void copyInvite()}>
                <i className="fa-solid fa-copy" aria-hidden="true" />
                Copy
              </button>
              <a className="nm-btn nm-btn--ghost" href={`/join/${group.inviteCode}`} target="_blank" rel="noopener">
                Preview
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="nm-card">
        <div className="nm-card-hd">
          <h2 className="nm-card-title">Workload this week</h2>
          <span className="nm-card-actions">open tasks due in 7 days</span>
        </div>
        <div className="nm-card-bd">
          {workload.map(({ member, count, overdue }) => (
            <div className="nm-loadrow" key={member.id}>
              <span className="nm-loadname">
                <Avatar name={member.name} email={member.email} color={member.color} size={24} />
                {member.name}
              </span>
              <span className={`nm-loadbar nm-mk-${group.color}`}>
                <span
                  className="nm-loadbar-fill"
                  style={{ width: `${Math.round((count / maxLoad) * 100)}%` }}
                />
              </span>
              <span className="nm-loadcount nm-mono">
                {count}
                {overdue > 0 ? ` · ${overdue} late` : ""}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="nm-card">
        <div className="nm-card-hd">
          <h2 className="nm-card-title">
            {group.members.length} member{group.members.length === 1 ? "" : "s"}
          </h2>
        </div>
        <div className="nm-card-bd">
          <div className="nm-memberlist">
            {group.members.map((member) => (
              <div className="nm-memberrow" key={member.id}>
                <Avatar name={member.name} email={member.email} color={member.color} size={36} />
                <div className="nm-memberinfo">
                  <div className="nm-membername">
                    {member.name}
                    {member.id === group.ownerId ? (
                      <span className="nm-chip nm-chip--sm nm-chip--info">
                        <i className="fa-solid fa-crown" aria-hidden="true" />
                        Owner
                      </span>
                    ) : null}
                    {member.invited ? (
                      <span className="nm-chip nm-chip--sm nm-chip--warn">
                        <i className="fa-solid fa-envelope" aria-hidden="true" />
                        Invited
                      </span>
                    ) : null}
                  </div>
                  <span className="nm-mono nm-meta">{member.email}</span>
                </div>
                <div className="nm-memberside">
                  <span className="nm-mono nm-meta">
                    {openFor(member.id)} open task{openFor(member.id) === 1 ? "" : "s"}
                  </span>
                  {member.id !== group.ownerId ? (
                    <button
                      type="button"
                      className="nm-iconbtn nm-iconbtn--sm"
                      aria-label={`Remove ${member.name}`}
                      onClick={() => setRemoveTarget(member)}
                    >
                      <i className="fa-solid fa-user-minus" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          {group.members.length === 0 ? (
            <EmptyState icon="fa-user-group" title="No members yet" body="Invite someone above." compact />
          ) : null}
        </div>
      </div>

      {removeTarget ? (
        <Modal
          title={`Remove ${removeTarget.name}?`}
          size="sm"
          onClose={() => setRemoveTarget(null)}
          footer={
            <>
              <div className="nm-spacer" />
              <button type="button" className="nm-btn nm-btn--ghost" onClick={() => setRemoveTarget(null)}>
                Cancel
              </button>
              <button type="button" className="nm-btn nm-btn--danger" onClick={() => void confirmRemove()}>
                Remove member
              </button>
            </>
          }
        >
          {openFor(removeTarget.id) > 0 ? (
            <>
              <p className="nm-body-text">
                They still have {openFor(removeTarget.id)} open task{openFor(removeTarget.id) === 1 ? "" : "s"} in
                this group. Hand those to someone else?
              </p>
              <div className="nm-field mt-3">
                <label className="nm-label" htmlFor="reassign">
                  Reassign their tasks to
                </label>
                <select
                  id="reassign"
                  className="nm-select"
                  value={reassignTo}
                  onChange={(event) => setReassignTo(event.target.value)}
                >
                  <option value="">Leave unassigned</option>
                  {group.members
                    .filter((member) => member.id !== removeTarget.id)
                    .map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                </select>
              </div>
            </>
          ) : (
            <p className="nm-body-text">They have no open tasks in this group.</p>
          )}
        </Modal>
      ) : null}
    </>
  );
}
