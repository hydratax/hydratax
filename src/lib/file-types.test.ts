import { describe, expect, it } from "vitest";
import {
  attachmentDisposition,
  inspectUpload,
  matchesMagic,
  safeDownloadContentType,
  sanitizeFilename,
} from "./file-types";

const bytes = (...n: number[]) => new Uint8Array(n);
const text = (s: string) => new TextEncoder().encode(s);

const PDF = text("%PDF-1.7\n1 0 obj\n");
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0);
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04, 0, 0);

describe("matchesMagic", () => {
  it("recognises real signatures", () => {
    expect(matchesMagic("pdf", PDF)).toBe(true);
    expect(matchesMagic("png", PNG)).toBe(true);
    expect(matchesMagic("jpeg", JPEG)).toBe(true);
    expect(matchesMagic("xlsx", ZIP)).toBe(true);
    expect(matchesMagic("csv", text("a,b\n1,2\n"))).toBe(true);
  });
  it("rejects mismatches and markup disguised as text", () => {
    expect(matchesMagic("pdf", text("<html>"))).toBe(false);
    expect(matchesMagic("png", JPEG)).toBe(false);
    expect(matchesMagic("csv", text("<!DOCTYPE html><script>alert(1)</script>"))).toBe(false);
    expect(matchesMagic("txt", text("<svg onload=alert(1)>"))).toBe(false);
    expect(matchesMagic("csv", bytes(0, 1, 2, 3))).toBe(false);
  });
});

describe("inspectUpload", () => {
  it("accepts a genuine PDF and normalises the content type", () => {
    const r = inspectUpload({ filename: "Invoice.PDF", declaredType: "application/pdf", bytes: PDF });
    expect(r.allowed).toBe(true);
    if (r.allowed) {
      expect(r.contentType).toBe("application/pdf");
      expect(r.kind).toBe("pdf");
    }
  });

  it("rejects an HTML payload claiming to be a PDF (magic mismatch)", () => {
    const r = inspectUpload({
      filename: "x.pdf",
      declaredType: "application/pdf",
      bytes: text("<html><script>alert(1)</script></html>"),
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.reason).toBe("magic_mismatch");
      expect(r.contentType).toBe("application/octet-stream");
      expect(r.filename.endsWith(".bin")).toBe(true);
    }
  });

  it("never allows HTML / SVG / XML / JS types", () => {
    for (const [name, type] of [
      ["a.html", "text/html"],
      ["a.svg", "image/svg+xml"],
      ["a.xml", "application/xml"],
      ["a.js", "text/javascript"],
      ["a.xhtml", "application/xhtml+xml"],
    ] as const) {
      const r = inspectUpload({ filename: name, declaredType: type, bytes: text("<svg onload=alert(1)>") });
      expect(r.allowed, name).toBe(false);
      if (!r.allowed) expect(r.contentType).toBe("application/octet-stream");
    }
  });

  it("does not let a dangerous extension ride on an allowed generic type", () => {
    const r = inspectUpload({ filename: "evil.html", declaredType: "application/octet-stream", bytes: text("a,b\n1,2\n") });
    expect(r.allowed).toBe(false);
  });

  it("falls back to the extension when the declared type is generic", () => {
    const r = inspectUpload({ filename: "scan.png", declaredType: "", bytes: PNG });
    expect(r.allowed).toBe(true);
    if (r.allowed) expect(r.contentType).toBe("image/png");
  });

  it("treats csv labelled as vnd.ms-excel as csv", () => {
    const r = inspectUpload({ filename: "bank.csv", declaredType: "application/vnd.ms-excel", bytes: text("date,amt\n1,2\n") });
    expect(r.allowed).toBe(true);
    if (r.allowed) expect(r.kind).toBe("csv");
  });

  it("rejects empty files", () => {
    const r = inspectUpload({ filename: "a.pdf", declaredType: "application/pdf", bytes: new Uint8Array() });
    expect(r.allowed).toBe(false);
  });

  it("forces the extension to match the verified kind", () => {
    const r = inspectUpload({ filename: "photo.exe", declaredType: "image/png", bytes: PNG });
    // .exe is not an image extension -> renamed to the canonical one (or rejected)
    if (r.allowed) expect(r.filename.endsWith(".png")).toBe(true);
  });
});

describe("download helpers", () => {
  it("maps unknown/active stored types to octet-stream", () => {
    expect(safeDownloadContentType("text/html")).toBe("application/octet-stream");
    expect(safeDownloadContentType("image/svg+xml")).toBe("application/octet-stream");
    expect(safeDownloadContentType(undefined)).toBe("application/octet-stream");
    expect(safeDownloadContentType("application/pdf; charset=binary")).toBe("application/pdf");
  });

  it("builds an attachment disposition without header injection", () => {
    const h = attachmentDisposition('a"b\r\nSet-Cookie: x=1.pdf');
    expect(h.startsWith("attachment;")).toBe(true);
    expect(h).not.toMatch(/[\r\n]/);
    expect(h).not.toContain('a"b');
  });

  it("sanitizeFilename strips paths, control chars and leading dots", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("..\\..\\x.pdf")).toBe("x.pdf");
    expect(sanitizeFilename(".htaccess")).toBe("htaccess");
    expect(sanitizeFilename("")).toBe("file");
  });
});
