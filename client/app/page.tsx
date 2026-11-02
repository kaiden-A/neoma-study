import type { Metadata } from "next";
import Link from "next/link";

import { FocusPreview } from "@/components/landing/FocusPreview";
import { ThemeToggle } from "@/components/landing/ThemeToggle";
import { MoonMark } from "@/components/MoonMark";
import { SITE_DESCRIPTION, SITE_URL, pageMeta } from "@/lib/site";

export const metadata: Metadata = pageMeta({
  title: "Neoma · Study OS — group projects, notes and one calendar",
  description: SITE_DESCRIPTION,
  path: "/",
  absoluteTitle: true,
});

const FACTS = [
  "iTa'leem sync",
  "Google Calendar",
  "PDF, slides & video",
  "Apple Pencil",
];

const FEATURES = [
  {
    marker: "mint",
    icon: "fa-list-check",
    kicker: "Together",
    title: "Group projects",
    line: "A board the group actually opens.",
    body: "Tasks with due dates, assignees, priorities and checklists. A workload bar shows who is carrying the week before it becomes a problem.",
    tags: "due dates · assignees · priorities · checklists · workload",
  },
  {
    marker: "sky",
    icon: "fa-book-open-reader",
    kicker: "Share",
    title: "Study groups",
    line: "Notes by topic, not by scrollback.",
    body: "Shared notes with topic chips, requests that stay pinned until someone answers, and sessions that land on the calendar.",
    tags: "topics · requests · sessions · shared notes",
  },
  {
    marker: "amber",
    icon: "fa-folder-open",
    kicker: "Keep",
    title: "The vault",
    line: "Everything you were given, in one search.",
    body: "Type it, handwrite it, or drop in a PDF, slide deck, past paper or link. Search finds the phrase inside the file, not just the title.",
    tags: "typed · handwritten · PDF · slides · video · links",
  },
  {
    marker: "violet",
    icon: "fa-columns",
    kicker: "Study",
    title: "Focus view",
    line: "Read on the left. Write on the right.",
    body: "Open the lecture beside your notes. Highlight a paragraph, keep the excerpt, and turn it into a flashcard when you review.",
    tags: "PDF highlights · excerpts · flashcards · resume",
  },
  {
    marker: "coral",
    icon: "fa-calendar-days",
    kicker: "Plan",
    title: "One calendar",
    line: "Deadlines, exams, sessions, and your own life.",
    body: "One month view for all of it, with .ics export and two-way Google Calendar sync when you want it.",
    tags: "month view · .ics · Google sync · reminders",
  },
  {
    marker: "pink",
    icon: "fa-graduation-cap",
    kicker: "Sync",
    title: "iTa'leem",
    line: "Your Moodle, without the tab.",
    body: "Assignments, quiz closes and announcements mirror in. Save a course file straight to the vault and it is searchable with everything else.",
    tags: "courses · deadlines · announcements · files · grades",
  },
];

const STEP_MARKERS = ["amber", "mint", "violet"];

const STEPS = [
  {
    title: "Bring it in",
    body: "Connect iTa'leem once. Courses, assignment deadlines and quiz closes arrive on the calendar; nothing gets retyped.",
  },
  {
    title: "Work in it",
    body: "Invite the group, split the tasks, and keep the shared notes in the same place as the board.",
  },
  {
    title: "Study from it",
    body: "Open a note, put the lecture beside it, and turn what you highlight into cards you review before the exam.",
  },
];

