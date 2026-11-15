const { execSync } = require("child_process");

const siteId = process.argv[2] || "5db54446-e5bc-4eb8-91f4-efb8f34a1d3d";
const target = (process.argv[3] || "").slice(0, 7);

const data = JSON.stringify({ site_id: siteId }).replace(/"/g, '\\"');
const out = execSync(`npx netlify api listSiteDeploys --data "${data}"`, {
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024,
  shell: true,
});
const arr = JSON.parse(out);
for (const x of arr.slice(0, 12)) {
  console.log(
    [
      (x.commit_ref || "").slice(0, 7) || "-------",
      x.state,
      x.context,
      x.ssl_url || x.deploy_ssl_url || "",
      (x.error_message || "").replace(/\s+/g, " ").slice(0, 80),
    ].join(" | "),
  );
}
if (!target) process.exit(0);
const hit = arr.find((x) => (x.commit_ref || "").startsWith(target));
if (!hit) {
  console.log(`TARGET ${target}: not found yet`);
  process.exit(2);
}
console.log(`TARGET_ID=${hit.id}`);
console.log(`TARGET_STATE=${hit.state}`);
console.log(`TARGET_URL=${hit.ssl_url || hit.deploy_ssl_url || ""}`);
console.log(`TARGET_ADMIN=${hit.admin_url || ""}`);
if (hit.error_message) {
  console.log(`TARGET_ERROR=${String(hit.error_message).slice(0, 300)}`);
}
process.exit(hit.state === "ready" || hit.state === "error" || hit.state === "failed" ? 0 : 3);
