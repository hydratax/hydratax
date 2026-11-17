/**
 * bankbee — cheap canvas preprocess before Tesseract (browser).
 * Grayscale + contrast stretch + light threshold improves poor phone photos
 * without a paid OCR API.
 */

export type PreprocessOptions = {
  /** Upscale factor before OCR (2 ≈ ~150–200 DPI phone photos → clearer glyphs) */
  scale?: number;
  /** 0–1; higher = more aggressive ink */
  threshold?: number;
};

/**
 * Draw `source` onto a new canvas with grayscale + contrast + optional threshold.
 * Returns the canvas (caller passes it to Tesseract).
 */
export function preprocessImageForOcr(
  source: CanvasImageSource & { width?: number; height?: number },
  opts?: PreprocessOptions,
): HTMLCanvasElement {
  const scale = opts?.scale ?? 2;
  const threshold = opts?.threshold;

  const srcW =
    "naturalWidth" in source && typeof source.naturalWidth === "number"
      ? source.naturalWidth
      : "videoWidth" in source && typeof (source as HTMLVideoElement).videoWidth === "number"
        ? (source as HTMLVideoElement).videoWidth
        : (source as HTMLCanvasElement).width;
  const srcH =
    "naturalHeight" in source && typeof source.naturalHeight === "number"
      ? source.naturalHeight
      : "videoHeight" in source && typeof (source as HTMLVideoElement).videoHeight === "number"
        ? (source as HTMLVideoElement).videoHeight
        : (source as HTMLCanvasElement).height;

  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(source as CanvasImageSource, 0, 0, w, h);

  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;

  // Grayscale + simple contrast stretch
  let min = 255;
  let max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const span = Math.max(1, max - min);
  for (let i = 0; i < d.length; i += 4) {
    let g = ((d[i] - min) / span) * 255;
    if (threshold != null) {
      g = g >= threshold * 255 ? 255 : 0;
    }
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Load a File/Blob into an HTMLImageElement. */
export function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load image for OCR preprocess"));
    };
    img.src = url;
  });
}
