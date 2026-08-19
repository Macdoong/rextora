import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const excluded = new Set([".git", ".next", "node_modules", "data", "tmp", "test-results", "playwright-report"]);
const files = [];
function walk(dir, relative = "") {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!relative && excluded.has(entry.name)) continue;
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(absolute, rel);
    else if (entry.isFile()) files.push(rel);
  }
}
walk(root);
files.sort();
const tree = crypto.createHash("sha256");
const manifest = files.map((file) => {
  const content = fs.readFileSync(path.join(root, file));
  const sha256 = crypto.createHash("sha256").update(content).digest("hex");
  tree.update(file).update("\0").update(content).update("\0");
  return { file, sha256, bytes: content.length };
});
const report = {
  head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  fileCount: files.length,
  sourceTreeSha256: tree.digest("hex"),
  algorithm: "sha256(sorted(path + NUL + content + NUL))",
  excluded: [...excluded],
  capturedAt: new Date().toISOString(),
};
const out = path.join(root, "tmp/rextora-final-tester-completion");
fs.writeFileSync(path.join(out, "source-freeze-repaired.json"), `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(path.join(out, "source-freeze-repaired-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(report));
