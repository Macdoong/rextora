const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = process.cwd();
const candidates = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"];
const indexCandidates = ["index.ts", "index.tsx", "index.js", "index.jsx", "index.mjs", "index.cjs", "index.json"];

function resolveLocal(specifier, importer) {
  let base;
  if (specifier.startsWith("@/")) base = path.join(root, specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(importer), specifier);
  else return null;
  for (const suffix of candidates) {
    const target = base + suffix;
    if (fs.existsSync(target) && fs.statSync(target).isFile()) return target;
  }
  if (fs.existsSync(base) && fs.statSync(base).isDirectory()) {
    for (const name of indexCandidates) {
      const target = path.join(base, name);
      if (fs.existsSync(target)) return target;
    }
  }
  return null;
}

const appEntries = [];
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full);
    else if (/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(ent.name)) appEntries.push(full);
  }
}
walk(path.join(root, "app"));
appEntries.push(path.join(root, "instrumentation.ts"), path.join(root, "next.config.ts"));

const queue = [...appEntries];
const seen = new Set();
const edges = [];
const externals = new Set();
const unresolvedLocal = [];
const moduleScopeRisks = [];
const dynamicImports = [];
const dataEdges = [];

function isInsideFunction(node) {
  let cur = node.parent;
  while (cur) {
    if (ts.isFunctionLike(cur) || ts.isClassLike(cur)) return true;
    cur = cur.parent;
  }
  return false;
}

while (queue.length) {
  const file = queue.shift();
  if (seen.has(file) || !fs.existsSync(file)) continue;
  seen.add(file);
  const text = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function visit(node) {
    let specifier = null;
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specifier = node.moduleSpecifier.text;
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) specifier = arg.text;
      dynamicImports.push({ file: path.relative(root, file), expression: node.getText(sf).slice(0, 300), literal: Boolean(specifier) });
    }
    if (specifier) {
      const resolved = resolveLocal(specifier, file);
      if (resolved) {
        edges.push({ from: path.relative(root, file), specifier, to: path.relative(root, resolved) });
        if (/^(?:data|tmp|logs|screenshots|playwright-report|test-results)(?:\/|$)/.test(path.relative(root, resolved))) dataEdges.push(edges.at(-1));
        queue.push(resolved);
      } else if (specifier.startsWith(".") || specifier.startsWith("@/")) {
        unresolvedLocal.push({ from: path.relative(root, file), specifier });
      } else externals.add(specifier);
    }
    if (ts.isCallExpression(node) && !isInsideFunction(node)) {
      const call = node.getText(sf);
      if (/\b(?:readdir|readdirSync|readFile|readFileSync|stat|statSync|existsSync|glob|JSON\.parse|register|recover|load|list|scan|walk|hydrate|migrat|cleanup)\b/i.test(call)) {
        moduleScopeRisks.push({ file: path.relative(root, file), line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, call: call.slice(0, 500) });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
}

const files = [...seen].map(file => ({ file: path.relative(root, file), bytes: fs.statSync(file).size })).sort((a,b) => b.bytes-a.bytes);
const report = {
  entryCount: appEntries.length,
  reachableLocalFileCount: files.length,
  reachableLocalBytes: files.reduce((n, f) => n + f.bytes, 0),
  reachableFiles: files,
  largestReachableFiles: files.slice(0, 30),
  edgeCount: edges.length,
  dataOrEvidenceImportEdges: dataEdges,
  moduleScopeRisks,
  dynamicImports,
  unresolvedLocal,
  externalPackages: [...externals].sort(),
};
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
