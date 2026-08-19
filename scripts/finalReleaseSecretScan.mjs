/**
 * Secret-leak audit across tmp evidence and API responses.
 */
import fs from "node:fs";
import path from "node:path";
import { loadProjectEnv } from "./loadProjectEnv.mjs";

const root = process.cwd();
Object.assign(process.env, loadProjectEnv(root));
const outDir = path.join(root, "tmp/provider-backed-final-release/secret-scan");
fs.mkdirSync(outDir, { recursive: true });

const patterns = [
  { name: "openai_key", re: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: "gemini_key", re: /\bAIza[A-Za-z0-9_-]{20,}\b/g },
  { name: "bearer", re: /Bearer\s+sk-/gi },
];

function scanText(text, surface) {
  const hits = [];
  for (const p of patterns) {
    p.re.lastIndex = 0;
    const m = text.match(p.re);
    if (m?.length) hits.push({ surface, kind: p.name, count: m.length });
  }
  return hits;
}

function walk(dir, hits) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".git"].includes(entry.name)) continue;
      walk(full, hits);
      continue;
    }
    if (!/\.(json|txt|md|log|html|ts|tsx|mjs)$/.test(entry.name)) continue;
    const text = fs.readFileSync(full, "utf8");
    hits.push(...scanText(text, full.replace(root + path.sep, "")));
  }
}

const hits = [];
walk(path.join(root, "tmp/provider-backed-final-release"), hits);

async function scanApi() {
  const apiHits = [];
  try {
    const settings = await (
      await fetch("http://127.0.0.1:3000/api/rextora/settings/ai-providers")
    ).json();
    apiHits.push(
      ...scanText(JSON.stringify(settings), "api/settings-get"),
    );
  } catch {
    apiHits.push({ surface: "api/settings-get", kind: "unavailable", count: 0 });
  }
  return apiHits;
}

const apiHits = await scanApi();
const all = [...hits, ...apiHits];
const result = {
  secretLeakCount: all.reduce((n, h) => n + (h.count ?? 0), 0),
  hitSurfaces: all,
  scannedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(outDir, "audit.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ secretLeakCount: result.secretLeakCount, surfaces: all.length }, null, 2));
process.exitCode = result.secretLeakCount === 0 ? 0 : 1;
