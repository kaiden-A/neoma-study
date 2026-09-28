"use client";

import { useEffect, useRef, useState } from "react";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
  TextLayer as PdfTextLayer,
} from "pdfjs-dist";

import type { StudyHighlight, StudyPosition } from "@/lib/types";

const MIN_SCALE = 0.4;
const MAX_SCALE = 4;
const ZOOM_STEP = 1.2;

let workerReady = false;

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (!workerReady) {
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(
      new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
      { type: "module" },
    );
    workerReady = true;
  }
  return pdfjs;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** The note-page reader: one page at a time, with a selectable text layer,
 * page/zoom controls, fullscreen, saved position and text highlights. */
export function PdfViewer({
  url,
  title,
  position,
  highlights,
  onPositionChange,
  onHighlight,
  seekPage,
}: {
  url: string;
  title: string;
  position: StudyPosition;
  highlights: StudyHighlight[];
  onPositionChange?: (position: StudyPosition) => void;
  onHighlight?: (highlight: StudyHighlight) => void;
  seekPage?: { page: number; nonce: number } | null;
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(() => Math.max(1, position.page));
  const [pageCount, setPageCount] = useState(0);
  const [scale, setScale] = useState(1.1);
  const [fit, setFit] = useState(true);
  const [fitScale, setFitScale] = useState(1);
  const [jump, setJump] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [pending, setPending] = useState<{
    quote: string;
    rects: number[][];
    x: number;
    y: number;
  } | null>(null);

  const rootRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const restored = useRef(false);
  const seekNonce = useRef(0);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const effectiveScale = fit ? fitScale : scale;

  useEffect(() => {
    let active = true;
    let task: PDFDocumentLoadingTask | null = null;
    void (async () => {
      try {
        const pdfjs = await loadPdfjs();
        task = pdfjs.getDocument({ url });
        const document = await task.promise;
        if (!active) return;
        setPageCount(document.numPages);
        setPage((current) => Math.min(current, document.numPages));
        setDoc(document);
      } catch {
        if (active) setFailed(true);
      }
    })();
    return () => {
      active = false;
      if (task) void task.destroy();
    };
  }, [url]);

  // Fit the page to the column; the reader should never need horizontal scroll.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !doc) return;
    let cancelled = false;
    const update = async () => {
      const first = await doc.getPage(1);
      if (cancelled) return;
      const width = first.getViewport({ scale: 1 }).width;
      const available = Math.max(240, el.clientWidth - 32);
      setFitScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, available / width)));
    };
    void update();
    const observer = new ResizeObserver(() => void update());
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [doc, fullscreen]);

  // Paint the canvas and lay the (selectable) text over it.
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    let renderTask: RenderTask | null = null;
    let textLayer: PdfTextLayer | null = null;
    void (async () => {
      try {
        const pdfPage = await doc.getPage(page);
        if (cancelled) return;
        const viewport = pdfPage.getViewport({ scale: effectiveScale });
        const canvas = canvasRef.current;
        const textContainer = textRef.current;
        if (!canvas || !textContainer) return;
        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        textContainer.replaceChildren();
        // pdf.js reads --total-scale-factor when it lays out the text layer
        // (set before the TextLayer constructor calls setLayerDimensions).
        textContainer.style.setProperty("--total-scale-factor", String(viewport.scale));
        textContainer.style.width = `${viewport.width}px`;
        textContainer.style.height = `${viewport.height}px`;
        const pdfjs = await import("pdfjs-dist");
        if (cancelled) return;
        renderTask = pdfPage.render({
          canvas,
          viewport,
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
        });
        await renderTask.promise;
        if (cancelled) return;
        textLayer = new pdfjs.TextLayer({
          textContentSource: pdfPage.streamTextContent(),
          container: textContainer,
          viewport,
        });
        await textLayer.render();
      } catch {
        // A cancelled render throws by design; anything else is a broken file.
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [doc, page, effectiveScale]);

  // Restore the remembered scroll once the first page is on screen.
  useEffect(() => {
    if (!doc || restored.current) return;
    restored.current = true;
    if (!position.scroll) return;
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = position.scroll;
    });
  }, [doc, position.scroll]);

  // A jump requested from a page anchor or an excerpt.
  useEffect(() => {
    if (!seekPage || seekPage.nonce === seekNonce.current) return;
    seekNonce.current = seekPage.nonce;
    const target = Math.min(pageCount || seekPage.page, Math.max(1, seekPage.page));
    setPage(target);
    scrollRef.current?.scrollTo({ top: 0 });
    onPositionChange?.({ page: target, scroll: 0 });
  }, [seekPage, pageCount, onPositionChange]);

  useEffect(() => {
    function onFullscreenChange() {
      setFullscreen(document.fullscreenElement === rootRef.current);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    return () => {
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
    };
  }, []);

  function goTo(next: number) {
    const target = Math.min(pageCount || 1, Math.max(1, next));
    setPage(target);
    setPending(null);
    scrollRef.current?.scrollTo({ top: 0 });
    onPositionChange?.({ page: target, scroll: 0 });
  }

  function reportScroll(top: number) {
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      onPositionChange?.({ page, scroll: top });
    }, 800);
  }

  function captureSelection() {
    const container = textRef.current;
    const pageBox = pageRef.current?.getBoundingClientRect();
    const selection = window.getSelection();
    if (!container || !pageBox || pageBox.width === 0 || !selection || selection.isCollapsed) {
      setPending(null);
      return;
    }
    const range = selection.rangeCount ? selection.getRangeAt(0) : null;
    if (!range || !container.contains(range.commonAncestorContainer)) {
      setPending(null);
      return;
    }
    const quote = selection.toString().trim();
    if (!quote) {
      setPending(null);
      return;
    }
    const rects: number[][] = [];
    let minX = 1;
    let minY = 1;
    let maxX = 0;
    for (const rect of Array.from(range.getClientRects())) {
      if (rect.width < 1 || rect.height < 1) continue;
      const x = (rect.left - pageBox.left) / pageBox.width;
      const y = (rect.top - pageBox.top) / pageBox.height;
      const width = rect.width / pageBox.width;
      const height = rect.height / pageBox.height;
      if (x < -0.02 || y < -0.02 || x > 1.02 || y > 1.02) continue;
      rects.push([clamp01(x), clamp01(y), Math.min(width, 1 - clamp01(x)), Math.min(height, 1 - clamp01(y))]);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + width);
    }
    if (!rects.length) {
      setPending(null);
      return;
    }
    setPending({ quote: quote.slice(0, 2000), rects, x: clamp01((minX + maxX) / 2), y: clamp01(minY) });
  }

  function addHighlight() {
    if (!pending || !onHighlight) return;
    onHighlight({
      id: crypto.randomUUID(),
      page,
      rects: pending.rects,
      quote: pending.quote,
      color: "amber",
      createdAt: Date.now(),
    });
    window.getSelection()?.removeAllRanges();
    setPending(null);
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement === rootRef.current) {
      await document.exitFullscreen();
    } else {
      await rootRef.current?.requestFullscreen();
    }
  }

  if (failed) {
    return <p className="nm-help nm-pdf-error">Could not open this PDF. Download it instead.</p>;
  }

  const pageHighlights = highlights.filter((highlight) => highlight.page === page);

  return (
    <section className="nm-pdf" ref={rootRef} aria-label={`Reader for ${title}`}>
      <div className="nm-pdf-toolbar">
        <button
          type="button"
          className="nm-iconbtn nm-iconbtn--sm"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => goTo(page - 1)}
        >
          <i className="fa-solid fa-chevron-left" aria-hidden="true" />
        </button>
        <span className="nm-mono nm-pdf-pagecount">
          page {page} / {pageCount || "…"}
        </span>
        <button
          type="button"
          className="nm-iconbtn nm-iconbtn--sm"
          aria-label="Next page"
          disabled={!pageCount || page >= pageCount}
          onClick={() => goTo(page + 1)}
        >
          <i className="fa-solid fa-chevron-right" aria-hidden="true" />
        </button>
        <label className="nm-sr" htmlFor="nm-pdf-jump">
          Jump to page
        </label>
        <input
          id="nm-pdf-jump"
          className="nm-input nm-pdf-jump"
          inputMode="numeric"
          placeholder="#"
          value={jump}
          onChange={(event) => setJump(event.target.value.replace(/\D/g, ""))}
          onKeyDown={(event) => {
            if (event.key === "Enter" && jump) {
              goTo(Number(jump));
              setJump("");
            }
          }}
        />
        <span className="nm-pdf-spacer" />
        <button
          type="button"
          className="nm-iconbtn nm-iconbtn--sm"
          aria-label="Zoom out"
          onClick={() => {
            setFit(false);
            setScale(Math.max(MIN_SCALE, effectiveScale / ZOOM_STEP));
          }}
        >
          <i className="fa-solid fa-magnifying-glass-minus" aria-hidden="true" />
        </button>
        <span className="nm-mono nm-pdf-pagecount">{Math.round(effectiveScale * 100)}%</span>
        <button
          type="button"
          className="nm-iconbtn nm-iconbtn--sm"
          aria-label="Zoom in"
          onClick={() => {
            setFit(false);
            setScale(Math.min(MAX_SCALE, effectiveScale * ZOOM_STEP));
          }}
        >
          <i className="fa-solid fa-magnifying-glass-plus" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`nm-btn nm-btn--ghost nm-btn--sm${fit ? " is-active" : ""}`}
          onClick={() => setFit(true)}
        >
          Fit
        </button>
        <button type="button" className="nm-iconbtn nm-iconbtn--sm" aria-label="Fullscreen" onClick={() => void toggleFullscreen()}>
          <i className={`fa-solid ${fullscreen ? "fa-compress" : "fa-expand"}`} aria-hidden="true" />
        </button>
      </div>
      <div
        className="nm-pdf-scroll"
        ref={scrollRef}
        onScroll={(event) => reportScroll(event.currentTarget.scrollTop)}
      >
        <div className="nm-pdf-page" ref={pageRef} onMouseUp={captureSelection}>
          <canvas ref={canvasRef} />
          <div className="textLayer" ref={textRef} />
          {pageHighlights.map((highlight) => (
            <span key={highlight.id} className={`nm-pdf-mark nm-mk-${highlight.color}`} aria-hidden="true">
              {highlight.rects.map((rect, index) => (
                <span
                  key={index}
                  style={{
                    left: `${rect[0] * 100}%`,
                    top: `${rect[1] * 100}%`,
                    width: `${rect[2] * 100}%`,
                    height: `${rect[3] * 100}%`,
                  }}
                />
              ))}
            </span>
          ))}
          {pending && onHighlight ? (
            <button
              type="button"
              className="nm-pdf-highlightbtn"
              style={{ left: `${pending.x * 100}%`, top: `${pending.y * 100}%` }}
              onMouseDown={(event) => event.preventDefault()}
              onClick={addHighlight}
            >
              <i className="fa-solid fa-highlighter" aria-hidden="true" />
              Highlight
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default PdfViewer;
