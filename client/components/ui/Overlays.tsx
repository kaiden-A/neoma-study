"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

import { Modal } from "@/components/ui/Modal";

export interface ToastOptions {
  kind?: "success" | "danger" | "info";
  body?: string;
  icon?: string;
  actionLabel?: string;
  onAction?: () => void;
  route?: string;
  timeout?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
  message: string;
  leaving?: boolean;
}

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "primary" | "danger";
}

interface PromptOptions {
  title: string;
  label: string;
  value?: string;
  confirmLabel?: string;
  placeholder?: string;
}

interface OverlayContextValue {
  toast: (message: string, options?: ToastOptions) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
}

const OverlayContext = createContext<OverlayContextValue | null>(null);

let toastId = 0;

export function OverlayProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (value: boolean) => void }) | null>(
    null,
  );
  const [promptState, setPromptState] = useState<(PromptOptions & { resolve: (value: string | null) => void }) | null>(
    null,
  );
  const [promptValue, setPromptValue] = useState("");
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.map((item) => (item.id === id ? { ...item, leaving: true } : item)));
    const timer = setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
      timers.current.delete(id);
    }, 160);
    timers.current.set(id, timer);
  }, []);

  const toast = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const id = ++toastId;
      const item: ToastItem = { id, message, ...options };
      setToasts((current) => [...current.slice(-3), item]);
      const timeout = options.timeout ?? 5000;
      const timer = setTimeout(() => dismiss(id), timeout);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setConfirmState({ ...options, resolve });
      }),
    [],
  );

  const prompt = useCallback(
    (options: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        setPromptValue(options.value ?? "");
        setPromptState({ ...options, resolve });
      }),
    [],
  );

  const value = useMemo(() => ({ toast, confirm, prompt }), [toast, confirm, prompt]);

  return (
    <OverlayContext.Provider value={value}>
      {children}

      <div id="toasts" className="nm-toasts" aria-live="polite">
        {toasts.map((item) => (
          <div
            key={item.id}
            className={`nm-toast nm-toast--${item.kind ?? "info"}${item.leaving ? " is-leaving" : ""}${
              item.route ? " is-clickable" : ""
            }`}
            onClick={() => {
              if (item.route) window.location.href = item.route;
            }}
          >
            <i
              className={`fa-solid ${
                item.icon ?? (item.kind === "danger" ? "fa-circle-exclamation" : item.kind === "success" ? "fa-check" : "fa-moon")
              } nm-toast-icon`}
              aria-hidden="true"
            />
            <div className="nm-toast-text">
              <div className="nm-toast-title">{item.message}</div>
              {item.body ? <div className="nm-toast-body">{item.body}</div> : null}
            </div>
            {item.actionLabel ? (
              <button
                type="button"
                className="nm-toast-action"
                onClick={(event) => {
                  event.stopPropagation();
                  item.onAction?.();
                  dismiss(item.id);
                }}
              >
                {item.actionLabel}
              </button>
            ) : null}
            <button type="button" className="nm-toast-close" aria-label="Dismiss" onClick={() => dismiss(item.id)}>
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>

      {confirmState ? (
        <Modal
          title={confirmState.title}
          size="sm"
          onClose={() => {
            confirmState.resolve(false);
            setConfirmState(null);
          }}
          footer={
            <>
              <div className="nm-spacer" />
              <button
                type="button"
                className="nm-btn nm-btn--ghost"
                onClick={() => {
                  confirmState.resolve(false);
                  setConfirmState(null);
                }}
              >
                {confirmState.cancelLabel ?? "Cancel"}
              </button>
              <button
                type="button"
                className={`nm-btn ${confirmState.variant === "danger" ? "nm-btn--danger" : "nm-btn--primary"}`}
                onClick={() => {
                  confirmState.resolve(true);
                  setConfirmState(null);
                }}
              >
                {confirmState.confirmLabel ?? "Confirm"}
              </button>
            </>
          }
        >
          {confirmState.message ? <p className="nm-body-text">{confirmState.message}</p> : null}
        </Modal>
      ) : null}

      {promptState ? (
        <Modal
          title={promptState.title}
          size="sm"
          onClose={() => {
            promptState.resolve(null);
            setPromptState(null);
          }}
          footer={
            <>
              <div className="nm-spacer" />
              <button
                type="button"
                className="nm-btn nm-btn--ghost"
                onClick={() => {
                  promptState.resolve(null);
                  setPromptState(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="nm-btn nm-btn--primary"
                onClick={() => {
                  promptState.resolve(promptValue);
                  setPromptState(null);
                }}
              >
                {promptState.confirmLabel ?? "Save"}
              </button>
            </>
          }
        >
          <label className="nm-label" htmlFor="prompt-value">
            {promptState.label}
          </label>
          <input
            id="prompt-value"
            className="nm-input"
            value={promptValue}
            placeholder={promptState.placeholder}
            onChange={(event) => setPromptValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                promptState.resolve(promptValue);
                setPromptState(null);
              }
            }}
          />
        </Modal>
      ) : null}
    </OverlayContext.Provider>
  );
}

export function useOverlays(): OverlayContextValue {
  const context = useContext(OverlayContext);
  if (!context) throw new Error("useOverlays must be used inside OverlayProvider");
  return context;
}