const FAQ = [
  {
    q: "Do I need an iTa'leem account?",
    a: "Only for the Moodle sync. Groups, notes and the calendar work without it; connect iTa'leem from Settings when you want assignment deadlines and quiz closes to arrive on their own.",
  },
  {
    q: "Does it work on an iPad?",
    a: "Yes. Neoma installs as a web app, and the handwriting sheet uses Apple Pencil pressure, palm rejection and a highlighter on blank, lined or grid paper.",
  },
  {
    q: "Can I keep my Google Calendar?",
    a: "Yes. Connect it once and Neoma pushes deadlines and pulls events both ways. Add-to-Google links and .ics export work without connecting.",
  },
  {
    q: "Who can see my notes?",
    a: "Notes are private until you share them. Group notes are visible to that group, and a public link is a deliberate action you can revoke.",
  },
  {
    q: "Can I take my data with me?",
    a: "Yes. Settings exports everything as JSON, and you can delete everything you own from the same page.",
  },
];

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "Neoma",
      url: SITE_URL,
      logo: `${SITE_URL}/icons/icon-512.png`,
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "Neoma",
      description: SITE_DESCRIPTION,
      inLanguage: "en",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#app`,
      name: "Neoma",
      applicationCategory: "EducationalApplication",
      operatingSystem: "Web",
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      publisher: { "@id": `${SITE_URL}/#organization` },
      featureList: [
        "Group project task boards with assignees and workload",
        "Shared study notes by topic",
        "A vault for typed, handwritten, PDF, slide, video and link notes",
        "Focus view with PDF highlights, excerpts and flashcards",
        "One calendar with .ics export and Google Calendar sync",
        "iTa'leem assignment, quiz and announcement sync",
      ],
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE_URL}/#faq`,
      mainEntity: FAQ.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />

      <a className="nm-skip" href="#main">
        Skip to content
      </a>

      <header className="nm-lp-header">
        <div className="nm-lp-header-in">
          <Link className="nm-lp-brand" href="/" aria-label="Neoma home">
            <span className="nm-lp-brand-mark" aria-hidden="true">
              <MoonMark size={26} />
            </span>
            <span className="nm-lp-brand-name nm-mono">NEOMA</span>
            <span className="nm-lp-brand-tag nm-mono">Study OS</span>
          </Link>

          <nav className="nm-lp-nav" aria-label="Primary">
            <a href="#features">What&rsquo;s inside</a>
            <a href="#flow">How it works</a>
            <a href="#questions">Questions</a>
          </nav>

          <div className="nm-lp-header-actions">
            <ThemeToggle />
            <Link className="nm-btn nm-btn--ghost nm-btn--sm nm-lp-header-signin" href="/login">
              Sign in
            </Link>
            <Link className="nm-btn nm-btn--primary nm-btn--sm" href="/signup">
              Create account
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className="nm-lp">
        <section className="nm-lp-hero" aria-labelledby="hero-title">
          <div className="nm-lp-hero-copy">
            <p className="nm-eyebrow">Built around IIUM&rsquo;s iTa&rsquo;leem</p>
            <h1 id="hero-title" className="nm-lp-h1">
              One place for the group project, the lecture notes, and the exam.
            </h1>
            <p className="nm-lp-lede">
              Neoma is a study OS built around IIUM&rsquo;s iTa&rsquo;leem. A task board your group will
              actually open, notes you can type or handwrite, the PDFs and lectures you study from, and
              one calendar that knows when everything is due.
            </p>
            <div className="nm-inline-actions nm-lp-hero-cta">
              <Link className="nm-btn nm-btn--primary" href="/signup">
                <i className="fa-solid fa-user-plus" aria-hidden="true" />
                Create your account
              </Link>
              <Link className="nm-btn nm-btn--secondary" href="/login">
                Sign in
              </Link>
            </div>
            <p className="nm-help">Accounts are created and secured by Elysiaa SSO. No passwords live in Neoma.</p>

            <ul className="nm-lp-facts">
              {FACTS.map((fact) => (
                <li key={fact}>
                  <i className="fa-solid fa-check" aria-hidden="true" />
                  {fact}
                </li>
              ))}
            </ul>
          </div>

          <FocusPreview />
        </section>

        <section id="features" className="nm-lp-section" aria-labelledby="features-title">
          <div className="nm-lp-section-hd">
            <p className="nm-eyebrow">What&rsquo;s inside</p>
            <h2 id="features-title" className="nm-lp-h2">
              Six kinds of work, one page.
            </h2>
            <p className="nm-lp-section-lede">
              The group chat, the notes app and the calendar were never meant to be three different places.
            </p>
          </div>

          <div className="nm-lp-ledger">
            {FEATURES.map((feature) => (
              <article className={`nm-lp-feature nm-mk-${feature.marker}`} key={feature.title}>
                <div className="nm-lp-feature-margin">
                  <span className="nm-lp-feature-dot" aria-hidden="true" />
                  <span className="nm-lp-feature-kicker nm-mono">{feature.kicker}</span>
                </div>
                <div className="nm-lp-feature-body">
                  <h3 className="nm-lp-feature-title">
                    <i className={`fa-solid ${feature.icon}`} aria-hidden="true" />
                    {feature.title}
                  </h3>
                  <p className="nm-lp-feature-line">{feature.line}</p>
                  <p className="nm-lp-feature-text">{feature.body}</p>
                  <p className="nm-lp-feature-tags nm-mono">{feature.tags}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="flow" className="nm-lp-section" aria-labelledby="flow-title">
          <div className="nm-lp-section-hd">
            <p className="nm-eyebrow">A term in three moves</p>
            <h2 id="flow-title" className="nm-lp-h2">
              Bring it in. Work in it. Study from it.
            </h2>
          </div>

          <ol className="nm-lp-flow">
            {STEPS.map((step, index) => (
              <li className={`nm-lp-step nm-mk-${STEP_MARKERS[index]}`} key={step.title}>
                <span className="nm-lp-step-num nm-mono">{String(index + 1).padStart(2, "0")}</span>
                <h3 className="nm-lp-step-title">{step.title}</h3>
                <p className="nm-lp-step-text">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="questions" className="nm-lp-section" aria-labelledby="questions-title">
          <div className="nm-lp-section-hd">
            <p className="nm-eyebrow">Questions</p>
            <h2 id="questions-title" className="nm-lp-h2">
              The things people ask first.
            </h2>
          </div>

          <div className="nm-lp-faq">
            {FAQ.map((item) => (
              <details className="nm-lp-faq-item" key={item.q}>
                <summary className="nm-lp-faq-q">
                  <span>{item.q}</span>
                  <span className="nm-lp-faq-icon" aria-hidden="true" />
                </summary>
                <p className="nm-lp-faq-a">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="nm-lp-cta" aria-labelledby="cta-title">
          <div className="nm-lp-cta-mark" aria-hidden="true">
            <MoonMark size={72} />
          </div>
          <div>
            <p className="nm-eyebrow">Start small</p>
            <h2 id="cta-title" className="nm-lp-h2">
              Start with one unit, one group, one deadline.
            </h2>
            <p className="nm-lp-cta-text">
              Create an account with your university email and bring the first week in. The demo semester
              is one click inside Settings if you want to look around first.
            </p>
            <div className="nm-inline-actions nm-lp-cta-actions">
              <Link className="nm-btn nm-btn--primary" href="/signup">
                Create your account
              </Link>
              <Link className="nm-btn nm-btn--secondary" href="/login">
                Sign in
              </Link>
            </div>
            <p className="nm-help">Accounts are created and secured by Elysiaa SSO.</p>
          </div>
        </section>
      </main>

      <footer className="nm-lp-footer">
        <div className="nm-lp-footer-in">
          <div className="nm-lp-footer-brand">
            <Link href="/" aria-label="Neoma home">
              <span className="nm-lp-footer-mark" aria-hidden="true">
                <MoonMark size={24} />
              </span>
              <span className="nm-mono">NEOMA</span>
            </Link>
            <p>A study OS for group projects, notes and one calendar.</p>
            <p className="nm-meta">Built for IIUM · iTa&rsquo;leem · Google Calendar</p>
          </div>

          <nav className="nm-lp-footer-col" aria-label="Product">
            <p className="nm-lp-footer-hd nm-mono">Product</p>
            <a href="#features">What&rsquo;s inside</a>
            <a href="#flow">How it works</a>
            <a href="#questions">Questions</a>
          </nav>

          <nav className="nm-lp-footer-col" aria-label="Account">
            <p className="nm-lp-footer-hd nm-mono">Account</p>
            <Link href="/login">Sign in</Link>
            <Link href="/signup">Create account</Link>
            <a href="/api/auth/login?next=%2Ftoday">Continue with SSO</a>
          </nav>
        </div>

        <div className="nm-lp-footer-bottom">
          <p className="nm-meta">Trusted by one student and whatever group chat they were voluntold into.</p>
          <p className="nm-meta">Sign-in secured by Elysiaa SSO.</p>
        </div>
      </footer>
    </>
  );
}
