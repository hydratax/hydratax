const fs = require("fs");
const p = "src/components/forms/sa100-wizard.tsx";
let s = fs.readFileSync(p, "utf8");
// Ensure we call the real export name gatherFraudMetadata
s = s.replace(
  /import \{ [^}]+ \} from "@\/components\/fraud-metadata";/,
  'import { gatherFraudMetadata } from "@/components/fraud-metadata";',
);
s = s.replace(
  /fraudMetadata:\s*\w+\(\)/,
  "fraudMetadata: gatherFraudMetadata()",
);
fs.writeFileSync(p, s);
console.log("wizard fraud import ok");
