const fs = require("fs");
const p = "src/components/forms/sa100-wizard.tsx";
let s = fs.readFileSync(p, "utf8");
s = s.replaceAll("<£", "<Money").replaceAll("</£>", "</Money>");
// also fix common import/call mismatches against project APIs
s = s.replaceAll("gatherFraudMetadata", "gatherFraudMetadata");
s = s.replace(
  'import { gatherFraudMetadata } from "@/components/fraud-metadata";',
  'import { gatherFraudMetadata } from "@/components/fraud-metadata";',
);
fs.writeFileSync(p, s);
console.log("done", (s.match(/<Money/g) || []).length);
