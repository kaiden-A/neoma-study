"use client";

import { useEffect, useRef } from "react";

export function Modal({
  title,
  subtitle,
  size = "md",
  onClose,
  children,
  footer,
  dismissible = true,
}: {
  title: string;
  subtitle?: string;
  size?: "sm" | "md" | "lg";
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  dismissible?: boolean;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    document.body.classList.add("has-overlay");
    const focusable = modalRef.current?.querySelector<HTMLElement>(
      "input, textarea, select, button:not([disabled]), [href]",
    );
    focusable?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && dismissible) {
        event.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.classList.remove("has-overlay");
      previous?.focus?.();
    };
  }, [dismissible, onClose]);

  return (
    <div
      ref={overlayRef}
      className="nm-overlay"
      onMouseDown={(event) => {
        if (event.target === overlayRef.current && dismissible) onClose();
      }}
    >
      <div ref={modalRef} className={`nm-modal nm-modal--${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="nm-modal-hd">
          <div>
            <h2 className="nm-modal-title">{title}</h2>
            {subtitle ? <p className="nm-modal-sub">{subtitle}</p> : null}
          </div>
          <button type="button" className="nm-iconbtn nm-iconbtn--sm" aria-label="Close" onClick={onClose}>
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>
        <div className="nm-modal-bd">{children}</div>
        {footer ? <div className="nm-modal-ft">{footer}</div> : null}
      </div>
    </div>
  );
}
