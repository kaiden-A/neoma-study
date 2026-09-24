"use client";

import { useEffect, useRef, useState } from "react";

import { Avatar, Field } from "@/components/ui/bits";
import { useOverlays } from "@/components/ui/Overlays";
import { apiPatch, apiPost } from "@/lib/api-client";
import { fmtRelative } from "@/lib/dates";
import { MARKERS } from "@/lib/markers";
import { useStore } from "@/lib/store";
import type { NotificationKinds, PublicUser } from "@/lib/types";

const LEAD_OPTIONS = [
  { value: 6, label: "6 hours before" },
  { value: 12, label: "12 hours before" },
  { value: 24, label: "1 day before" },
  { value: 48, label: "2 days before" },
  { value: 96, label: "4 days before" },
  { value: 168, label: "1 week before" },
];

const KIND_ROWS: { key: keyof NotificationKinds; label: string; help: string }[] = [
  { key: "overdue", label: "Overdue work", help: "Tasks past their due date." },
  { key: "dueSoon", label: "Due soon", help: "Inside the reminder window above." },
  { key: "assigned", label: "Assigned to me", help: "When a teammate puts a task on you." },
  { key: "sessions", label: "Study sessions", help: "Group study nights, a day before and an hour before." },
  { key: "exams", label: "Exams", help: "Countdown at 7, 3, 2, 1 and 0 days out." },
  { key: "notes", label: "Shared notes", help: "New notes posted in your groups." },
];

const MCP_TOOLS = [
  ["neoma.list_groups", "Groups with kind, members, topics and open task counts"],
  ["neoma.list_tasks", "Filter by group, assignee, status or due date"],
  ["neoma.create_task", "Create a task with due date and assignees"],
  ["neoma.update_task", "Change status, due date, assignees"],
  ["neoma.upcoming", "Merged deadlines and calendar events ahead"],
  ["neoma.search_vault", "Search notes, papers, slides and links"],
  ["neoma.get_note", "Full text of one note, with its topic"],
  ["neoma.create_note", "Capture a note or link into a subject or group topic"],
  ["neoma.list_events", "Calendar events in a date range"],
  ["neoma.daily_brief", "Everything Elpis needs to plan the day"],
];

