// Client-side file prep, ported from the prototype's files.js: images are
// flattened onto white, downscaled and re-encoded before upload; everything
// else is sent as-is. The 15 MB cap is enforced again on the server.

export const MAX_FILE_BYTES = 15 * 1024 * 1024;

const FULL_MAX_DIM = 1600;
const FULL_QUALITY = 0.82;
const THUMB_MAX_DIM = 520;
const THUMB_QUALITY = 0.68;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    image.src = url;
  });
}

function drawToBlob(image: HTMLImageElement, maxDim: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxDim / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not read that image.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not read that image."))),
      "image/jpeg",
      quality,
    );
  });
}

export async function compressImage(file: File): Promise<{ full: Blob; thumb: Blob | null }> {
  const image = await loadImage(file);
  const [full, thumb] = await Promise.all([
    drawToBlob(image, FULL_MAX_DIM, FULL_QUALITY),
    drawToBlob(image, THUMB_MAX_DIM, THUMB_QUALITY),
  ]);
  return { full, thumb };
}

/** Direct browser-to-R2 upload for a presigned PUT URL. */
export async function putToR2(url: string, body: Blob, contentType: string): Promise<void> {
  const response = await fetch(url, {
    method: "PUT",
    body,
    headers: { "Content-Type": contentType },
  });
  if (!response.ok) throw new Error("Could not upload that file. Try again.");
}

/** The prototype's typeFromFile heuristic. */
export function typeFromFile(file: File): "handwritten" | "slides" | "paper" | "note" {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("image/")) return "handwritten";
  if (/slide|lecture|deck/.test(name) || /\.(ppt|pptx|key)$/.test(name)) return "slides";
  if (/past|paper|exam|midterm/.test(name)) return "paper";
  return "paper";
}

export function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim().replace(/^#/, ""))
    .filter(Boolean);
}

export function fmtBytes(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
