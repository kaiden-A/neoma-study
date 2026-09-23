"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { EventModal } from "@/components/calendar/EventModal";
import { Dial, EmptyState } from "@/components/ui/bits";
import { Modal } from "@/components/ui/Modal";
import { useOverlays } from "@/components/ui/Overlays";
import {
  WEEKDAY_LABELS,
  addDays,
  dayKey,
  fmtDay,
  fmtDayLong,
  fmtMonthYear,
  fmtTime,
  isSameDay,
  monthGrid,
  weekDays,
} from "@/lib/dates";
import { eventType } from "@/lib/markers";
import { useStore } from "@/lib/store";
import { useNow } from "@/lib/useNow";
import type { CalendarEvent, CalendarItem, EventType } from "@/lib/types";

type FilterKey = "task" | EventType;

const FILTERS: { key: FilterKey; label: string; icon: string; marker: string }[] = [
  { key: "task", label: "Group tasks", icon: "fa-list-check", marker: "sky" },
  { key: "exam", label: "Exams", icon: "fa-graduation-cap", marker: "coral" },
  { key: "session", label: "Study sessions", icon: "fa-book-open-reader", marker: "violet" },
  { key: "meeting", label: "Meetings", icon: "fa-people-group", marker: "sky" },
  { key: "personal", label: "Personal", icon: "fa-mug-hot", marker: "amber" },
];

function itemLabel(item: CalendarItem): string {
  return item.kind === "task" ? "Task" : eventType(item.type ?? "personal").label;
}