export default function SettingsPage() {
  const store = useStore();
  const { toast, confirm } = useOverlays();
  const settings = store.settings;
  const user = store.user;

  const [name, setName] = useState(user?.name ?? "");
  const [program, setProgram] = useState(user?.program ?? "");
  const [color, setColor] = useState(user?.color ?? "amber");
  const [elpisUrl, setElpisUrl] = useState(settings?.elpis.url ?? "");
  const [elpisToken, setElpisToken] = useState(settings?.elpis.token ?? "");
  const importRef = useRef<HTMLInputElement>(null);
  const googleHandled = useRef(false);

  useEffect(() => {
    // The OAuth callback lands back here with ?google=...; report it once.
    const googleState = new URLSearchParams(window.location.search).get("google");
    if (!googleState || googleHandled.current) return;
    googleHandled.current = true;
    if (googleState === "connected") {
      toast("Google Calendar connected — syncing…", { kind: "success" });
      void store.refresh();
    } else if (googleState === "unconfigured") {
      toast("Google Calendar is not configured on the server.", { kind: "danger" });
    } else {
      toast("Could not connect Google Calendar. Try again.", { kind: "danger" });
    }
    window.history.replaceState({}, "", "/settings");
  }, [store, toast]);

  if (!settings || !user) {
    return (
      <div className="nm-page">
        <h1 className="nm-title" id="page-title" tabIndex={-1}>
          Settings
        </h1>
      </div>
    );
  }

  async function saveProfile() {
    try {
      const updated = await apiPatch<PublicUser>("/api/auth/me", {
        name: name.trim() || user?.name,
        program,
        color,
      });
      store.refresh();
      toast("Profile saved", { kind: "success" });
      void updated;
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not save the profile.", { kind: "danger" });
    }
  }

  async function patchSettings(patch: Parameters<typeof store.updateSettings>[0], quiet = false) {
    try {
      await store.updateSettings(patch);
      if (!quiet) toast("Saved", { kind: "success", timeout: 1600 });
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not save that.", { kind: "danger" });
    }
  }

  async function disconnectGoogle() {
    try {
      await apiPost("/api/google/disconnect");
      await store.refresh();
      toast("Google Calendar disconnected", { kind: "info" });
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not disconnect.", { kind: "danger" });
    }
  }

  async function syncGoogle() {
    try {
      const result = await apiPost<{ pushed: number; pulled: number }>("/api/google/sync");
      await store.refresh();
      toast(`Synced with Google · ${result.pushed} sent, ${result.pulled} received`, {
        kind: "success",
      });
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not sync with Google.", {
        kind: "danger",
      });
    }
  }

  async function requestNotifications() {
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast("This browser has no notification support", { kind: "danger" });
      return;
    }
    const permission = await Notification.requestPermission();
    await patchSettings({ browserNotifications: permission === "granted" }, true);
    if (permission === "granted") {
      toast("Desktop notifications on", { kind: "success" });
      new Notification("Neoma", { body: "Deadline reminders will appear here while the tab is open." });
    } else {
      toast("Permission not granted", { kind: "danger" });
    }
  }

  async function exportJson() {
    const response = await fetch("/api/export", { cache: "no-store" });
    const data = (await response.json()) as unknown;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `neoma-export-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast("Export downloaded", { kind: "success", icon: "fa-file-export" });
  }

  async function importJson(file: File) {
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as Record<string, unknown>;
      const response = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        toast(body?.error ?? "Could not read that file.", { kind: "danger" });
        return;
      }
      await store.refresh();
      toast("Data imported", { kind: "success", icon: "fa-file-import" });
    } catch {
      toast("Could not read that file as JSON.", { kind: "danger" });
    }
  }

  async function loadDemo() {
    const response = await fetch("/api/demo", { method: "POST" });
    if (!response.ok) {
      toast("Could not load the demo semester", { kind: "danger" });
      return;
    }
    await store.refresh();
    toast("Demo semester loaded", { kind: "success", icon: "fa-arrows-rotate" });
  }

  async function clearData() {
    const ok = await confirm({
      title: "Remove all your Neoma data?",
      message: "Groups you own, tasks, notes and events are deleted. This cannot be undone.",
      confirmLabel: "Delete everything",
      variant: "danger",
    });
    if (!ok) return;
    await fetch("/api/demo", { method: "DELETE" });
    await store.refresh();
    toast("Your data was removed", { kind: "info" });
  }

  async function removeFiles() {
    const ok = await confirm({
      title: "Remove uploaded files?",
      message: "Photos, slide decks and past papers stored for you are deleted. Notes and text stay.",
      confirmLabel: "Remove files",
      variant: "danger",
    });
    if (!ok) return;
    const response = await fetch("/api/maintenance/remove-files", { method: "POST" });
    const result = (await response.json()) as { files?: number };
    await store.refresh();
    toast(`Uploaded files removed${result.files ? ` (${result.files})` : ""}`, { kind: "info" });
  }

  function copyManifest() {
    const manifest = {
      server: "neoma",
      transport: "http",
      endpoint: `${window.location.origin}/mcp`,
      version: "0.1.0",
      tools: MCP_TOOLS.map(([name, description]) => ({ name, description })),
      resources: [
        "neoma://vault/{noteId}",
        "neoma://groups/{groupId}/board",
        "neoma://calendar/this-week",
      ],
    };
    navigator.clipboard
      .writeText(JSON.stringify(manifest, null, 2))
      .then(() => toast("Tool manifest copied", { kind: "success", icon: "fa-copy" }))
      .catch(() => toast("Copy failed", { kind: "danger" }));
  }

  return (
    <div className="nm-page">
      <div className="nm-page-head">
        <div className="nm-head-top">
          <span className="nm-eyebrow">Settings</span>
        </div>
        <div className="nm-head-row">
          <h1 className="nm-title" id="page-title" tabIndex={-1}>
            How Neoma works for you
          </h1>
          <div className="nm-head-actions">
            <button
              type="button"
              className="nm-btn nm-btn--secondary"
              onClick={() => void patchSettings({ theme: settings.theme === "dark" ? "light" : "dark" }, true)}
            >
              <i className={`fa-solid ${settings.theme === "dark" ? "fa-sun" : "fa-moon"}`} aria-hidden="true" />
              {settings.theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
          </div>
        </div>
        <p className="nm-meta">Profile, appearance, reminders, integrations and your data.</p>
      </div>

      <div className="nm-settings-grid">
        <section className="nm-card">
          <div className="nm-card-hd">
            <h2 className="nm-card-title">You</h2>
          </div>
          <div className="nm-card-bd">
            <div className="nm-gcal-top mb-3">
              <Avatar name={name || user.name} email={user.email} color={color} size={40} />
              <div>
                <div className="nm-gcal-status">{name || user.name}</div>
                <span className="nm-mono nm-meta">{user.email}</span>
              </div>
            </div>
            <Field label="Name" htmlFor="st-name">
              <input id="st-name" className="nm-input" value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Programme" htmlFor="st-program" help="Shows under your avatar and on invites.">
              <input
                id="st-program"
                className="nm-input"
                placeholder="BSc Computer Science · Year 3"
                value={program}
                onChange={(event) => setProgram(event.target.value)}
              />
            </Field>
            <div className="nm-field">
              <span className="nm-label">Colour</span>
              <div className="nm-swatches" role="radiogroup" aria-label="Avatar colour">
                {MARKERS.map((item) => (
                  <label
                    key={item.key}
                    className={`nm-swatch nm-mk-${item.key}${color === item.key ? " is-selected" : ""}`}
                    title={item.label}
                  >
                    <input
                      type="radio"
                      name="avatar-color"
                      checked={color === item.key}
                      onChange={() => setColor(item.key)}
                    />
                    <span className="nm-swatch-dot" />
                    <span className="nm-sr">{item.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <button type="button" className="nm-btn nm-btn--primary" onClick={() => void saveProfile()}>
              Save profile
            </button>
          </div>
        </section>

        <section className="nm-card">
          <div className="nm-card-hd">
            <h2 className="nm-card-title">Notifications</h2>
          </div>
          <div className="nm-card-bd">
            <Field label="Remind me before a deadline or session" htmlFor="st-lead">
              <select
                id="st-lead"
                className="nm-select"
                value={String(settings.leadTimeHours)}
                onChange={(event) => void patchSettings({ leadTimeHours: Number(event.target.value) }, true)}
              >
                {LEAD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="nm-togglelist">
              {KIND_ROWS.map((row) => (
                <label className="nm-toggle" key={row.key}>
                  <input
                    type="checkbox"
                    checked={settings.kinds[row.key]}
                    onChange={(event) =>
                      void patchSettings({ kinds: { [row.key]: event.target.checked } }, true)
                    }
                  />
                  <span className="nm-toggle-bd">
                    <span className="nm-toggle-label">{row.label}</span>
                    <span className="nm-toggle-help">{row.help}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="nm-inline-actions mt-3">
              <button type="button" className="nm-btn nm-btn--secondary nm-btn--sm" onClick={() => void requestNotifications()}>
                <i className="fa-solid fa-bell" aria-hidden="true" />
                Enable desktop notifications
              </button>
            </div>
            <p className="nm-help">
              Desktop alerts fire while this tab is open. Emails are sent as a daily digest; every one has an
              unsubscribe link.
            </p>
          </div>
        </section>

        <section className="nm-card">
          <div className="nm-card-hd">
            <h2 className="nm-card-title">Google Calendar</h2>
          </div>
          <div className="nm-card-bd">
            <div className="nm-gcal-top">
              <span className="nm-gcal-logo">
                <i className="fa-brands fa-google" aria-hidden="true" />
              </span>
              <div>
                <div className="nm-gcal-status">
                  {settings.google.status === "connected" ? "Connected" : "Not connected"}
                </div>
                <span className="nm-meta">
                  {settings.google.status === "connected"
                    ? `${settings.google.email ?? ""}${
                        settings.google.lastSyncAt ? ` · last sync ${fmtRelative(settings.google.lastSyncAt)}` : ""
                      }`
                    : "Add to Google links and .ics export work without connecting."}
                </span>
              </div>
            </div>
            <div className="nm-gcal-actions">
              {settings.google.status === "connected" ? (
                <>
                  <button
                    type="button"
                    className="nm-btn nm-btn--secondary nm-btn--sm"
                    onClick={() => void syncGoogle()}
                  >
                    <i className="fa-solid fa-rotate" aria-hidden="true" />
                    Sync now
                  </button>
                  <button
                    type="button"
                    className="nm-btn nm-btn--danger nm-btn--ghost nm-btn--sm"
                    onClick={() => void disconnectGoogle()}
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <a className="nm-btn nm-btn--primary nm-btn--sm" href="/api/google/connect">
                  Connect Google Calendar
                </a>
              )}
              <a className="nm-btn nm-btn--ghost nm-btn--sm" href="/api/calendar.ics">
                <i className="fa-solid fa-file-arrow-down" aria-hidden="true" />
                Export .ics
              </a>
            </div>
            <p className="nm-help">
              Events sync both ways. Neoma emails you about assignments and group sessions, with an .ics
              attached; Google never sends the invitations.
            </p>
          </div>
        </section>

        <section className="nm-card">
          <div className="nm-card-hd">
            <h2 className="nm-card-title">Elpis · MCP</h2>
          </div>
          <div className="nm-card-bd">
            <p className="nm-meta mb-3">
              Elpis plugs in through an MCP server at <span className="nm-mono">/mcp</span>. Tools act as the
              member whose token (or static key) the client presents.
            </p>
            <Field label="MCP endpoint" htmlFor="st-elpis-url">
              <input
                id="st-elpis-url"
                className="nm-input nm-mono"
                value={elpisUrl}
                onChange={(event) => setElpisUrl(event.target.value)}
              />
            </Field>
            <Field label="Auth token (optional)" htmlFor="st-elpis-token">
              <input
                id="st-elpis-token"
                className="nm-input"
                placeholder="Bearer token"
                value={elpisToken}
                onChange={(event) => setElpisToken(event.target.value)}
              />
            </Field>
            <label className="nm-check nm-check--switch mb-3">
              <input
                type="checkbox"
                checked={settings.elpis.enabled}
                onChange={(event) => void patchSettings({ elpis: { enabled: event.target.checked } }, true)}
              />
              <span>Allow Elpis to read and write Neoma</span>
            </label>
            <div className="nm-toollist">
              {MCP_TOOLS.map(([tool, description]) => (
                <div className="nm-toolrow" key={tool}>
                  <code className="nm-mono">{tool}</code>
                  <span>{description}</span>
                </div>
              ))}
            </div>
            <div className="nm-inline-actions">
              <button
                type="button"
                className="nm-btn nm-btn--secondary nm-btn--sm"
                onClick={() =>
                  void patchSettings({ elpis: { url: elpisUrl.trim(), token: elpisToken.trim() } }, true).then(
                    () => toast("Elpis connection saved", { kind: "success", icon: "fa-robot" }),
                  )
                }
              >
                Save connection
              </button>
              <button type="button" className="nm-btn nm-btn--ghost nm-btn--sm" onClick={copyManifest}>
                <i className="fa-solid fa-copy" aria-hidden="true" />
                Copy tool manifest
              </button>
            </div>
          </div>
        </section>

        <section className="nm-card">
          <div className="nm-card-hd">
            <h2 className="nm-card-title">Data</h2>
          </div>
          <div className="nm-card-bd">
            <p className="nm-meta mb-3">
              Your data is a JSON export away. Uploaded files stay in Neoma storage and are not part of it.
            </p>
            <div className="nm-inline-actions">
              <button type="button" className="nm-btn nm-btn--secondary nm-btn--sm" onClick={() => void exportJson()}>
                <i className="fa-solid fa-file-export" aria-hidden="true" />
                Export JSON
              </button>
              <button
                type="button"
                className="nm-btn nm-btn--secondary nm-btn--sm"
                onClick={() => importRef.current?.click()}
              >
                <i className="fa-solid fa-file-import" aria-hidden="true" />
                Import JSON
              </button>
              <input
                ref={importRef}
                type="file"
                accept="application/json"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importJson(file);
                  event.target.value = "";
                }}
              />
              <button type="button" className="nm-btn nm-btn--secondary nm-btn--sm" onClick={() => void loadDemo()}>
                <i className="fa-solid fa-arrows-rotate" aria-hidden="true" />
                Load demo semester
              </button>
            </div>
            <hr className="nm-rule" />
            <p className="nm-meta mb-3">Danger zone — these cannot be undone.</p>
            <div className="nm-inline-actions">
              <button type="button" className="nm-btn nm-btn--danger nm-btn--ghost nm-btn--sm" onClick={() => void removeFiles()}>
                <i className="fa-solid fa-broom" aria-hidden="true" />
                Remove uploaded files
              </button>
              <button type="button" className="nm-btn nm-btn--danger nm-btn--ghost nm-btn--sm" onClick={() => void clearData()}>
                <i className="fa-solid fa-trash" aria-hidden="true" />
                Delete all my data
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
