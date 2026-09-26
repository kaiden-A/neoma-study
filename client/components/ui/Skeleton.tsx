import type { CSSProperties } from "react";

/** Shimmer block. Decorative by default; the route skeletons pair it with one
 * visually hidden `role="status"` line so screen readers get a single
 * "Loading…" announcement instead of a wall of blocks. */
export function Skeleton({
  width,
  height,
  className = "",
  style,
}: {
  width?: string | number;
  height?: string | number;
  className?: string;
  style?: CSSProperties;
}) {
  return <span className={`nm-skel ${className}`} style={{ width, height, ...style }} aria-hidden="true" />;
}

/** A few stacked lines pretending to be text. */
export function SkeletonText({
  lines = 3,
  widths = ["100%", "94%", "72%"],
  className = "",
}: {
  lines?: number;
  widths?: string[];
  className?: string;
}) {
  return (
    <span className={`nm-skel-text ${className}`} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className="nm-skel--line" width={widths[index % widths.length]} />
      ))}
    </span>
  );
}

/** The single accessible status line every skeleton page should include. */
export function SkeletonStatus({ label }: { label: string }) {
  return (
    <span className="nm-sr" role="status">
      {label}
    </span>
  );
}
