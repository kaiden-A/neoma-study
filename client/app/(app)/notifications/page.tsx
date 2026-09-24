"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/ui/bits";
import { useOverlays } from "@/components/ui/Overlays";
import { fmtDateTime, fmtRelative } from "@/lib/dates";
import { useStore } from "@/lib/store";
import { useNow } from "@/lib/useNow";

const GROUPS = [
  { id: "overdue", label: "Overdue" },
  { id: "due", label: "Due soon" },
  { id: "sessions", label: "Study sessions" },
  { id: "assigned", label: "Assigned to you" },
  { id: "exams", label: "Exams" },
  { id: "notes", label: "Shared with you" },
] as const;

export default function NotificationsPage() {
  const store = useStore();
  const router = useRouter();
  const { toast } = useOverlays();
  const now = useNow();
  const items = store.notifications;
  const unread = items.filter((item) => !item.read).length;

  function openItem(id: string, route: string) {
    void store.markNotificationsRead([id]).catch(() => {});
    router.push(route);
  }

  return (
    <div className="nm-page">
      <div className="nm-page-head">
        <div className="nm-head-top">
          <span className="nm-eyebrow">
            Notifications · <span className="nm-mono">{unread} unread</span>
          </span>
        </div>
        <div className="nm-head-row">
          <h1 className="nm-title" id="page-title" tabIndex={-1}>
            What needs your attention
          </h1>
          <div className="nm-head-actions">
            {unread > 0 ? (
              <button
                type="button"
                className="nm-btn nm-btn--secondary"
                onClick={() => {
                  void store.markAllNotificationsRead().catch(() => {});
                  toast("All caught up", { kind: "success" });
                }}
              >
                <i className="fa-solid fa-check-double" aria-hidden="true" />
                Mark all read
              </button>
            ) : null}
            <Link className="nm-btn nm-btn--ghost" href="/settings">
              <i className="fa-solid fa-sliders" aria-hidden="true" />
              Notification settings
            </Link>
          </div>
        </div>
        <p className="nm-meta">
          Derived from your own deadlines. Email reminders follow the same rules, on the schedule you choose in
          Settings.
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon="fa-moon"
          title="All clear"
          body="No overdue work, nothing due inside your reminder window, and no shared notes waiting."
          action={
            <Link className="nm-btn nm-btn--secondary" href="/today">
              Back to Today
            </Link>
          }
        />
      ) : (
        GROUPS.map((group) => {
          const groupItems = items.filter((item) => item.group === group.id);
          if (groupItems.length === 0) return null;
          return (
            <section className="nm-section" key={group.id}>
              <div className="nm-section-head">
                <h2 className="nm-section-title">
                  {group.label}
                  <span className="nm-chip nm-chip--sm nm-chip--muted">{groupItems.length}</span>
                </h2>
              </div>
              <ul className="nm-notiflist">
                {groupItems.map((item) => (
                  <li
                    className={`nm-notif nm-notif--${item.tone}${item.read ? " is-read" : ""}`}
                    key={item.id}
                  >
                    <i className={`fa-solid ${item.icon} nm-notif-icon`} aria-hidden="true" />
                    <div className="nm-notif-bd">
                      <div className="nm-notif-title">
                        {item.title}
                        {!item.read ? <span className="nm-unread-dot" aria-label="Unread" /> : null}
                      </div>
                      <div className="nm-notif-text">{item.body}</div>
                      <time className="nm-notif-meta nm-mono" dateTime={new Date(item.at).toISOString()} title={fmtDateTime(item.at)}>
                        {fmtRelative(item.at, now)}
                      </time>
                    </div>
                    <div className="nm-notif-actions">
                      <button
                        type="button"
                        className="nm-btn nm-btn--secondary nm-btn--sm"
                        onClick={() => void openItem(item.id, item.route)}
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        className="nm-iconbtn nm-iconbtn--sm"
                        aria-label="Snooze for an hour"
                        title="Snooze 1 hour"
                        onClick={() => {
                          void store.snoozeNotification(item.id, 60).catch(() => {});
                          toast("Snoozed for 1 hour", { kind: "info" });
                        }}
                      >
                        <i className="fa-solid fa-clock" aria-hidden="true" />
                      </button>
                      {!item.read ? (
                        <button
                          type="button"
                          className="nm-iconbtn nm-iconbtn--sm"
                          aria-label="Mark as read"
                          title="Mark read"
                          onClick={() => void store.markNotificationsRead([item.id]).catch(() => {})}
                        >
                          <i className="fa-solid fa-check" aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
