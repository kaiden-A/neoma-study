import Link from "next/link";

import { MoonMark } from "@/components/MoonMark";

const POINTS = [
  { icon: "fa-users", text: "Create a project group and invite your team by email in one step." },
  { icon: "fa-book-open-reader", text: "Or a study group, where the shared notes are the point." },
  { icon: "fa-bolt", text: "Your first deadline reminder is two days out — you can change that later." },
];

export default function SignupPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="hidden flex-col justify-between bg-ink px-12 py-10 text-paper lg:flex">
        <Link href="/" className="flex items-center gap-2.5">
          <MoonMark size={26} />
          <span className="nm-mono tracking-[0.22em]">NEOMA</span>
        </Link>
        <div className="max-w-[26rem]">
          <h2 className="font-display text-[2rem] leading-[1.12] font-semibold">
            Start with one unit, one group, one deadline.
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
        <p className="text-[0.72rem] opacity-60">Accounts are created and secured by Elysiaa SSO.</p>
      </aside>

      <section className="flex flex-col justify-center px-5 py-14 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-[25rem]">
          <Link href="/" className="mb-10 flex items-center gap-2.5 lg:hidden">
            <span style={{ color: "var(--mark-amber)" }}>
              <MoonMark size={26} />
            </span>
            <span className="nm-mono tracking-[0.22em]">NEOMA</span>
          </Link>

          <h1 className="font-display text-[1.7rem] font-semibold">Create your account</h1>
          <p className="mt-2 text-[0.88rem] text-ink-muted">
            We&rsquo;ll open the Elysiaa registration page with your email already filled in. It takes a minute.
          </p>

          <form action="/api/auth/login" method="get" className="mt-7">
            <input type="hidden" name="next" value="/today" />
            <input type="hidden" name="prompt" value="create" />
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
              <i className="fa-solid fa-user-plus" aria-hidden="true" />
              Create account
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-[0.72rem] text-ink-muted">
            <span className="h-px flex-1 bg-rule" />
            <span>or</span>
            <span className="h-px flex-1 bg-rule" />
          </div>

          <a className="nm-btn nm-btn--secondary w-full" href="/api/auth/login?next=%2Ftoday&prompt=create">
            <i className="fa-solid fa-key" aria-hidden="true" />
            Continue with Elysiaa SSO
          </a>

          <p className="mt-7 text-[0.85rem] text-ink-muted">
            Already have an account?{" "}
            <Link className="nm-link" href="/login">
              Sign in
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
