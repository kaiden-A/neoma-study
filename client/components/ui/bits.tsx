"use client";

import { avatarHex, initials, marker } from "@/lib/markers";
import { moonPhase } from "@/lib/dates";

export function Avatar({
  name,
  email,
  color,
  size = 28,
  title,
}: {
  name: string;
  email?: string;
  color?: string;
  size?: number;
  title?: string;
}) {
  const hex = color ? marker(color).hex : avatarHex(email || name);
  return (
    <span
      className="nm-avatar"
      role="img"
      aria-label={name}
      title={title ?? (email ? `${name} · ${email}` : name)}
      style={
        {
          "--av-bg": hex,
          width: size,
          height: size,
          fontSize: Math.max(9, Math.round(size * 0.38)),
        } as React.CSSProperties
      }
    >
      {initials(name)}
    </span>
  );
}

export function Dial({
  dueAt,
  done = false,
  showLabel = true,
  size = 22,
}: {
  dueAt: number;
  done?: boolean;
  showLabel?: boolean;
  size?: number;
}) {
  const phase = moonPhase(dueAt, done);
  const r = size / 2 - 1.5;
  const rx = Math.abs(r * (1 - 2 * phase.f));
  const innerSweep = phase.f < 0.5 ? 1 : 0;
  const lit =
    phase.f <= 0.02
      ? null
      : phase.f >= 0.98
        ? `M 0 ${-r} A ${r} ${r} 0 1 1 0 ${r} A ${r} ${r} 0 1 1 0 ${-r} Z`
        : `M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r} A ${rx} ${r} 0 0 ${innerSweep} 0 ${-r} Z`;

  return (
    <span
      className={`nm-dial-wrap nm-dial-wrap--${phase.tone}`}
      title={done ? "Done" : phase.tone === "danger" ? "Overdue" : `Due ${new Date(dueAt).toLocaleString("en-GB")}`}
    >
      <svg
        className="nm-dial"
        width={size}
        height={size}
        viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
        aria-hidden="true"
      >
        <circle cx="0" cy="0" r={r} fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
        {lit ? <path d={lit} fill="currentColor" /> : null}
        {done ? (
          <path
            d={`M ${-r * 0.38} 0 L ${-r * 0.05} ${r * 0.34} L ${r * 0.42} ${-r * 0.34}`}
            fill="none"
            stroke="var(--dial-check)"
            strokeWidth={Math.max(1.2, size * 0.09)}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
      </svg>
      {showLabel ? <span className="nm-dial-label">{phase.label}</span> : null}
    </span>
  );
}

export function Progress({
  pct,
  markerKey,
  label,
  large = false,
}: {
  pct: number;
  markerKey?: string;
  label?: string;
  large?: boolean;
}) {
  return (
    <span
      className={`nm-prog${large ? " nm-prog--lg" : ""}${markerKey ? ` nm-mk-${markerKey}` : ""}`}
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span className="nm-prog-bar" style={{ width: `${pct}%` }} />
    </span>
  );
}

export function MarkerDot({ markerKey }: { markerKey: string }) {
  return <span className={`nm-dot nm-mk-${markerKey}`} />;
}

export function MarkerChip({ name, markerKey, small = false }: { name: string; markerKey: string; small?: boolean }) {
  return (
    <span className={`nm-chip${small ? " nm-chip--sm" : ""} nm-chip--mark nm-mk-${markerKey}`}>
      <MarkerDot markerKey={markerKey} />
      {name}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  compact = false,
}: {
  icon: string;
  title: string;
  body?: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`nm-empty${compact ? " nm-empty--compact" : ""}`}>
      <i className={`fa-solid ${icon} nm-empty-icon`} aria-hidden="true" />
      <div className="nm-empty-title">{title}</div>
      {body ? <p className="nm-empty-body">{body}</p> : null}
      {action}
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  required = false,
  error,
  help,
  children,
  full = false,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  help?: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`nm-field${error ? " has-error" : ""}${full ? " nm-field--full" : ""}`}>
      <label className="nm-label" htmlFor={htmlFor}>
        {label}
        {required ? <span className="nm-req">*</span> : null}
      </label>
      {children}
      {error ? <p className="nm-error">{error}</p> : null}
      {help && !error ? <p className="nm-help">{help}</p> : null}
    </div>
  );
}
