export function MoonMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="9.5" fill="none" stroke="currentColor" strokeWidth="1.2" opacity=".5" />
      <path d="M16 6.5 A9.5 9.5 0 0 1 16 25.5 A4.9 9.5 0 0 0 16 6.5 Z" fill="currentColor" />
    </svg>
  );
}
