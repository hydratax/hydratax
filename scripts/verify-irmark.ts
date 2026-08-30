import fs from "node:fs";
import path from "node:path";
import { computeIrmark } from "../src/server/hmrc/ct600/irmark";

const xml = fs.readFileSync(
  path.join(import.meta.dirname, "..", ".ct-test", "last-submit.xml"),
  "utf8",
);
const bodyMatch = xml.match(/<Body>([\s\S]*)<\/Body>/i);
if (!bodyMatch) throw new Error("No Body");
const bodyInner = bodyMatch[1];
const embedded = bodyInner.match(/<(?:ct:)?IRmark[^>]*>([^<]+)<\/(?:ct:)?IRmark>/i)?.[1];
const bodyWithoutMark = bodyInner.replace(
  /<(?:ct:)?IRmark[^>]*>[\s\S]*?<\/(?:ct:)?IRmark>/i,
  "",
);
const computed = computeIrmark(bodyWithoutMark);
console.log("Embedded:", embedded);
console.log("Computed:", computed);
console.log("Match:", embedded === computed);
