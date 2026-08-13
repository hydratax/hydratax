"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Single-column scrollable PDF preview (no thumbnail sidebar).
 * Renders each page as a canvas stacked vertically.
 */
export function AccountsPdfScrollViewer({ src }: { src: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageCount, setPageCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      setLoading(true);
      setError(null);
      const host = containerRef.current;
      if (!host) return;
      host.innerHTML = "";

      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

        const res = await fetch(src, { credentials: "same-origin" });
        if (!res.ok) {
          throw new Error(`Could not load PDF (${res.status})`);
        }
        const data = new Uint8Array(await res.arrayBuffer());
        const doc = await pdfjs.getDocument({ data }).promise;
        if (cancelled) {
          await doc.destroy();
          return;
        }
        setPageCount(doc.numPages);

        const width = Math.min(Math.max(host.clientWidth - 8, 320), 860);

        for (let i = 1; i <= doc.numPages; i += 1) {
          if (cancelled) break;
          const page = await doc.getPage(i);
          const unscaled = page.getViewport({ scale: 1 });
          const scale = width / unscaled.width;
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.className =
            "mx-auto mb-4 block w-full max-w-full rounded border border-line bg-white shadow-sm";
          canvas.setAttribute("aria-label", `Page ${i} of ${doc.numPages}`);

          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({
            canvasContext: ctx,
            viewport,
            canvas,
          }).promise;
          host.appendChild(canvas);
        }

        await doc.destroy();
        if (!cancelled) setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to render PDF");
        setLoading(false);
      }
    }

    void render();
    return () => {
      cancelled = true;
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [src]);

  return (
    <div className="relative">
      {loading && (
        <div className="absolute inset-x-0 top-0 z-10 flex justify-center bg-sand/80 py-3 text-sm text-ink-soft">
          Preparing scrollable preview…
        </div>
      )}
      {error && (
        <div className="space-y-3 p-6 text-center">
          <p className="text-sm text-danger">{error}</p>
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-semibold text-sea"
          >
            Open PDF in a new tab
          </a>
        </div>
      )}
      <div
        ref={containerRef}
        className="max-h-[70vh] min-h-[28rem] overflow-y-auto overflow-x-hidden bg-sand/50 p-3 sm:p-4"
        aria-label={
          pageCount
            ? `Accounts PDF, ${pageCount} pages — scroll to read`
            : "Accounts PDF preview"
        }
      />
    </div>
  );
}
