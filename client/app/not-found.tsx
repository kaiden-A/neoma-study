import Link from "next/link";

import { MoonMark } from "@/components/MoonMark";

export default function NotFound() {
  return (
    <main className="nm-view nm-view--grid min-h-screen">
      <div className="nm-page">
        <div className="nm-404">
          <span className="nm-404-moon" aria-hidden="true">
            <MoonMark size={56} />
          </span>
          <p className="nm-eyebrow">404 · Not found</p>
          <h1 className="nm-title">This page isn&rsquo;t in the notebook.</h1>
          <p className="nm-meta">The link may be old, or the note may have moved.</p>
          <div className="nm-inline-actions">
            <Link className="nm-btn nm-btn--primary" href="/">
              Back to the landing page
            </Link>
            <Link className="nm-btn nm-btn--secondary" href="/today">
              Open Neoma
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
