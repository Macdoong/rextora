/**
 * Inspect Next.js .next output for oversized / unsafe file tracing.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const NEXT_DIR = path.join(ROOT, ".next");

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

function dirSizeBytes(dir) {
  let total = 0;
  for (const file of walk(dir)) {
    try {
      total += fs.statSync(file).size;
    } catch {
      /* ignore */
    }
  }
  return total;
}

function formatBytes(n) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)}KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)}MB`;
  return `${(n / 1024 ** 3).toFixed(2)}GB`;
}

function collectNftFiles() {
  return walk(NEXT_DIR).filter((f) => f.endsWith(".nft.json"));
}

function analyze() {
  const nftFiles = collectNftFiles();
  const counts = {
    tmp: 0,
    screenshots: 0,
    gitEvidence: 0,
    envFiles: 0,
    acceptanceArtifacts: 0,
  };
  const samples = {
    tmp: [],
    screenshots: [],
    envFiles: [],
    gitEvidence: [],
  };
  const pathCounts = new Map();

  for (const nft of nftFiles) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(nft, "utf8"));
    } catch {
      continue;
    }
    for (const file of parsed.files ?? []) {
      const normalized = String(file).replace(/\\/g, "/");
      pathCounts.set(normalized, (pathCounts.get(normalized) ?? 0) + 1);
      const isTmp = /(^|\/)tmp\//.test(normalized);
      const isShot = /\.(png|jpe?g|webp)$/i.test(normalized) || /screenshot/i.test(normalized);
      const isEnv = /(^|\/)\.env(\.|$)/.test(normalized) || /\.env\.local$/.test(normalized);
      const isGit = /(^|\/)\.git\//.test(normalized) || /git-diff|gitEvidence/i.test(normalized);
      const isAcceptance =
        /acceptance|phase3-|agent-v2-|codex-master-run|operator-fix/i.test(normalized);

      if (isTmp) {
        counts.tmp += 1;
        if (samples.tmp.length < 8) samples.tmp.push(normalized);
      }
      if (isShot) {
        counts.screenshots += 1;
        if (samples.screenshots.length < 8) samples.screenshots.push(normalized);
      }
      if (isEnv) {
        counts.envFiles += 1;
        if (samples.envFiles.length < 8) samples.envFiles.push(normalized);
      }
      if (isGit) {
        counts.gitEvidence += 1;
        if (samples.gitEvidence.length < 8) samples.gitEvidence.push(normalized);
      }
      if (isAcceptance) counts.acceptanceArtifacts += 1;
    }
  }

  const largest = [...pathCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([file, count]) => ({ file, count }));

  const safePath = path.join(ROOT, "data", "strategies", "SAFE_v44_i4060.json");
  const runtimeRequired = {
    safeStrategyPresent: fs.existsSync(safePath),
  };

  const totalSize = dirSizeBytes(NEXT_DIR);
  const secretFailure = counts.envFiles > 0;

  const report = {
    inspectedAt: new Date().toISOString(),
    nextDir: NEXT_DIR,
    totalSizeBytes: totalSize,
    totalSizeHuman: formatBytes(totalSize),
    nftManifestCount: nftFiles.length,
    traced: counts,
    samples,
    largestTracedPaths: largest,
    runtimeRequired,
    secretTraceFailure: secretFailure,
    pass: !secretFailure && counts.tmp === 0 && counts.screenshots === 0,
  };

  return report;
}

const report = analyze();
const outArg = process.argv.find((a) => a.startsWith("--out="));
const outPath = outArg
  ? path.resolve(outArg.slice("--out=".length))
  : path.join(ROOT, "tmp", "cursor-tester-ready-fix", "trace-inspection.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  outPath,
  totalSizeHuman: report.totalSizeHuman,
  tracedTmp: report.traced.tmp,
  tracedScreenshots: report.traced.screenshots,
  tracedEnv: report.traced.envFiles,
  secretTraceFailure: report.secretTraceFailure,
  pass: report.pass,
}, null, 2));
process.exitCode = report.secretTraceFailure ? 1 : 0;
