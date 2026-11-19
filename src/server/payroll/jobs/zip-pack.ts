/**
 * Minimal ZIP reader for bureau packs (STORED + DEFLATE only).
 * No extra npm dependency — uses Node zlib. Enough for CSV take-on packs.
 */

import { inflateRawSync } from "node:zlib";

export type ZipEntry = {
  path: string;
  data: Buffer;
};

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;

function u16(buf: Buffer, off: number): number {
  return buf.readUInt16LE(off);
}

function u32(buf: Buffer, off: number): number {
  return buf.readUInt32LE(off);
}

/**
 * List and extract text-ish entries from a ZIP buffer.
 * Skips directories and encrypted / unsupported compression methods.
 */
export function extractZipEntries(zipBytes: Buffer | Uint8Array): ZipEntry[] {
  const buf = Buffer.isBuffer(zipBytes) ? zipBytes : Buffer.from(zipBytes);
  const entries: ZipEntry[] = [];
  let offset = 0;

  while (offset + 4 <= buf.length) {
    const sig = u32(buf, offset);
    if (sig === SIG_CENTRAL || sig === SIG_END) break;
    if (sig !== SIG_LOCAL) {
      // Skip junk until next plausible signature
      offset += 1;
      continue;
    }
    if (offset + 30 > buf.length) break;

    const method = u16(buf, offset + 8);
    const compSize = u32(buf, offset + 18);
    const nameLen = u16(buf, offset + 26);
    const extraLen = u16(buf, offset + 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + nameLen;
    const dataStart = nameEnd + extraLen;
    const dataEnd = dataStart + compSize;
    if (dataEnd > buf.length) break;

    const name = buf.subarray(nameStart, nameEnd).toString("utf8");
    const compressed = buf.subarray(dataStart, dataEnd);
    offset = dataEnd;

    if (!name || name.endsWith("/")) continue;
    // Skip absolute / traversal paths
    const norm = name.replace(/\\/g, "/").replace(/^\/+/, "");
    if (norm.includes("..")) continue;

    let data: Buffer;
    if (method === 0) {
      data = Buffer.from(compressed);
    } else if (method === 8) {
      try {
        data = inflateRawSync(compressed);
      } catch {
        continue;
      }
    } else {
      continue;
    }
    entries.push({ path: norm, data });
  }

  return entries;
}

export function zipEntriesAsTextMap(
  entries: ZipEntry[],
  opts?: { encoding?: BufferEncoding },
): Map<string, string> {
  const enc = opts?.encoding ?? "utf8";
  const map = new Map<string, string>();
  for (const e of entries) {
    map.set(e.path, e.data.toString(enc));
  }
  return map;
}
