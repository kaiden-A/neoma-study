export function FocusPreview() {
  return (
    <figure className="nm-focusdemo">
      <div className="nm-focusdemo-window" aria-hidden="true">
        <div className="nm-focusdemo-bar">
          <span className="nm-focusdemo-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="nm-focusdemo-crumb nm-mono">MKT 201 · Lecture 4</span>
          <span className="nm-focusdemo-dial">
            <svg
              className="nm-focusdemo-dialicon"
              viewBox="0 0 28 28"
              width="26"
              height="26"
              aria-hidden="true"
            >
              <circle cx="14" cy="14" r="11" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.22" />
              <circle
                cx="14"
                cy="14"
                r="11"
                fill="none"
                stroke="var(--mark-amber)"
                strokeWidth="1.8"
                strokeDasharray="69.1"
                strokeDashoffset="20.7"
                strokeLinecap="round"
                transform="rotate(-90 14 14)"
              />
              <path d="M14 9 A5 5 0 0 1 14 19 A2.6 5 0 0 0 14 9 Z" fill="currentColor" opacity="0.8" />
            </svg>
            <span className="nm-mono">3 days</span>
          </span>
        </div>

        <div className="nm-focusdemo-panes">
          <div className="nm-focusdemo-doc">
            <div className="nm-focusdemo-doc-hd">
              <span className="nm-mono">Week 4 · Segmentation</span>
              <span className="nm-focusdemo-doc-chip">PDF</span>
            </div>
            <p className="nm-focusdemo-doc-title">Positioning is a choice, not a claim.</p>
            <span className="nm-focusdemo-line" />
            <p className="nm-focusdemo-quote">
              A positioning statement names{" "}
              <mark className="nm-focusdemo-mark">the customer, the category, and the difference</mark>{" "}
              — then everything else follows from it.
            </p>
            <span className="nm-focusdemo-line" />
            <span className="nm-focusdemo-line nm-focusdemo-line--short" />
            <div className="nm-focusdemo-pages nm-mono">
              <span>12 / 38</span>
              <span className="nm-focusdemo-pagesbar">
                <i />
              </span>
            </div>
          </div>

          <div className="nm-focusdemo-note">
            <div className="nm-focusdemo-note-hd">
              <span className="nm-mono">My notes</span>
              <span className="nm-focusdemo-note-chip">Lecture</span>
            </div>
            <p className="nm-focusdemo-note-line">
              <strong>Positioning</strong> = who it&rsquo;s for + what it replaces.
            </p>
            <span className="nm-focusdemo-line nm-focusdemo-line--note" />
            <span className="nm-focusdemo-line nm-focusdemo-line--note nm-focusdemo-line--short" />
            <div className="nm-focusdemo-card">
              <span className="nm-mono">Card · 1 of 6</span>
              <p>What three things does a positioning statement name?</p>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="nm-focusdemo-caption">
        Focus view: the lecture beside your notes. The highlight becomes a review card.
      </figcaption>
    </figure>
  );
}
