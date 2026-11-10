import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * UTF-8 wrongly re-interpreted as Windows-1252 ("mojibake") renders as garbage
 * on mobile/desktop. Build probes from correct Unicode so this file stays clean.
 */

/** Windows-1252 for bytes 0x80–0x9F (elsewhere same as Latin-1). */
const CP1252: Record<number, number> = {
  0x80: 0x20ac,
  0x82: 0x201a,
  0x83: 0x0192,
  0x84: 0x201e,
  0x85: 0x2026,
  0x91: 0x2018,
  0x92: 0x2019,
  0x93: 0x201c,
  0x94: 0x201d,
  0x95: 0x2022,
  0x96: 0x2013,
  0x97: 0x2014,
  0x99: 0x2122,
  0xa3: 0x00a3,
  0xb7: 0x00b7,
};

function asCp1252Mojibake(char: string): string {
  const bytes = Buffer.from(char, "utf8");
  let out = "";
  for (const b of bytes) {
    out += String.fromCodePoint(CP1252[b] ?? b);
  }
  return out;
}

const PROBE_CHARS = ["—", "–", "’", "‘", "“", "”", "…", "£", "·", "€", "©", "®", "→"];
const MOJIBAKE_MARKERS = [
  ...new Set(
    PROBE_CHARS.flatMap((ch) => {
      const full = asCp1252Mojibake(ch);
      // Prefer 2-char stems that are distinctive and appear in corrupted source
      return full.length >= 2 ? [full.slice(0, 2), full] : [full];
    }),
  ),
];

const SOURCE_ROOT = join(process.cwd(), "src");
const EXT = /\.(ts|tsx|js|jsx|css|md|json|html)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (EXT.test(name)) out.push(full);
  }
  return out;
}

describe("encoding hygiene", () => {
  it("builds distinctive mojibake probes", () => {
    expect(MOJIBAKE_MARKERS.length).toBeGreaterThan(5);
    expect(asCp1252Mojibake("£")).toContain("\u00A3");
  });

  it("has no UTF-8/Windows-1252 mojibake in src", () => {
    const offenders: string[] = [];
    for (const file of walk(SOURCE_ROOT)) {
      const text = readFileSync(file, "utf8");
      const hit = MOJIBAKE_MARKERS.find((m) => m.length > 0 && text.includes(m));
      if (!hit) continue;
      const at = text.indexOf(hit);
      const ctx = text.slice(Math.max(0, at - 24), at + 32).replace(/\s+/g, " ");
      offenders.push(`${relative(process.cwd(), file)} :: ${JSON.stringify(ctx)}`);
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
