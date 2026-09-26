import Link from "next/link";

export const metadata = { title: "Offline · Neoma" };

export default function OfflinePage() {
  return (
    <main className="nm-view nm-view--grid min-h-screen">
      <div className="nm-page" style={{ maxWidth: 560 }}>
        <div className="nm-empty" style={{ marginTop: "18vh" }}>
          <i className="fa-solid fa-wifi nm-empty-icon" aria-hidden="true" />
          <div className="nm-empty-title">You&rsquo;re offline</div>
          <p className="nm-empty-body">
            Neoma needs a connection to load your notes, tasks and calendar. Reconnect and try again.
          </p>
          <Link className="nm-btn nm-btn--primary" href="/today">
            Try again
          </Link>
        </div>
      </div>
    </main>
  );
}
