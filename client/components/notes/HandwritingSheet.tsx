"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Modal } from "@/components/ui/Modal";
import {
  ERASER_RADIUS,
  HIGHLIGHTER_ALPHA,
  HIGHLIGHTER_COLOR,
  HIGHLIGHTER_SIZE,
  INK_COLORS,
  INK_SIZES,
  drawStrokes,
  inkWidth,
  renderSheet,
  strokeHitsPoint,
  type InkPaper,
  type InkPoint,
  type InkStroke,
  type InkTool,
} from "@/lib/ink";

interface HandwritingSheetProps {
  onClose: () => void;
  /** Uploads the PNG and inserts it into the note. Throws when it could not. */
  onInsert: (blob: Blob, caption: string) => Promise<void>;
}

type ActiveTool = InkTool | "eraser";

const TOOLS: { id: ActiveTool; label: string; icon: string }[] = [
  { id: "pen", label: "Pen", icon: "fa-pen-nib" },
  { id: "highlighter", label: "Highlighter", icon: "fa-highlighter" },
  { id: "eraser", label: "Eraser", icon: "fa-eraser" },
];

const PAPERS: { id: InkPaper; label: string; icon: string }[] = [
  { id: "blank", label: "Blank", icon: "fa-square" },
  { id: "lined", label: "Lined", icon: "fa-align-left" },
  { id: "grid", label: "Grid", icon: "fa-table-cells" },
];

