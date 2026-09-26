"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import { Skeleton, SkeletonStatus, SkeletonText } from "@/components/ui/Skeleton";
import { getServerVaultView, getVaultView, subscribeVaultView } from "@/lib/vaultView";

/** Route-shaped loading placeholders. Used by the AppShell gate during
 * bootstrap and by the `loading.tsx` files during client navigation, so the
 * shape the user sees never changes between the two. */

function Head({
  titleWidth = "260px",
  actionWidths = ["112px"],
  meta = true,
}: {
  titleWidth?: string;
  actionWidths?: string[];
  meta?: boolean;
}) {
  return (
    <div className="nm-page-head">
      <div className="nm-head-top">
        <Skeleton width="148px" height="11px" />
      </div>
      <div className="nm-head-row">
        <Skeleton width={titleWidth} height="32px" />
        <div className="nm-head-actions">
          {actionWidths.map((width, index) => (
            <Skeleton key={index} width={width} height="37px" />
          ))}
        </div>
      </div>
      {meta ? <Skeleton className="nm-skel-meta" width="300px" height="11px" /> : null}
    </div>
  );
}

function CardSkeleton({ lines = 2, heading = true }: { lines?: number; heading?: boolean }) {
  return (
    <div className="nm-card nm-skel-mb">
      {heading ? (
        <div className="nm-card-hd">
          <Skeleton width="120px" height="15px" />
        </div>
      ) : null}
      <div className="nm-card-bd">
        <SkeletonText lines={lines} />
      </div>
    </div>
  );
}

/* ---------- vault ---------- */

function VaultRows({ count = 5 }: { count?: number }) {
  return (
    <div className="nm-notelist">
      {Array.from({ length: count }, (_, index) => (
        <div className="nm-skel-row" key={index}>
          <Skeleton className="nm-skel-thumb" />
          <span className="nm-skel-row-bd">
            <Skeleton width={`${Math.max(34, 66 - index * 7)}%`} height="14px" />
            <Skeleton width={`${Math.max(20, 42 - index * 4)}%`} height="10px" />
          </span>
        </div>
      ))}
    </div>
  );
}

function VaultGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="nm-notegrid">
      {Array.from({ length: count }, (_, index) => (
        <div className="nm-skel-card" key={index}>
          <Skeleton className="nm-skel-card-thumb" />
          <span className="nm-skel-card-bd">
            <Skeleton width="72px" height="16px" />
            <Skeleton width={`${58 + (index % 3) * 12}%`} height="14px" />
            <Skeleton width={`${36 + (index % 4) * 12}%`} height="10px" />
          </span>
        </div>
      ))}
    </div>
  );
}

export function VaultSkeleton() {
  const view = useSyncExternalStore(subscribeVaultView, getVaultView, getServerVaultView);
  return (
    <div className="nm-page nm-page--vault">
      <Head titleWidth="284px" actionWidths={["104px"]} />
      <div className="nm-vault-layout">
        <aside className="nm-vault-side">
          <nav className="nm-vault-nav">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="nm-skel-folder" height="34px" />
            ))}
          </nav>
        </aside>
        <div className="nm-vault-main">
          <div className="nm-vault-toolbar">
            <Skeleton className="nm-skel-search" height="37px" />
            <Skeleton width="76px" height="37px" />
          </div>
          <Skeleton className="nm-skel-seg" height="36px" />
          <div className="nm-vault-head">
            <Skeleton width="184px" height="20px" />
            <Skeleton className="ml-auto" width="58px" height="12px" />
          </div>
          {view === "grid" ? <VaultGrid /> : <VaultRows />}
        </div>
      </div>
    </div>
  );
}

/* ---------- today ---------- */

