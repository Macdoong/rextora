const fs = require("node:fs");
const path = require("node:path");
const { nodeFileTrace } = require("next/dist/compiled/@vercel/nft");

async function main() {
  const entry = path.resolve(process.argv[2]);
  const started = performance.now();
  const result = await nodeFileTrace([entry], {
    base: process.cwd(),
    processCwd: process.cwd(),
    mixedModules: true,
    ts: true,
    conditions: ["node", "production"],
  });
  const files = [...result.fileList].sort();
  const relevantRuntime = files.filter((file) => /(?:^|\/)(?:data|tmp|logs|screenshots)(?:\/|$)|strategy-search\/(?:jobs|trials)/.test(file));
  const reasons = {};
  for (const file of relevantRuntime.slice(0, 100)) reasons[file] = result.reasons.get(file);
  process.stdout.write(JSON.stringify({
    entry: path.relative(process.cwd(), entry),
    durationMs: Math.round(performance.now() - started),
    fileCount: files.length,
    warnings: [...result.warnings].map(String),
    relevantRuntimeCount: relevantRuntime.length,
    relevantRuntime: relevantRuntime.slice(0, 100),
    reasons,
  }, null, 2) + "\n");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