function fitCanvas(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D | null {
  const dpr = window.devicePixelRatio || 1;
  const pixelWidth = Math.max(1, Math.round(width * dpr));
  const pixelHeight = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return context;
}

export function HandwritingSheet({ onClose, onInsert }: HandwritingSheetProps) {
  const [tool, setTool] = useState<ActiveTool>("pen");
  const [color, setColor] = useState<string>(INK_COLORS[0].value);
  const [size, setSize] = useState<number>(INK_SIZES[1].value);
  const [paper, setPaper] = useState<InkPaper>("lined");
  const [history, setHistory] = useState<{ stacks: InkStroke[][]; index: number }>({
    stacks: [[]],
    index: 0,
  });
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [penOnly, setPenOnly] = useState(false);
  const [penSeen, setPenSeen] = useState(false);
  const [dims, setDims] = useState({ width: 0, height: 0 });

  const sheetRef = useRef<HTMLDivElement>(null);
  const committedRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const ringRef = useRef<HTMLSpanElement>(null);
  const liveStrokeRef = useRef<InkStroke | null>(null);
  const pointerRef = useRef<number | null>(null);
  const eraseRef = useRef<InkStroke[] | null>(null);
  const eraseDirtyRef = useRef(false);
  const penSeenRef = useRef(false);
  const penOnlyRef = useRef(false);

  const strokes = history.stacks[history.index];
  const hasInk = strokes.length > 0;
  const canUndo = history.index > 0;
  const canRedo = history.index < history.stacks.length - 1;

  const commit = useCallback((next: InkStroke[]) => {
    setHistory((current) => ({
      stacks: [...current.stacks.slice(0, current.index + 1), next],
      index: current.index + 1,
    }));
  }, []);

  const appendStroke = useCallback((stroke: InkStroke) => {
    setHistory((current) => {
      const next = [...current.stacks[current.index], stroke];
      return { stacks: [...current.stacks.slice(0, current.index + 1), next], index: current.index + 1 };
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((current) => (current.index > 0 ? { ...current, index: current.index - 1 } : current));
  }, []);

  const redo = useCallback(() => {
    setHistory((current) =>
      current.index < current.stacks.length - 1 ? { ...current, index: current.index + 1 } : current,
    );
  }, []);

  // The sheet fills the modal body, so the drawing surface follows rotation,
  // the split pane and the browser window.
  useEffect(() => {
    const element = sheetRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      setDims((current) =>
        current.width === width && current.height === height ? current : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const paintCommitted = useCallback(
    (list: InkStroke[]) => {
      const canvas = committedRef.current;
      if (!canvas || dims.width <= 0 || dims.height <= 0) return;
      const context = fitCanvas(canvas, dims.width, dims.height);
      if (!context) return;
      context.clearRect(0, 0, dims.width, dims.height);
      drawStrokes(context, list, dims.width, dims.height);
    },
    [dims.height, dims.width],
  );

  const clearLive = useCallback(() => {
    const canvas = liveRef.current;
    if (!canvas || dims.width <= 0 || dims.height <= 0) return;
    const context = fitCanvas(canvas, dims.width, dims.height);
    if (!context) return;
    context.clearRect(0, 0, dims.width, dims.height);
  }, [dims.height, dims.width]);

  useEffect(() => {
    paintCommitted(strokes);
    clearLive();
  }, [clearLive, paintCommitted, strokes]);

  const pointFrom = useCallback(
    (rect: DOMRect, clientX: number, clientY: number, pointerType: string, pressure: number): InkPoint => ({
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
      p: pointerType === "pen" ? Math.min(1, Math.max(0.05, pressure || 0.5)) : 0.5,
    }),
    [],
  );

  const drawLiveDot = useCallback(
    (stroke: InkStroke) => {
      const canvas = liveRef.current;
      const point = stroke.points[0];
      if (!canvas || !point || dims.width <= 0 || dims.height <= 0) return;
      const context = fitCanvas(canvas, dims.width, dims.height);
      if (!context) return;
      const radius = Math.max(0.6, inkWidth(stroke, point, dims.width)) / 2;
      context.globalAlpha = stroke.tool === "highlighter" ? HIGHLIGHTER_ALPHA : 1;
      context.fillStyle = stroke.color;
      context.beginPath();
      context.arc(point.x * dims.width, point.y * dims.height, radius, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
    },
    [dims.height, dims.width],
  );

  const drawLiveSegment = useCallback(
    (stroke: InkStroke, from: InkPoint, to: InkPoint) => {
      const canvas = liveRef.current;
      if (!canvas || dims.width <= 0 || dims.height <= 0) return;
      const context = fitCanvas(canvas, dims.width, dims.height);
      if (!context) return;
      context.strokeStyle = stroke.color;
      context.globalAlpha = stroke.tool === "highlighter" ? HIGHLIGHTER_ALPHA : 1;
      context.lineWidth = Math.max(0.6, inkWidth(stroke, to, dims.width));
      context.lineCap = "round";
      context.lineJoin = "round";
      context.beginPath();
      context.moveTo(from.x * dims.width, from.y * dims.height);
      context.lineTo(to.x * dims.width, to.y * dims.height);
      context.stroke();
      context.globalAlpha = 1;
    },
    [dims.height, dims.width],
  );

  const moveRing = useCallback((rect: DOMRect, clientX: number, clientY: number) => {
    const ring = ringRef.current;
    if (!ring) return;
    const diameter = Math.max(12, ERASER_RADIUS * 2 * rect.width);
    ring.style.width = `${diameter}px`;
    ring.style.height = `${diameter}px`;
    ring.style.transform = `translate(${clientX - rect.left - diameter / 2}px, ${clientY - rect.top - diameter / 2}px)`;
    ring.style.opacity = "1";
  }, []);

  const eraseAt = useCallback(
    (rect: DOMRect, clientX: number, clientY: number) => {
      const working = eraseRef.current;
      if (!working || dims.width <= 0 || dims.height <= 0 || rect.width <= 0 || rect.height <= 0) return;
      const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
      const radius = ERASER_RADIUS * dims.width;
      const next = working.filter(
        (stroke) => !strokeHitsPoint(stroke, x, y, radius, dims.width, dims.height),
      );
      if (next.length === working.length) return;
      eraseRef.current = next;
      eraseDirtyRef.current = true;
      paintCommitted(next);
    },
    [dims.height, dims.width, paintCommitted],
  );

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (busy || event.button > 0) return;
    if (!event.isPrimary && event.pointerType === "touch") return;
    if (event.pointerType === "pen" && !penSeenRef.current) {
      penSeenRef.current = true;
      penOnlyRef.current = true;
      setPenSeen(true);
      setPenOnly(true);
    }
    if (pointerRef.current !== null) {
      // A palm landed before the pencil: throw that stroke away and let the
      // pen take over instead of losing the whole gesture.
      if (event.pointerType !== "pen" || tool === "eraser") return;
      liveStrokeRef.current = null;
      clearLive();
    }
    if (event.pointerType === "touch" && penOnlyRef.current) return;

    event.preventDefault();
    // Dismiss the caption keyboard before measuring: the sheet can grow when
    // iOS closes it, and the stroke must map to the box that is on screen.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = event.pointerId;
    setDrawing(true);
    setError(null);

    if (tool === "eraser") {
      eraseRef.current = strokes;
      eraseDirtyRef.current = false;
      moveRing(rect, event.clientX, event.clientY);
      return;
    }

    const point = pointFrom(rect, event.clientX, event.clientY, event.pointerType, event.pressure);
    const stroke: InkStroke = {
      tool,
      color: tool === "highlighter" ? HIGHLIGHTER_COLOR : color,
      size: tool === "highlighter" ? HIGHLIGHTER_SIZE : size,
      points: [point],
    };
    liveStrokeRef.current = stroke;
    drawLiveDot(stroke);
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.pointerType === "touch" && penOnlyRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (tool === "eraser") moveRing(rect, event.clientX, event.clientY);
    if (pointerRef.current !== event.pointerId) return;
    if (rect.width <= 0 || rect.height <= 0) return;
    event.preventDefault();

    if (tool === "eraser") {
      eraseAt(rect, event.clientX, event.clientY);
      return;
    }

    const stroke = liveStrokeRef.current;
    if (!stroke) return;
    const native = event.nativeEvent as PointerEvent & {
      getCoalescedEvents?: () => PointerEvent[];
    };
    const coalesced =
      typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [];
    const samples = coalesced.length > 0 ? coalesced : [native];
    for (const sample of samples) {
      const point = pointFrom(rect, sample.clientX, sample.clientY, sample.pointerType, sample.pressure);
      const last = stroke.points[stroke.points.length - 1];
      if (!last) continue;
      if (Math.hypot(point.x - last.x, point.y - last.y) < 0.0004) continue;
      stroke.points.push(point);
      drawLiveSegment(stroke, last, point);
    }
  }

  function finishPointer(event: React.PointerEvent<HTMLCanvasElement>, cancelled = false) {
    if (pointerRef.current !== event.pointerId) return;
    pointerRef.current = null;
    setDrawing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (tool === "eraser") {
      const working = eraseRef.current;
      const changed = eraseDirtyRef.current;
      eraseRef.current = null;
      eraseDirtyRef.current = false;
      if (working && changed) commit(working);
      return;
    }

    const stroke = liveStrokeRef.current;
    liveStrokeRef.current = null;
    clearLive();
    if (stroke && stroke.points.length > 0 && !cancelled) appendStroke(stroke);
  }

  function onPointerLeave() {
    const ring = ringRef.current;
    if (ring) ring.style.opacity = "0";
  }

  // Undo belongs to the drawing while the sheet is open, not to the note text.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const editing = Boolean(
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable),
      );
      if (editing) return;
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) redo();
        else undo();
      } else if (key === "y") {
        event.preventDefault();
        event.stopPropagation();
        redo();
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [redo, undo]);

  useEffect(() => {
    if (!hasInk) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasInk]);

  const requestClose = useCallback(() => {
    if (busy) return;
    if (confirmDiscard) {
      setConfirmDiscard(false);
      return;
    }
    if (!hasInk) {
      onClose();
      return;
    }
    setConfirmDiscard(true);
  }, [busy, confirmDiscard, hasInk, onClose]);

  const insert = useCallback(async () => {
    if (busy || !hasInk || dims.width <= 0 || dims.height <= 0) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await renderSheet(strokes, dims.width, dims.height);
      await onInsert(blob, caption.trim());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the drawing.");
    } finally {
      setBusy(false);
    }
  }, [busy, caption, dims.height, dims.width, hasInk, onInsert, strokes]);

  return (
    <Modal
      title="Write by pen"
      subtitle="Pen, stylus, finger or mouse."
      size="ink"
      onClose={requestClose}
      autoFocus={false}
      footer={
        <>
          <div className="nm-spacer" />
          <button type="button" className="nm-btn nm-btn--ghost" onClick={requestClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="nm-btn nm-btn--primary"
            onClick={() => void insert()}
            disabled={busy || !hasInk || confirmDiscard}
          >
            {busy ? (
              <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />
            ) : (
              <i className="fa-solid fa-arrow-down" aria-hidden="true" />
            )}
            {busy ? "Adding…" : "Insert into note"}
          </button>
        </>
      }
    >
      <div className="nm-ink">
        <div className="nm-ink-toolbar" role="toolbar" aria-label="Pen tools">
          <div className="nm-seg" role="group" aria-label="Tool">
            {TOOLS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`nm-seg-btn${tool === item.id ? " is-active" : ""}`}
                aria-pressed={tool === item.id}
                title={item.label}
                onClick={() => setTool(item.id)}
              >
                <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                <span className="nm-seg-label">{item.label}</span>
              </button>
            ))}
          </div>

          {tool === "pen" ? (
            <>
              <div className="nm-ink-swatches" role="group" aria-label="Ink colour">
                {INK_COLORS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`nm-ink-swatch${color === item.value ? " is-active" : ""}`}
                    style={{ backgroundColor: item.value }}
                    aria-label={item.label}
                    aria-pressed={color === item.value}
                    title={item.label}
                    onClick={() => setColor(item.value)}
                  />
                ))}
              </div>
              <div className="nm-seg" role="group" aria-label="Pen size">
                {INK_SIZES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`nm-seg-btn${size === item.value ? " is-active" : ""}`}
                    aria-pressed={size === item.value}
                    title={item.label}
                    onClick={() => setSize(item.value)}
                  >
                    <span className={`nm-ink-size nm-ink-size--${item.id}`} aria-hidden="true" />
                    <span className="nm-seg-label">{item.label}</span>
                  </button>
                ))}
              </div>
            </>
          ) : tool === "highlighter" ? (
            <span className="nm-ink-tag">
              <span className="nm-ink-tag-dot" style={{ backgroundColor: HIGHLIGHTER_COLOR }} aria-hidden="true" />
              Yellow highlighter
            </span>
          ) : (
            <span className="nm-ink-tag">Drag across ink to erase it</span>
          )}

          <span className="nm-ink-sep" />

          <button
            type="button"
            className="nm-iconbtn nm-iconbtn--sm"
            aria-label="Undo stroke"
            title="Undo (Ctrl/Cmd+Z)"
            disabled={!canUndo}
            onClick={undo}
          >
            <i className="fa-solid fa-rotate-left" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="nm-iconbtn nm-iconbtn--sm"
            aria-label="Redo stroke"
            title="Redo (Ctrl/Cmd+Shift+Z)"
            disabled={!canRedo}
            onClick={redo}
          >
            <i className="fa-solid fa-rotate-right" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="nm-iconbtn nm-iconbtn--sm"
            aria-label="Clear the page"
            title="Clear the page"
            disabled={!hasInk}
            onClick={() => commit([])}
          >
            <i className="fa-solid fa-trash-can" aria-hidden="true" />
          </button>

          <span className="nm-ink-sep" />

          <div className="nm-seg" role="group" aria-label="Paper">
            {PAPERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`nm-seg-btn${paper === item.id ? " is-active" : ""}`}
                aria-pressed={paper === item.id}
                title={`${item.label} paper`}
                onClick={() => setPaper(item.id)}
              >
                <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                <span className="nm-seg-label">{item.label}</span>
              </button>
            ))}
          </div>

          {penSeen ? (
            <button
              type="button"
              className={`nm-btn nm-btn--ghost nm-btn--sm${penOnly ? " is-active" : ""}`}
              aria-pressed={penOnly}
              title="Ignore finger touches while writing with a pen"
              onClick={() => {
                const next = !penOnlyRef.current;
                penOnlyRef.current = next;
                setPenOnly(next);
              }}
            >
              <i className="fa-solid fa-hand-pointer" aria-hidden="true" />
              Pen only
            </button>
          ) : null}
        </div>

        <div
          ref={sheetRef}
          className={`nm-ink-sheet nm-ink-paper--${paper}${tool === "eraser" ? " is-erasing" : ""}`}
          role="group"
          aria-label="Handwriting drawing area"
        >
          <canvas ref={committedRef} className="nm-ink-canvas" aria-hidden="true" />
          <canvas
            ref={liveRef}
            className="nm-ink-canvas nm-ink-canvas--live"
            aria-hidden="true"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(event) => finishPointer(event)}
            onPointerCancel={(event) => finishPointer(event, true)}
            onPointerEnter={(event) => {
              if (tool === "eraser") moveRing(event.currentTarget.getBoundingClientRect(), event.clientX, event.clientY);
            }}
            onPointerLeave={onPointerLeave}
          />
          {tool === "eraser" ? <span ref={ringRef} className="nm-ink-ring" aria-hidden="true" /> : null}
          {!hasInk && !drawing ? (
            <p className="nm-ink-empty">Write, sketch or annotate…</p>
          ) : null}
        </div>

        <div className="nm-ink-caption">
          <label className="nm-label" htmlFor="ink-caption">
            Caption <span className="nm-help">optional — it makes the page searchable</span>
          </label>
          <input
            id="ink-caption"
            className="nm-input"
            value={caption}
            maxLength={160}
            placeholder="e.g. Krebs cycle, week 4"
            onChange={(event) => setCaption(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void insert();
              }
            }}
          />
        </div>

        {error ? <p className="nm-error">{error}</p> : null}

        {confirmDiscard ? (
          <div className="nm-ink-confirm" role="alertdialog" aria-modal="true" aria-label="Discard this drawing?">
            <div className="nm-ink-confirm-card">
              <p className="nm-ink-confirm-title">Discard this drawing?</p>
              <p className="nm-help">It has not been inserted into the note yet.</p>
              <div className="nm-inline-actions">
                <button
                  type="button"
                  className="nm-btn nm-btn--secondary nm-btn--sm"
                  onClick={() => setConfirmDiscard(false)}
                >
                  Keep drawing
                </button>
                <button type="button" className="nm-btn nm-btn--danger nm-btn--sm" onClick={onClose}>
                  Discard
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
