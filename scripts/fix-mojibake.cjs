/**
 * Repair UTF-8 text that was wrongly re-saved as Windows-1252/Latin-1 ("mojibake").
 * Example: "—" (em dash) becomes "â€”", "£" becomes "Â£", "’" becomes "â€™".
 *
 * Usage: node scripts/fix-mojibake.cjs
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

/** Windows-1252 byte → Unicode code point (for 0x80–0x9F that differ from latin1). */
const CP1252 = {
  0x80: 0x20ac, // €
  0x82: 0x201a,
  0x83: 0x0192,
  0x84: 0x201e,
  0x85: 0x2026,
  0x86: 0x2020,
  0x87: 0x2021,
  0x88: 0x02c6,
  0x89: 0x2030,
  0x8a: 0x0160,
  0x8b: 0x2039,
  0x8c: 0x0152,
  0x8e: 0x017d,
  0x91: 0x2018,
  0x92: 0x2019,
  0x93: 0x201c,
  0x94: 0x201d,
  0x95: 0x2022,
  0x96: 0x2013,
  0x97: 0x2014,
  0x98: 0x02dc,
  0x99: 0x2122,
  0x9a: 0x0161,
  0x9b: 0x203a,
  0x9c: 0x0153,
  0x9e: 0x017e,
  0x9f: 0x0178,
};

function utf8BytesAsCp1252Mojibake(utf8Buf) {
  let out = "";
  for (const b of utf8Buf) {
    const cp = CP1252[b] ?? b;
    out += String.fromCodePoint(cp);
  }
  return Buffer.from(out, "utf8");
}

function mojibakeOf(char) {
  return utf8BytesAsCp1252Mojibake(Buffer.from(char, "utf8"));
}

function replaceBuffer(buf, from, toBuf) {
  const fromArr = [...from];
  const out = [];
  for (let i = 0; i < buf.length; ) {
    let match = i + fromArr.length <= buf.length;
    if (match) {
      for (let j = 0; j < fromArr.length; j++) {
        if (buf[i + j] !== fromArr[j]) {
          match = false;
          break;
        }
      }
    }
    if (match) {
      out.push(...toBuf);
      i += fromArr.length;
    } else {
      out.push(buf[i]);
      i += 1;
    }
  }
  return Buffer.from(out);
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", ".git"].includes(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx|md|json|css|html)$/.test(ent.name)) out.push(full);
  }
  return out;
}

const goods = [
  "—",
  "–",
  "’",
  "‘",
  "“",
  "”",
  "…",
  "→",
  "←",
  "£",
  "·",
  "€",
  "©",
  "®",
  "°",
  "•",
  "™",
  "\u00A0", // nbsp
];

const pairs = goods.map((good) => ({
  from: mojibakeOf(good),
  to: Buffer.from(good, "utf8"),
  good,
}));

const scanRoots = ["src", "scripts", "supabase", "migrations"]
  .map((r) => path.join(root, r))
  .filter((r) => fs.existsSync(r));

let changed = 0;
for (const scanRoot of scanRoots) {
  for (const file of walk(scanRoot)) {
    let buf = fs.readFileSync(file);
    const before = Buffer.from(buf);
    for (const { from, to } of pairs) {
      buf = replaceBuffer(buf, from, to);
    }
    if (!buf.equals(before)) {
      fs.writeFileSync(file, buf);
      changed += 1;
      console.log("fixed", path.relative(root, file));
    }
  }
}
console.log("filesChanged", changed);

const leftoverMarkers = ["â€", "â†", "Â£", "Â·", "â‚¬", "Â©", "Â®"];
for (const scanRoot of scanRoots) {
  for (const file of walk(scanRoot)) {
    const s = fs.readFileSync(file, "utf8");
    const hit = leftoverMarkers.find((m) => s.includes(m));
    if (!hit) continue;
    console.log("still has junk:", path.relative(root, file));
    const i = s.indexOf(hit);
    console.log("  context:", JSON.stringify(s.slice(Math.max(0, i - 20), i + 30)));
  }
}
