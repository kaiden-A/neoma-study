"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { CommandPalette } from "@/components/CommandPalette";
import { MoonMark } from "@/components/MoonMark";
import { QuickCapture } from "@/components/QuickCapture";
import { Avatar } from "@/components/ui/bits";
import { Menu } from "@/components/ui/Menu";
import { apiPost } from "@/lib/api-client";
import { useStore } from "@/lib/store";
import { applyTheme } from "@/lib/theme";
import type { LogoutResponse } from "@/lib/types";

const NAV = [
  { href: "/today", label: "Home", icon: "fa-house" },
  { href: "/groups", label: "Groups", icon: "fa-users" },
  { href: "/vault", label: "Notes", icon: "fa-note-sticky" },
  { href: "/calendar", label: "Calendar", icon: "fa-calendar-days" },
] as const;

const TABS = [...NAV, { href: "/settings", label: "Settings", icon: "fa-sliders" }] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, settings, updateSettings, unreadCount } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const avatarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      } else if (event.key === "/" && !typing && !paletteOpen) {
        event.preventDefault();
        setPaletteOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [paletteOpen]);

  const signOut = useCallback(async () => {
    const data = await apiPost<LogoutResponse>("/api/auth/logout").catch(() => null);
    window.location.href = data?.logoutUrl ?? "/login";
  }, []);

  function toggleTheme() {
    const next = settings?.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    void updateSettings({ theme: next });
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const planner = pathname === "/today" || pathname === "/calendar";
  const unread = unreadCount();
  const bellLabel = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";

  return (
    <>
      <a className="nm-skip" href="#view">
        Skip to content
      </a>

      <div className="nm-shell">
        <aside className="nm-rail" aria-label="Primary">
          <Link className="nm-brand" href="/today">
            <span className="nm-brand-mark" aria-hidden="true">
              <MoonMark />
            </span>
            <span className="nm-brand-name nm-mono">NEOMA</span>
          </Link>

          <nav className="nm-nav" aria-label="Sections">
            {NAV.map((item) => (
              <Link
                key={item.href}
                className={`nm-navitem${isActive(item.href) ? " is-active" : ""}`}
                href={item.href}
              >
                <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>

          <div className="nm-rail-bottom">
            <Link
              className={`nm-navitem nm-navitem--sm${isActive("/settings") ? " is-active" : ""}`}
              href="/settings"
            >
              <i className="fa-solid fa-sliders" aria-hidden="true" />
              <span>Settings</span>
            </Link>
            <button
              ref={avatarRef}
              type="button"
              className="nm-avatar-btn"
              aria-label={`Account: ${user?.name ?? "loading"}`}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {user ? (
                <Avatar name={user.name} email={user.email} color={user.color} size={30} />
              ) : (
                <span className="nm-avatar" style={{ width: 30, height: 30 }} />
              )}
            </button>
          </div>
        </aside>

        <div className="nm-body">
          <header className="nm-topbar">
            <Link href="/today" className="nm-topbar-brand nm-mono md:hidden">
              NEOMA
            </Link>
            <button
              type="button"
              className="nm-searchbtn"
              aria-label="Open command palette"
              onClick={() => setPaletteOpen(true)}
            >
              <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
              <span className="nm-searchbtn-text">Search tasks, notes, groups…</span>
              <kbd className="nm-kbd">Ctrl K</kbd>
            </button>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="nm-iconbtn"
                aria-label="Quick capture"
                onClick={() => setCaptureOpen(true)}
              >
                <i className="fa-solid fa-feather-pointed" aria-hidden="true" />
              </button>
              <Link className="nm-iconbtn nm-bellbtn" href="/notifications" aria-label={bellLabel}>
                <i className="fa-solid fa-bell" aria-hidden="true" />
                {unread > 0 ? <span className="nm-badge">{unread > 9 ? "9+" : unread}</span> : null}
              </Link>
            </div>
          </header>

          <main id="view" className={`nm-view${planner ? " nm-view--grid" : ""}`} tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>

      <nav className="nm-tabbar" aria-label="Sections">
        {TABS.map((item) => (
          <Link
            key={item.href}
            className={`nm-tabitem${isActive(item.href) ? " is-active" : ""}`}
            href={item.href}
          >
            <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      {menuOpen ? (
        <Menu
          label="Account"
          onClose={() => setMenuOpen(false)}
          style={{ left: "calc(var(--rail-w) + 10px)", bottom: 16 }}
          items={[
            { header: user?.name ?? "Account" },
            { label: "Settings", icon: "fa-sliders", onSelect: () => router.push("/settings") },
            { label: "My to-do", icon: "fa-list-check", onSelect: () => router.push("/tasks") },
            { label: "Your notes", icon: "fa-note-sticky", onSelect: () => router.push("/vault") },
            {
              label: settings?.theme === "dark" ? "Light mode" : "Dark mode",
              icon: "fa-circle-half-stroke",
              onSelect: toggleTheme,
            },
            { separator: true },
            { label: "Sign out", icon: "fa-arrow-right-from-bracket", danger: true, onSelect: () => void signOut() },
          ]}
        />
      ) : null}

      {paletteOpen ? <CommandPalette onClose={() => setPaletteOpen(false)} /> : null}
      {captureOpen ? <QuickCapture onClose={() => setCaptureOpen(false)} /> : null}    </>
  );
}
