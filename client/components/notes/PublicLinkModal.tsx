"use client";

import { useEffect, useState } from "react";

import { Modal } from "@/components/ui/Modal";
import { useOverlays } from "@/components/ui/Overlays";
import { useStore } from "@/lib/store";
import type { Note, NoteShareState } from "@/lib/types";

/** Creates, copies and revokes the note's public read-only link. */
export function PublicLinkModal({ note, onClose }: { note: Note; onClose: () => void }) {
  const store = useStore();
  const { toast, confirm } = useOverlays();
  const [share, setShare] = useState<NoteShareState | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    store
      .fetchNoteShare(note.id)
      .then((state) => {
        if (!active) return;
        setShare(state);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  async function create() {
    if (busy) return;
    setBusy(true);
    try {
      const next = await store.enableNoteShare(note.id);
      setShare(next);
      toast("Public link ready", { kind: "success", icon: "fa-link" });
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not create the link.", { kind: "danger" });
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!share?.url) return;
    try {
      await navigator.clipboard.writeText(share.url);
      toast("Link copied", { kind: "success", icon: "fa-link" });
    } catch {
      toast("Could not copy automatically — select the link and copy it.", { kind: "info" });
    }
  }

  async function revoke() {
    const ok = await confirm({
      title: "Stop sharing this note?",
      message: "The link stops working immediately. You can create a new one later.",
      confirmLabel: "Stop sharing",
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await store.disableNoteShare(note.id);
      setShare({ enabled: false, url: null });
      toast("Public link revoked", { kind: "info", icon: "fa-link-slash" });
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not revoke the link.", { kind: "danger" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Public link"
      subtitle="Anyone with this link can read the note — no Neoma account needed."
      size="sm"
      onClose={onClose}
      footer={
        <>
          <div className="nm-spacer" />
          {share?.enabled ? (
            <>
              <button type="button" className="nm-btn nm-btn--ghost" onClick={() => void revoke()} disabled={busy}>
                Stop sharing
              </button>
              <button type="button" className="nm-btn nm-btn--primary" onClick={() => void copy()} disabled={busy}>
                <i className="fa-solid fa-copy" aria-hidden="true" />
                Copy link
              </button>
            </>
          ) : (
            <>
              <button type="button" className="nm-btn nm-btn--ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="nm-btn nm-btn--primary"
                onClick={() => void create()}
                disabled={busy || status !== "ready"}
              >
                {busy ? "Creating…" : "Create link"}
              </button>
            </>
          )}
        </>
      }
    >
      {status === "loading" ? <p className="nm-help">Checking the link…</p> : null}
      {status === "error" ? (
        <p className="nm-help">Could not check the link. Close this and try again.</p>
      ) : null}
      {status === "ready" && share?.enabled ? (
        <>
          <div className="nm-field">
            <label className="nm-label" htmlFor="public-link">
              Link
            </label>
            <input
              id="public-link"
              className="nm-input"
              readOnly
              value={share.url ?? ""}
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>
          <p className="nm-help">
            The link shows this note as you edit it and includes its attachment. Revoke it anytime.
          </p>
        </>
      ) : null}
      {status === "ready" && share && !share.enabled ? (
        <p className="nm-help">
          Make a read-only link you can send anywhere — to a friend, a classmate, anyone. The note stays yours;
          revoking the link never deletes it.
        </p>
      ) : null}
    </Modal>
  );
}
