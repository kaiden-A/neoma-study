import Link from "next/link";

import { MoonMark } from "@/components/MoonMark";

function safeNext(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/today";
  return value;
}

const POINTS = [
  { icon: "fa-list-check", text: "Shared boards for project groups, with deadlines and workload per member." },
  { icon: "fa-note-sticky", text: "Study groups trade notes by topic and answer requests with a link." },
  { icon: "fa-calendar-days", text: "One calendar for deadlines, exams, sessions and your own to-dos." },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : undefined);
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="hidden flex-col justify-between bg-ink px-12 py-10 text-paper lg:flex">
        <Link href="/" className="flex items-center gap-2.5">
          <MoonMark size={26} />
          <span className="nm-mono tracking-[0.22em]">NEOMA</span>
        </Link>
        <div className="max-w-[26rem]">
          <h2 className="font-display text-[2rem] leading-[1.12] font-semibold">
            Group projects, your own notes, and one calendar that knows about both.
          </h2>
          <ul className="mt-9 flex flex-col gap-4 text-[0.86rem] opacity-85">
            {POINTS.map((point) => (
              <li key={point.text} className="flex items-start gap-3">
                <i className={`fa-solid ${point.icon} mt-0.5 opacity-90`} aria-hidden="true" />
                <span>{point.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[0.72rem] opacity-60">Sign-in is handled by Elysiaa SSO. Neoma never sees your password.</p>
      </aside>

      <section className="flex flex-col justify-center px-5 py-14 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-[25rem]">
          <Link href="/" className="mb-10 flex items-center gap-2.5 lg:hidden">
            <span style={{ color: "var(--mark-amber)" }}>
              <MoonMark size={26} />
            </span>
            <span className="nm-mono tracking-[0.22em]">NEOMA</span>
          </Link>

          <h1 className="font-display text-[1.7rem] font-semibold">Sign in to Neoma</h1>
          <p className="mt-2 text-[0.88rem] text-ink-muted">
            Use the email your university knows you by. We&rsquo;ll take you to Elysiaa to confirm it&rsquo;s you.
          </p>

          {error ? (
            <p className="nm-error mt-4" role="alert">
              {error}
            </p>
          ) : null}

          <form action="/api/auth/login" method="get" className="mt-7">
            <input type="hidden" name="next" value={next} />
            <label className="nm-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="login_hint"
              type="email"
              required
              autoComplete="email"
              placeholder="you@student.edu"
              className="nm-input"
            />
            <button type="submit" className="nm-btn nm-btn--primary mt-3 w-full">
              Continue
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-[0.72rem] text-ink-muted">
            <span className="h-px flex-1 bg-rule" />
            <span>or</span>
            <span className="h-px flex-1 bg-rule" />
          </div>

          <a
            className="nm-btn nm-btn--secondary w-full"
            href={`/api/auth/login?next=${encodeURIComponent(next)}`}
          >
            <i className="fa-solid fa-key" aria-hidden="true" />
            Continue with Elysiaa SSO
          </a>

          <p className="mt-7 text-[0.85rem] text-ink-muted">
            New to Neoma?{" "}
            <Link className="nm-link" href="/signup">
              Create an account
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
