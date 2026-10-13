"use client";

import { useEffect, useRef } from "react";

export interface MenuItem {
  label?: string;
  icon?: string;
  /** Marker key; renders the colour dot instead of an icon. */
  dot?: string;
  /** Right-aligned mono counter (folder counts, etc.). */
  hint?: string;
  /** The item the current view is on. */
  current?: boolean;
  header?: string;
  separator?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}

export function Menu({
  items,
  onClose,
  style,
  label = "Menu",
}: {
  items: MenuItem[];
  onClose: () => void;
  style?: React.CSSProperties;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>(".nm-menu-item:not([disabled])")?.focus();
  }, []);

  return (
    <div ref={ref} className="nm-menu" role="menu" aria-label={label} style={style}>
      {items.map((item, index) => {
        if (item.separator) return <div className="nm-menu-sep" key={`sep-${index}`} />;
        if (item.header)
          return (
            <div className="nm-menu-hd" key={`hdr-${index}`}>
              {item.header}
            </div>
          );
        return (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className={`nm-menu-item${item.danger ? " is-danger" : ""}${item.current ? " is-current" : ""}`}
            aria-current={item.current ? "true" : undefined}
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onSelect?.();
            }}
          >
            {item.dot ? (
              <span className={`nm-dot nm-mk-${item.dot}`} aria-hidden="true" />
            ) : item.icon ? (
              <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
            ) : null}
            <span>{item.label}</span>
            {item.hint ? <span className="nm-mono nm-menu-hint">{item.hint}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
