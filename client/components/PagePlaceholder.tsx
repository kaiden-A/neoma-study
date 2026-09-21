export function PagePlaceholder({
  eyebrow,
  title,
  lede,
  points,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  points: string[];
}) {
  return (
    <div className="nm-page">
      <div className="nm-page-head">
        <div className="nm-head-top">
          <span className="nm-eyebrow">{eyebrow}</span>
        </div>
        <div className="nm-head-row">
          <h1 className="nm-title" id="page-title" tabIndex={-1}>
            {title}
          </h1>
        </div>
        <p className="nm-meta">{lede}</p>
      </div>

      <section className="nm-section">
        <div className="nm-card">
          <div className="nm-card-hd">
            <h2 className="nm-card-title">What lands here</h2>
            <span className="nm-card-actions nm-mono">Next pass</span>
          </div>
          <div className="nm-card-bd">
            <div className="nm-linklist">
              {points.map((point) => (
                <div className="nm-linkrow" key={point}>
                  <i className="fa-solid fa-check" aria-hidden="true" />
                  <span className="nm-linkrow-label">{point}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