export function TodaySkeleton() {
  return (
    <div className="nm-page">
      <Head titleWidth="248px" actionWidths={["112px", "104px"]} />
      <div className="nm-home-panel">
        <div className="nm-card">
          <div className="nm-card-bd">
            <Skeleton height="272px" />
          </div>
        </div>
        <div className="nm-card">
          <div className="nm-card-hd">
            <Skeleton width="124px" height="15px" />
          </div>
          <div className="nm-card-bd nm-skel-stack">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} height="42px" />
            ))}
          </div>
        </div>
      </div>
      <div className="nm-pulse-grid nm-skel-mt">
        {[0, 1, 2].map((index) => (
          <div className="nm-card" key={index}>
            <div className="nm-card-bd nm-skel-stack">
              <Skeleton width="92px" height="16px" />
              <Skeleton width="66%" height="16px" />
              <Skeleton height="10px" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- calendar ---------- */

export function CalendarSkeleton() {
  return (
    <div className="nm-page">
      <Head titleWidth="240px" actionWidths={["124px", "112px"]} />
      <div className="nm-cal-layout">
        <div>
          <div className="nm-toolbar nm-cal-toolbar">
            <Skeleton width="150px" height="30px" />
            <Skeleton width="86px" height="30px" />
            <div className="nm-toolbar-spacer" />
            <Skeleton width="152px" height="32px" />
          </div>
          <div className="nm-cal-head">
            {Array.from({ length: 7 }, (_, index) => (
              <Skeleton key={index} height="10px" />
            ))}
          </div>
          <div className="nm-cal-grid">
            {Array.from({ length: 35 }, (_, index) => (
              <Skeleton key={index} className="nm-skel-cell" />
            ))}
          </div>
        </div>
        <aside className="nm-cal-side">
          <CardSkeleton lines={4} />
        </aside>
      </div>
    </div>
  );
}

/* ---------- groups ---------- */

export function GroupsSkeleton() {
  return (
    <div className="nm-page">
      <Head titleWidth="152px" actionWidths={["116px"]} />
      <div className="nm-groupgrid">
        {[0, 1, 2].map((index) => (
          <div className="nm-skel-card" key={index}>
            <span className="nm-skel-card-bd">
              <Skeleton width="78px" height="16px" />
              <Skeleton width="58%" height="17px" />
              <Skeleton width="92%" height="10px" />
              <Skeleton width="64%" height="10px" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- tasks ---------- */

export function TasksSkeleton() {
  return (
    <div className="nm-page">
      <Head titleWidth="200px" actionWidths={["112px"]} />
      <div className="nm-toolbar">
        <Skeleton width="152px" height="32px" />
        <div className="nm-toolbar-spacer" />
        <Skeleton width="132px" height="32px" />
      </div>
      <div className="nm-table">
        <div className="nm-table-hd">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} height="9px" />
          ))}
        </div>
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <div className="nm-table-row" key={index}>
            <Skeleton width={`${Math.max(36, 74 - index * 8)}%`} height="14px" />
            <Skeleton width="64%" height="12px" />
            <Skeleton width="52%" height="12px" />
            <Skeleton width="52%" height="12px" />
            <Skeleton width="24px" height="24px" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- notifications ---------- */

export function NotificationsSkeleton() {
  return (
    <div className="nm-page">
      <Head titleWidth="228px" actionWidths={["136px"]} />
      <div className="nm-notiflist">
        {[0, 1, 2, 3].map((index) => (
          <div className="nm-notif" key={index}>
            <Skeleton width="20px" height="20px" />
            <span className="nm-skel-row-bd">
              <Skeleton width={`${46 - index * 5}%`} height="14px" />
              <Skeleton width={`${82 - index * 8}%`} height="10px" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- settings ---------- */

export function SettingsSkeleton() {
  return (
    <div className="nm-page">
      <Head titleWidth="168px" />
      <CardSkeleton lines={3} />
      <CardSkeleton lines={2} />
      <CardSkeleton lines={4} />
    </div>
  );
}

/* ---------- detail pages (note, group) ---------- */

export function DetailSkeleton() {
  return (
    <div className="nm-page">
      <div className="nm-note-top">
        <Skeleton width="72px" height="14px" />
        <Skeleton className="ml-auto" width="126px" height="31px" />
        <Skeleton width="36px" height="36px" />
      </div>
      <div className="nm-note-layout">
        <div className="nm-note-main">
          <div className="nm-note-chips">
            <Skeleton width="92px" height="20px" />
            <Skeleton width="148px" height="20px" />
          </div>
          <Skeleton className="nm-skel-mb" width="68%" height="34px" />
          <Skeleton className="nm-skel-mb" height="188px" />
          <Skeleton height="248px" />
        </div>
        <aside className="nm-note-side">
          <CardSkeleton lines={2} />
          <CardSkeleton lines={2} />
        </aside>
      </div>
    </div>
  );
}

export function RouteSkeleton() {
  const pathname = usePathname();

  let body = <SettingsSkeleton />;
  if (pathname === "/vault") body = <VaultSkeleton />;
  else if (pathname.startsWith("/vault/")) body = <DetailSkeleton />;
  else if (pathname === "/today") body = <TodaySkeleton />;
  else if (pathname === "/calendar") body = <CalendarSkeleton />;
  else if (pathname === "/groups") body = <GroupsSkeleton />;
  else if (pathname.startsWith("/groups/")) body = <DetailSkeleton />;
  else if (pathname === "/tasks") body = <TasksSkeleton />;
  else if (pathname === "/notifications") body = <NotificationsSkeleton />;

  return (
    <div aria-busy="true">
      <SkeletonStatus label="Loading" />
      {body}
    </div>
  );
}
