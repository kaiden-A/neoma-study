"use client";

import { Progress } from "@/components/ui/bits";
import { Modal } from "@/components/ui/Modal";
import { fmtRelative } from "@/lib/dates";
import { useStore } from "@/lib/store";

/** Per-subject progress, opened from the vault header. */
export function StudyDashboard({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const overview = store.study;
  const subjects = overview?.subjects ?? [];
  const topMinutes = Math.max(1, ...subjects.map((subject) => subject.minutesThisWeek));

  return (
    <Modal title="Study dashboard" subtitle="Per subject — this week at a glance." size="lg" onClose={onClose}>
      <div className="nm-dash-stats">
        <div className="nm-dash-stat">
          <span className="nm-dash-statnum nm-mono">{overview?.streakDays ?? 0}</span>
          <span className="nm-meta">day streak</span>
        </div>
        <div className="nm-dash-stat">
          <span className="nm-dash-statnum nm-mono">{overview?.minutesThisWeek ?? 0}</span>
          <span className="nm-meta">minutes this week</span>
        </div>
      </div>

      {subjects.length ? (
        <div className="nm-dash-list">
          {subjects.map((subject) => (
            <div key={subject.subjectId} className="nm-dash-row">
              <div className="nm-dash-rowhd">
                <span className={`nm-dot nm-mk-${subject.color}`} />
                <span className="nm-dash-name">{subject.name}</span>
                <span className="nm-mono nm-meta">{subject.minutesThisWeek}m</span>
              </div>
              <Progress
                pct={Math.round((subject.minutesThisWeek / topMinutes) * 100)}
                markerKey={subject.color}
                label={`${subject.name}: minutes this week`}
              />
              <p className="nm-help">
                {subject.notes} item{subject.notes === 1 ? "" : "s"} · {subject.files} file
                {subject.files === 1 ? "" : "s"} · {subject.cardsDue} card
                {subject.cardsDue === 1 ? "" : "s"} due ·{" "}
                {subject.lastStudiedAt ? `last studied ${fmtRelative(subject.lastStudiedAt)}` : "not studied yet"}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="nm-help">Make a subject in the vault and it will show up here.</p>
      )}
    </Modal>
  );
}
