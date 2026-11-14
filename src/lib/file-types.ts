/**
 * Upload / download content-type allow-list + magic-byte sniffing.
 *
 * Client documents come from untrusted senders (inbound email, client portal).
 * Never trust the declared Content-Type or extension: only allow-listed
 * document types are stored with their real type; everything else is stored as
 * `application/octet-stream` with a `.bin` extension. Active content (html,
 * svg, js, xml ...) is never served with an executable type.
 */

export type FileKind =
  | "pdf"
  | "png"
  | "jpeg"
  | "webp"
  | "gif"
  | "csv"
  | "txt"
  | "xlsx"
  | "xls"
  | "docx";

type KindSpec = {
  mime: string;
  /** First extension is canonical. */
  exts: string[];
  /** Other declared MIME types that map to this kind. */
  aliases?: string[];
};

const KINDS: Record<FileKind, KindSpec> = {
  pdf: { mime: "application/pdf", exts: ["pdf"] },
  png: { mime: "image/png", exts: ["png"] },
  jpeg: { mime: "image/jpeg", exts: ["jpg", "jpeg"], aliases: ["image/jpg", "image/pjpeg"] },
  webp: { mime: "image/webp", exts: ["webp"] },
  gif: { mime: "image/gif", exts: ["gif"] },
  csv: {
    mime: "text/csv",
    exts: ["csv"],
    aliases: ["application/csv", "text/x-csv"],
  },
  txt: { mime: "text/plain", exts: ["txt"] },
  xlsx: {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    exts: ["xlsx"],
  },
  xls: { mime: "application/vnd.ms-excel", exts: ["xls"] },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    exts: ["docx"],
  },
};

export const OCTET_STREAM = "application/octet-stream";

/** Extensions that can execute / render active content in a browser. */
const DANGEROUS_EXTS = new Set([
  "html", "htm", "xhtml", "shtml", "svg", "svgz", "js", "mjs", "cjs", "jsx",
  "xml", "xsl", "xslt", "swf", "php", "asp", "aspx", "jsp", "exe", "bat",
  "cmd", "com", "msi", "scr", "ps1", "vbs", "jar", "hta", "mht", "mhtml",
]);

const MIME_TO_KIND = new Map<string, FileKind>();
for (const [kind, spec] of Object.entries(KINDS) as [FileKind, KindSpec][]) {
  MIME_TO_KIND.set(spec.mime, kind);
  for (const a of spec.aliases ?? []) MIME_TO_KIND.set(a, kind);
}
const EXT_TO_KIND = new Map<string, FileKind>();
for (const [kind, spec] of Object.entries(KINDS) as [FileKind, KindSpec][]) {
  for (const e of spec.exts) EXT_TO_KIND.set(e, kind);
}

export function normalizeMime(value: string | null | undefined): string {
  return (value ?? "").split(";")[0]!.trim().toLowerCase();
}

export function fileExtension(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "";
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(i + 1).toLowerCase() : "";
}

/** Strip path parts / control chars / leading dots; keep a conservative charset. */
export function sanitizeFilename(name: string, fallback = "file"): string {
  const base = (name.split(/[\\/]/).pop() ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^\w.\- ()]/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 180);
  return base || fallback;
}

function stripExtension(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  return sig.every((b, i) => bytes[offset + i] === b);
}

function looksLikeText(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 8192);
  for (let i = 0; i < n; i++) {
    const b = bytes[i]!;
    if (b === 0) return false;
    if (b < 9 || (b > 13 && b < 32)) return false;
  }
  return true;
}

/** Does `bytes` look like the claimed kind? */
export function matchesMagic(kind: FileKind, bytes: Uint8Array): boolean {
  switch (kind) {
    case "pdf": {
      // %PDF- may be preceded by a few junk bytes per spec (within first 1024).
      const head = Buffer.from(bytes.subarray(0, 1024)).toString("latin1");
      return head.includes("%PDF-");
    }
    case "png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "gif":
      return startsWith(bytes, [0x47, 0x49, 0x46, 0x38]);
    case "webp":
      return (
        startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
        startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
      );
    case "xlsx":
    case "docx":
      return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
    case "xls":
      return startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case "csv":
    case "txt":
      return looksLikeText(bytes) && !looksLikeMarkup(bytes);
  }
}

/** Reject text blobs that are really HTML/SVG/XML in a .csv/.txt costume. */
function looksLikeMarkup(bytes: Uint8Array): boolean {
  const head = Buffer.from(bytes.subarray(0, 512))
    .toString("utf8")
    .trimStart()
    .toLowerCase();
  return (
    head.startsWith("<!doctype html") ||
    head.startsWith("<html") ||
    head.startsWith("<svg") ||
    head.startsWith("<?xml") ||
    head.startsWith("<script")
  );
}

export type UploadInspection =
  | {
      allowed: true;
      kind: FileKind;
      contentType: string;
      filename: string;
    }
  | {
      allowed: false;
      /** `type_not_allowed` → can still be stored as opaque octet-stream. */
      reason: "type_not_allowed" | "magic_mismatch" | "empty";
      contentType: typeof OCTET_STREAM;
      /** Neutralised filename (`.bin`) for opaque storage. */
      filename: string;
    };

/**
 * Decide what an uploaded file really is. `allowed:false` + `type_not_allowed`
 * means "store (if at all) as opaque octet-stream"; `magic_mismatch` means the
 * declared type lies about the bytes and the upload should be rejected.
 */
export function inspectUpload(input: {
  filename: string;
  declaredType?: string | null;
  bytes: Uint8Array;
}): UploadInspection {
  const clean = sanitizeFilename(input.filename, "attachment");
  const ext = fileExtension(clean);
  const opaque = (reason: "type_not_allowed" | "magic_mismatch" | "empty") =>
    ({
      allowed: false,
      reason,
      contentType: OCTET_STREAM,
      filename: `${stripExtension(clean).replace(/\./g, "_") || "attachment"}.bin`,
    }) as const;

  if (input.bytes.byteLength === 0) return opaque("empty");

  const declared = normalizeMime(input.declaredType);
  const genericDeclared = declared === "" || declared === OCTET_STREAM;
  let kind: FileKind | undefined = MIME_TO_KIND.get(declared);

  // Excel clients often label CSV as application/vnd.ms-excel.
  if (kind === "xls" && ext === "csv") kind = "csv";

  if (!kind && genericDeclared) kind = EXT_TO_KIND.get(ext);
  if (!kind) return opaque("type_not_allowed");

  // An executable/active extension is never allowed, whatever the MIME says.
  if (DANGEROUS_EXTS.has(ext)) return opaque("type_not_allowed");

  if (!matchesMagic(kind, input.bytes)) return opaque("magic_mismatch");

  const spec = KINDS[kind];
  const name = spec.exts.includes(ext)
    ? clean
    : `${stripExtension(clean).replace(/\./g, "_") || "attachment"}.${spec.exts[0]}`;

  return { allowed: true, kind, contentType: spec.mime, filename: name };
}

/** Map any stored content type through the allow-list (download side). */
export function safeDownloadContentType(stored: string | null | undefined): string {
  const kind = MIME_TO_KIND.get(normalizeMime(stored));
  return kind ? KINDS[kind].mime : OCTET_STREAM;
}

export function isAllowedMime(mime: string | null | undefined): boolean {
  return MIME_TO_KIND.has(normalizeMime(mime));
}

/** RFC 6266 / 5987 Content-Disposition value (always `attachment`). */
export function attachmentDisposition(filename: string): string {
  const safe = sanitizeFilename(filename, "download");
  const ascii = safe.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(safe).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
