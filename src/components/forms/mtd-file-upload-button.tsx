"use client";

import { useRef, useState, useTransition } from "react";

/**
 * Shared “Upload MTD file” control — CSV/TXT bridging imports for VAT or ITSA.
 */
export function MtdFileUploadButton({
  label = "Upload MTD file",
  disabled,
  accept = ".csv,.txt,.json,text/csv,text/plain,application/json",
  onFile,
  className = "btn btn-secondary text-xs",
}: {
  label?: string;
  disabled?: boolean;
  accept?: string;
  onFile: (file: File) => Promise<void> | void;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          start(async () => {
            try {
              await onFile(file);
            } finally {
              setBusy(false);
            }
          });
        }}
      />
      <button
        type="button"
        className={className}
        disabled={disabled || pending || busy}
        onClick={() => inputRef.current?.click()}
      >
        {pending || busy ? "Reading…" : label}
      </button>
    </>
  );
}
