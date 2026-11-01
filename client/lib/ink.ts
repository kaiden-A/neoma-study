// Handwriting strokes and canvas painting for the pen sheet.
//
// Points are normalized to the sheet box (0–1) and stroke sizes are a fraction
// of its width, so resizing the page or exporting at 2x never distorts a line.
// The sheet itself stays a raster PNG in the note body; this module only owns
// the live drawing surface.

export type InkTool = "pen" | "highlighter";

export interface InkPoint {
  x: number;
  y: number;
  /** 0–1 pen pressure; 0.5 for finger and mouse so the width stays steady. */
  p: number;
}

export interface InkStroke {
  tool: InkTool;
  color: string;
  /** Stroke width as a fraction of the sheet width. */
  size: number;
  points: InkPoint[];
}

export type InkPaper = "blank" | "lined" | "grid";

export const INK_COLORS = [
  { id: "ink", label: "Ink", value: "#1B211E" },
  { id: "blue", label: "Blue", value: "#2F5FD0" },
  { id: "red", label: "Red", value: "#C04A3A" },
  { id: "green", label: "Green", value: "#2F7D55" },
] as const;

export const INK_SIZES = [
  { id: "fine", label: "Fine", value: 0.0026 },
  { id: "medium", label: "Medium", value: 0.0044 },
  { id: "bold", label: "Bold", value: 0.007 },
] as const;

export const HIGHLIGHTER_COLOR = "#F2C744";
export const HIGHLIGHTER_ALPHA = 0.32;
export const HIGHLIGHTER_SIZE = 0.018;
export const ERASER_RADIUS = 0.02;

/** Width of a stroke at `point`, in CSS pixels, for a sheet `width` wide. */
export function inkWidth(stroke: InkStroke, point: InkPoint | undefined, width: number): number {
  const base = Math.max(0.6, stroke.size * width);
  if (stroke.tool === "highlighter") return base;
  const pressure = point ? Math.min(1, Math.max(0, point.p)) : 0.5;
  return base * (0.55 + 0.9 * pressure);
}

function toPixels(points: InkPoint[], width: number, height: number): Array<{ x: number; y: number }> {
  return points.map((point) => ({ x: point.x * width, y: point.y * height }));
}

/** A smoothed path through the sampled points (midpoint quadratics). */
function tracePath(context: CanvasRenderingContext2D, points: Array<{ x: number; y: number }>): void {
  if (points.length === 0) return;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  if (points.length === 1) return;
  if (points.length === 2) {
    context.lineTo(points[1].x, points[1].y);
    return;
  }
  for (let index = 1; index < points.length - 1; index += 1) {
    const next = points[index + 1];
    context.quadraticCurveTo(
      points[index].x,
      points[index].y,
      (points[index].x + next.x) / 2,
      (points[index].y + next.y) / 2,
    );
  }
  const last = points[points.length - 1];
  context.lineTo(last.x, last.y);
}

function drawStroke(
  context: CanvasRenderingContext2D,
  stroke: InkStroke,
  width: number,
  height: number,
): void {
  if (stroke.points.length === 0 || width <= 0 || height <= 0) return;
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;
  context.lineCap = "round";
  context.lineJoin = "round";

  if (stroke.tool === "highlighter") {
    // One path for the whole stroke: overlapping segments would darken the
    // translucent ink at every joint.
    context.globalAlpha = HIGHLIGHTER_ALPHA;
    context.lineWidth = Math.max(1, stroke.size * width);
    tracePath(context, toPixels(stroke.points, width, height));
    context.stroke();
    context.globalAlpha = 1;
    return;
  }

  const points = toPixels(stroke.points, width, height);
  if (points.length === 1) {
    const radius = Math.max(0.6, inkWidth(stroke, stroke.points[0], width)) / 2;
    context.beginPath();
    context.arc(points[0].x, points[0].y, radius, 0, Math.PI * 2);
    context.fill();
    return;
  }

  for (let index = 1; index < points.length; index += 1) {
    const current = points[index];
    const previous = points[index - 1];
    const start =
      index === 1
        ? previous
        : { x: (previous.x + current.x) / 2, y: (previous.y + current.y) / 2 };
    const next = points[index + 1];
    const end = next ? { x: (current.x + next.x) / 2, y: (current.y + next.y) / 2 } : current;
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.quadraticCurveTo(current.x, current.y, end.x, end.y);
    context.lineWidth = Math.max(0.6, inkWidth(stroke, stroke.points[index], width));
    context.stroke();
  }
}

/** Paint every stroke. Highlighter sits under pen ink even when drawn later. */
export function drawStrokes(
  context: CanvasRenderingContext2D,
  strokes: InkStroke[],
  width: number,
  height: number,
): void {
  if (width <= 0 || height <= 0) return;
  for (const stroke of strokes) {
    if (stroke.tool === "highlighter") drawStroke(context, stroke, width, height);
  }
  for (const stroke of strokes) {
    if (stroke.tool === "pen") drawStroke(context, stroke, width, height);
  }
}

function distanceToSegment(
  x: number,
  y: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

/** True when the eraser circle at normalized (x, y) touches the stroke. */
export function strokeHitsPoint(
  stroke: InkStroke,
  x: number,
  y: number,
  radiusPx: number,
  width: number,
  height: number,
): boolean {
  const points = stroke.points;
  if (points.length === 0) return false;
  const radius = radiusPx + Math.max(0.6, stroke.size * width) / 2;
  if (points.length === 1) {
    return Math.hypot((points[0].x - x) * width, (points[0].y - y) * height) <= radius;
  }
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (
      distanceToSegment(
        x * width,
        y * height,
        previous.x * width,
        previous.y * height,
        current.x * width,
        current.y * height,
      ) <= radius
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Flatten the sheet to a white PNG. The paper lines are a writing aid, not
 * content, so the exported image is clean paper + ink.
 */
export function renderSheet(strokes: InkStroke[], width: number, height: number): Promise<Blob> {
  const scale = Math.max(1, Math.min(2, 2400 / Math.max(1, width)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) return Promise.reject(new Error("Could not prepare the drawing."));

  context.scale(scale, scale);
  context.fillStyle = "#FFFFFF";
  context.fillRect(0, 0, width, height);
  drawStrokes(context, strokes, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not save the drawing."));
    }, "image/png");
  });
}