export function CalendarView() {
  const store = useStore();
  const router = useRouter();
  const now = useNow();
  const { toast } = useOverlays();
  const [anchor, setAnchor] = useState(() => new Date());
  const [mode, setMode] = useState<"month" | "week">("month");
  const [filters, setFilters] = useState<Record<FilterKey, boolean>>({
    task: true,
    exam: true,
    session: true,
    meeting: true,
    personal: true,
  });
  const [dayOpen, setDayOpen] = useState<Date | null>(null);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [creating, setCreating] = useState<{ start: number } | null>(null);

  const passes = (item: CalendarItem) =>
    item.kind === "task" ? filters.task : filters[item.type ?? "personal"] !== false;
  const items = store.allEvents().filter(passes);
  const itemsFor = (day: Date) => store.eventsOnDay(day).filter(passes);

  function openItem(item: CalendarItem) {
    if (item.kind === "task") {
      const task = store.taskById(item.refId);
      if (task) router.push(`/groups/${task.groupId}?tab=tasks`);
      return;
    }
    const event = store.eventById(item.refId);
    if (event) setEditing(event);
  }

  async function exportIcs() {
    try {
      const response = await fetch("/api/calendar.ics", { cache: "no-store" });
      if (!response.ok) throw new Error("export failed");
      const text = await response.text();
      const count = (text.match(/BEGIN:VEVENT/g) ?? []).length;
      if (count === 0) {
        toast("Nothing to export yet", { kind: "danger" });
        return;
      }
      const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "neoma-study.ics";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast(`${count} events exported`, {
        kind: "success",
        icon: "fa-file-arrow-down",
        body: "Import the .ics in Google Calendar → Settings → Import.",
      });
    } catch {
      toast("Could not export the calendar", { kind: "danger" });
    }
  }

  const monthCells = monthGrid(anchor);
  const weekCells = weekDays(anchor);
  const google = store.settings?.google;
  const nextUp = items.filter((item) => item.start >= now).slice(0, 8);

  return (
    <div className="nm-page">
      <div className="nm-page-head">
        <div className="nm-head-top">
          <span className="nm-eyebrow">
            Calendar · <span className="nm-mono">{items.length} items tracked</span>
          </span>
        </div>
        <div className="nm-head-row">
          <h1 className="nm-title" id="page-title" tabIndex={-1}>
            Everything with a date
          </h1>
          <div className="nm-head-actions">
            <button type="button" className="nm-btn nm-btn--secondary" onClick={() => void exportIcs()}>
              <i className="fa-solid fa-file-arrow-down" aria-hidden="true" />
              Export .ics
            </button>
            <button type="button" className="nm-btn nm-btn--primary" onClick={() => setCreating({ start: Date.now() + 3_600_000 })}>
              <i className="fa-solid fa-plus" aria-hidden="true" />
              Add event
            </button>
          </div>
        </div>
        <p className="nm-meta">
          {google?.status === "connected"
            ? "Group deadlines, exams and study blocks, mirrored to Google Calendar."
            : "Group deadlines, exams and study blocks in one grid. Connect Google Calendar to take it with you."}
        </p>
      </div>

      <div className="nm-cal-layout">
        <div>
          <div className="nm-toolbar nm-cal-toolbar">
            <div className="nm-cal-nav">
              <button
                type="button"
                className="nm-iconbtn nm-iconbtn--sm"
                aria-label="Previous"
                onClick={() =>
                  setAnchor((current) =>
                    mode === "month"
                      ? new Date(current.getFullYear(), current.getMonth() - 1, 1)
                      : addDays(current, -7),
                  )
                }
              >
                <i className="fa-solid fa-chevron-left" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="nm-btn nm-btn--ghost nm-btn--sm"
                onClick={() => setAnchor(new Date())}
              >
                Today
              </button>
              <button
                type="button"
                className="nm-iconbtn nm-iconbtn--sm"
                aria-label="Next"
                onClick={() =>
                  setAnchor((current) =>
                    mode === "month"
                      ? new Date(current.getFullYear(), current.getMonth() + 1, 1)
                      : addDays(current, 7),
                  )
                }
              >
                <i className="fa-solid fa-chevron-right" aria-hidden="true" />
              </button>
            </div>
            <h2 className="nm-cal-label">
              {mode === "month"
                ? fmtMonthYear(anchor)
                : `${fmtDay(weekCells[0])} – ${fmtDay(weekCells[6])}`}
            </h2>
            <div className="nm-toolbar-spacer" />
            <div className="nm-seg" role="tablist" aria-label="Calendar view">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "month"}
                className={`nm-seg-btn${mode === "month" ? " is-active" : ""}`}
                onClick={() => setMode("month")}
              >
                Month
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "week"}
                className={`nm-seg-btn${mode === "week" ? " is-active" : ""}`}
                onClick={() => setMode("week")}
              >
                Week
              </button>
            </div>
          </div>

          <div className="nm-cal-filters">
            {FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`nm-chip nm-chip--sm nm-chip--link nm-mk-${item.marker}${
                  filters[item.key] ? " is-active" : ""
                }`}
                aria-pressed={filters[item.key]}
                onClick={() => setFilters((current) => ({ ...current, [item.key]: !current[item.key] }))}
              >
                <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                {item.label}
              </button>
            ))}
          </div>

          {mode === "month" ? (
            <>
              <div className="nm-cal-head">
                {WEEKDAY_LABELS.map((label) => (
                  <span className="nm-cal-weekday" key={label}>
                    {label}
                  </span>
                ))}
              </div>
              <div className="nm-cal-grid">
                {monthCells.map((day) => {
                  const dayItems = itemsFor(day);
                  return (
                    <div
                      className={`nm-cal-cell${day.getMonth() !== anchor.getMonth() ? " is-other" : ""}${
                        isSameDay(day, now) ? " is-today" : ""
                      }`}
                      key={dayKey(day)}
                      onClick={() => setDayOpen(day)}
                    >
                      <div className="nm-cal-daytop">
                        <span className="nm-cal-daynum nm-mono">{day.getDate()}</span>
                        {dayItems.length > 3 ? (
                          <button
                            type="button"
                            className="nm-cal-more nm-mono"
                            onClick={(event) => {
                              event.stopPropagation();
                              setDayOpen(day);
                            }}
                          >
                            +{dayItems.length - 3}
                          </button>
                        ) : null}
                      </div>
                      <div className="nm-cal-items">
                        {dayItems.slice(0, 3).map((item) => (
                          <button
                            type="button"
                            className={`nm-cal-pill nm-mk-${item.color}${item.done ? " is-done" : ""}`}
                            key={item.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              openItem(item);
                            }}
                          >
                            <span className="nm-dot" />
                            <span className="nm-cal-pill-text">{item.title}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="nm-cal-week">
              {weekCells.map((day) => (
                <div className={`nm-cal-wcol${isSameDay(day, now) ? " is-today" : ""}`} key={dayKey(day)}>
                  <button type="button" className="nm-cal-wcol-hd" onClick={() => setDayOpen(day)}>
                    <span className="nm-mono">{WEEKDAY_LABELS[(day.getDay() + 6) % 7]}</span>
                    <span>{day.getDate()}</span>
                  </button>
                  <div className="nm-cal-wcol-bd">
                    {itemsFor(day).map((item) => (
                      <button
                        type="button"
                        className={`nm-cal-weekcard nm-mk-${item.color}${item.done ? " is-done" : ""}`}
                        key={item.id}
                        onClick={() => openItem(item)}
                      >
                        <span className="nm-cal-weekcard-time nm-mono">{fmtTime(item.start)}</span>
                        <span className="nm-cal-weekcard-title">{item.title}</span>
                        <span className="nm-cal-weekcard-kind nm-mono">{itemLabel(item)}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      className="nm-cal-wcol-add"
                      aria-label={`Add event on ${fmtDay(day)}`}
                      onClick={() => setDayOpen(day)}
                    >
                      <i className="fa-solid fa-plus" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="nm-cal-side">
          <div className="nm-card">
            <div className="nm-card-hd">
              <h2 className="nm-card-title">Sync</h2>
            </div>
            <div className="nm-card-bd">
              <div className="nm-gcal-top">
                <span className="nm-gcal-logo">
                  <i className="fa-brands fa-google" aria-hidden="true" />
                </span>
                <div>
                  <div className="nm-gcal-status">Google Calendar</div>
                  <span className="nm-meta">
                    {google?.status === "connected"
                      ? `Connected${google.email ? ` · ${google.email}` : ""}`
                      : "Not connected — deadlines stay in Neoma only."}
                  </span>
                </div>
              </div>
              <div className="nm-gcal-actions">
                {google?.status === "connected" ? null : (
                  <a className="nm-btn nm-btn--secondary nm-btn--sm" href="/api/google/connect">
                    Connect Google Calendar
                  </a>
                )}
                <button type="button" className="nm-btn nm-btn--ghost nm-btn--sm" onClick={() => void exportIcs()}>
                  <i className="fa-solid fa-file-arrow-down" aria-hidden="true" />
                  Export .ics
                </button>
              </div>
            </div>
          </div>

          <div className="nm-card">
            <div className="nm-card-hd">
              <h2 className="nm-card-title">Next up</h2>
            </div>
            <div className="nm-card-bd">
              {nextUp.length === 0 ? (
                <EmptyState
                  compact
                  icon="fa-calendar-day"
                  title="Nothing upcoming"
                  body="Deadlines, exams and sessions all land here."
                />
              ) : (
                <div className="nm-upnext">
                  {nextUp.map((item) => (
                    <button
                      type="button"
                      className={`nm-upnext-row${item.done ? " is-done" : ""}`}
                      key={item.id}
                      onClick={() => openItem(item)}
                    >
                      <span className="nm-upnext-date nm-mono">
                        {fmtDay(item.start)}
                        <small>{fmtTime(item.start)}</small>
                      </span>
                      <span className="nm-upnext-bd">
                        {item.title}
                        <small className="nm-meta">
                          {itemLabel(item)}
                          {item.groupName ? ` · ${item.groupName}` : ""}
                        </small>
                      </span>
                      <Dial dueAt={item.start} done={item.done} showLabel={false} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {dayOpen ? (
        <Modal
          title={fmtDayLong(dayOpen)}
          subtitle={`${itemsFor(dayOpen).length} item${itemsFor(dayOpen).length === 1 ? "" : "s"} on this day`}
          onClose={() => setDayOpen(null)}
          footer={
            <>
              <div className="nm-spacer" />
              <button
                type="button"
                className="nm-btn nm-btn--primary"
                onClick={() => {
                  const start = new Date(dayOpen);
                  start.setHours(18, 0, 0, 0);
                  const startMs = start.getTime();
                  setDayOpen(null);
                  setCreating({ start: startMs });
                }}
              >
                <i className="fa-solid fa-plus" aria-hidden="true" />
                Add event
              </button>
            </>
          }
        >
          {itemsFor(dayOpen).length === 0 ? (
            <EmptyState
              compact
              icon="fa-calendar-day"
              title="Nothing scheduled"
              body="A clear day. Add a revision block if you want one."
            />
          ) : (
            <ul className="nm-daylist">
              {itemsFor(dayOpen).map((item) => {
                const task = item.kind === "task" ? store.taskById(item.refId) : null;
                return (
                  <li className={`nm-dayrow nm-mk-${item.color}`} key={item.id}>
                    <span className="nm-dayrow-time nm-mono">{fmtTime(item.start)}</span>
                    <span className="nm-dayrow-bd">
                      <span className="nm-task-text">{item.title}</span>
                      <span className="nm-task-meta">
                        <span className="nm-chip nm-chip--sm nm-chip--muted">
                          <i
                            className={`fa-solid ${
                              item.kind === "task" ? "fa-list-check" : eventType(item.type ?? "personal").icon
                            }`}
                            aria-hidden="true"
                          />
                          {itemLabel(item)}
                        </span>
                        {item.groupName ? (
                          <span className="nm-mono nm-meta">{item.groupName}</span>
                        ) : null}
                        {item.location ? (
                          <span className="nm-mono nm-meta">
                            <i className="fa-solid fa-location-dot" aria-hidden="true" /> {item.location}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="nm-dayrow-actions">
                      {task ? (
                        <button
                          type="button"
                          className="nm-btn nm-btn--secondary nm-btn--sm"
                          onClick={() => {
                            setDayOpen(null);
                            router.push(`/groups/${task.groupId}?tab=tasks`);
                          }}
                        >
                          Open task
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="nm-btn nm-btn--secondary nm-btn--sm"
                          onClick={() => {
                            const event = store.eventById(item.refId);
                            setDayOpen(null);
                            if (event) setEditing(event);
                          }}
                        >
                          Open
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Modal>
      ) : null}

      {creating ? (
        <EventModal
          defaults={{ start: creating.start, type: "session" }}
          onClose={() => setCreating(null)}
        />
      ) : null}
      {editing ? <EventModal event={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
