"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { MoonMark } from "@/components/MoonMark";
import { EmptyState } from "@/components/ui/bits";
import { useOverlays } from "@/components/ui/Overlays";
import { apiGet, apiPost } from "@/lib/api-client";
import { useStore } from "@/lib/store";
import type { Group, GroupPreview } from "@/lib/types";

export default function JoinPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const store = useStore();
  const { toast } = useOverlays();
  const code = String(params.code ?? "").toUpperCase();

  const [preview, setPreview] = useState<GroupPreview | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");
  const [joining, setJoining] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiGet<GroupPreview>(`/api/invites/${encodeURIComponent(code)}`);
      setPreview(data);
      setStatus("ready");
    } catch {
      setStatus("missing");
    }
  }, [code]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function join() {
    setJoining(true);
    try {
      const group = await apiPost<Group>(`/api/invites/${encodeURIComponent(code)}/join`);
      await store.refresh();
      toast(`You joined ${group.name}`, { kind: "success", icon: "fa-user-plus" });
      router.push(`/groups/${group.id}`);
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not join that group.", { kind: "danger" });
    } finally {
      setJoining(false);
    }
  }

  if (status === "loading") {
    return (
      <main className="nm-page max-w-[760px]">
        <EmptyState icon="fa-moon" title="Loading the invite…" />
      </main>
    );
  }

  if (status === "missing" || !preview) {
    return (
      <main className="nm-page max-w-[760px]">
        <EmptyState
          icon="fa-link-slash"
          title="That invite link is not valid"
          body="Check the code with whoever sent it — it looks like CAP-8F3K."
          action={
            <Link className="nm-btn nm-btn--secondary" href="/groups">
              Go to your groups
            </Link>
          }
        />
      </main>
    );
  }

  const isStudy = preview.kind === "study";
  const signedIn = Boolean(store.user);

  return (
    <main className="nm-page max-w-[760px]">
      <div className={`nm-join nm-mk-${preview.color}`}>
        <span className="nm-join-bar" aria-hidden="true" />
        <div>
          <span className="nm-eyebrow">
            {isStudy ? "Study group invite" : "Group invite"}
            {preview.ownerName ? ` from ${preview.ownerName}` : ""}
          </span>
          <div className="nm-join-chips">
            <span className="nm-chip nm-chip--sm nm-chip--muted">
              <i className={`fa-solid ${isStudy ? "fa-note-sticky" : "fa-list-check"}`} aria-hidden="true" />
              {isStudy ? "Study group" : "Project group"}
            </span>
            {!isStudy && preview.subject ? (
              <span className={`nm-chip nm-chip--sm nm-chip--mark nm-mk-${preview.color}`}>
                <span className="nm-dot" />
                {preview.subject}
              </span>
            ) : null}
            <span className="nm-chip nm-chip--sm nm-chip--muted">
              <i className="fa-solid fa-user-group" aria-hidden="true" />
              {preview.memberCount} member{preview.memberCount === 1 ? "" : "s"}
            </span>
          </div>
          <h1 className="nm-title" id="page-title" tabIndex={-1}>
            {preview.name}
          </h1>
          <p className="nm-meta">{preview.description || "No description yet."}</p>

          <div className="nm-join-what">
            {(isStudy
              ? [
                  {
                    icon: "fa-note-sticky",
                    title: "Shared notes by subject",
                    body: preview.topics.length
                      ? `Everyone posts notes and files under ${preview.topics.map((topic) => topic.name).join(", ")}.`
                      : "Everyone posts notes and files under the group’s subjects.",
                  },
                  {
                    icon: "fa-circle-question",
                    title: "Ask for what you are missing",
                    body: "Post a request — “anyone have week 5’s slides?” — and someone answers with a link.",
                  },
                  {
                    icon: "fa-book-open-reader",
                    title: "Study sessions on your calendar",
                    body: "Group study nights land in the same calendar as your deadlines.",
                  },
                ]
              : [
                  {
                    icon: "fa-list-check",
                    title: "Shared task board",
                    body: "Deadlines with reminders, assigned to whoever owns them.",
                  },
                  {
                    icon: "fa-note-sticky",
                    title: "Group notes",
                    body: "Minutes, drive links and feedback in one thread.",
                  },
                  {
                    icon: "fa-calendar-days",
                    title: "One calendar",
                    body: "Their deadlines drop into your calendar automatically.",
                  },
                ]
            ).map((item) => (
              <div className="nm-join-item" key={item.title}>
                <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.body}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="nm-join-actions">
            {preview.isMember ? (
              <Link className="nm-btn nm-btn--primary" href={`/groups/${preview.id}`}>
                You are in — open the group
              </Link>
            ) : signedIn ? (
              <button type="button" className="nm-btn nm-btn--primary" onClick={() => void join()} disabled={joining}>
                <i className="fa-solid fa-user-plus" aria-hidden="true" />
                {joining ? "Joining…" : `Join ${preview.name}`}
              </button>
            ) : (
              <Link
                className="nm-btn nm-btn--primary"
                href={`/login?next=${encodeURIComponent(`/join/${code}`)}`}
              >
                <i className="fa-solid fa-right-to-bracket" aria-hidden="true" />
                Sign in to join
              </Link>
            )}
            <Link className="nm-btn nm-btn--ghost" href="/groups">
              Not now
            </Link>
          </div>
          <p className="nm-help">
            Joining adds you to the member list and puts their deadlines in your calendar. You can leave later
            from the Members tab.
          </p>
        </div>
      </div>
      <p className="nm-meta mt-4 flex items-center gap-2">
        <MoonMark size={16} />
        Neoma · Study OS
      </p>
    </main>
  );
}
