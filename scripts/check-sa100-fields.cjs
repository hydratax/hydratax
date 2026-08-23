const fs = require("fs");
const s = fs.readFileSync("src/lib/sa100/schema.ts", "utf8");
const c = fs.readFileSync("src/lib/sa100/calculate.ts", "utf8");
const r = fs.readFileSync("src/lib/sa100/rates-2025-26.ts", "utf8");

const schemaKeys = new Set([...s.matchAll(/^\s{2}(\w+)[?:]/gm)].map((m) => m[1]));
const rateKeys = new Set([...r.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]));
const dRefs = [...new Set([...c.matchAll(/\bd\.(\w+)/g)].map((m) => m[1]))];
const RRefs = [...new Set([...c.matchAll(/\bR\.(\w+)/g)].map((m) => m[1]))];

console.log("MISSING d.", dRefs.filter((k) => !schemaKeys.has(k)).join(", ") || "(none)");
console.log("MISSING R.", RRefs.filter((k) => !rateKeys.has(k)).join(", ") || "(none)");
console.log("R refs", RRefs.join(", "));
console.log("rate keys", [...rateKeys].join(", "));
console.log("exports calc", [...c.matchAll(/export function (\w+)/g)].map(m=>m[1]));
console.log("exports schema", [...s.matchAll(/export function (\w+)/g)].map(m=>m[1]));
