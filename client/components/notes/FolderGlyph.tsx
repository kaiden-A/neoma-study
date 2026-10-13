/** The folder tiles' glyph. Inline SVG (not an icon font) so the folder reads
 * as a shape at card size, tinted by the caller's marker colour. */
export function FolderGlyph({
  variant = "folder",
  className = "",
}: {
  variant?: "folder" | "inbox";
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 40"
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      {variant === "folder" ? (
        <>
          <path
            d="M4 10a4 4 0 0 1 4-4h8.6a4 4 0 0 1 3.2 1.6l1.4 1.9a4 4 0 0 0 3.2 1.6H40a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V10Z"
            fill="currentColor"
            fillOpacity="0.45"
          />
          <path
            d="M4 17h44v13a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V17Z"
            fill="currentColor"
            fillOpacity="0.95"
          />
        </>
      ) : (
        <>
          <path
            d="M10 6h28a4 4 0 0 1 3.9 3.1L44 20v10a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V20l2.1-10.9A4 4 0 0 1 10 6Z"
            fill="currentColor"
            fillOpacity="0.7"
          />
          <path
            d="M4 20h12l2.5 5h11l2.5-5h12v10a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V20Z"
            fill="currentColor"
            fillOpacity="0.95"
          />
        </>
      )}
    </svg>
  );
}
