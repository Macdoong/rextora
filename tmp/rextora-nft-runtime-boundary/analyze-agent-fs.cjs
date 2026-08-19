"use strict";

const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const repo = process.cwd();
const entry = process.argv[2] || "app/api/rextora/agent/route.ts";
const output = "tmp/rextora-nft-runtime-boundary/agent-fs-chain.json";

function resolveLocal(specifier, parent) {
  let base;
  if (specifier.startsWith("@/")) base = path.join(repo, specifier.slice(2));
  else if (specifier.startsWith("./") || specifier.startsWith("../")) {
    base = path.resolve(path.dirname(path.join(repo, parent)), specifier);
  } else return null;
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
    path.join(base, "index.js"),
  ]) {
    try {
      if (fs.statSync(candidate).isFile()) return path.relative(repo, candidate);
    } catch {}
  }
  return null;
}

function text(node, source) {
  return node.getText(source).replace(/\s+/g, " ").slice(0, 500);
}

const queue = [entry];
const parents = new Map([[entry, null]]);
const graph = new Map();
const operations = [];

while (queue.length) {
  const file = queue.shift();
  const absolute = path.join(repo, file);
  const sourceText = fs.readFileSync(absolute, "utf8");
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true);
  const imports = [];
  const fsBindings = new Set();

  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const specifier = statement.moduleSpecifier.text;
    const resolved = resolveLocal(specifier, file);
    if (resolved) {
      imports.push(resolved);
      if (!parents.has(resolved)) {
        parents.set(resolved, file);
        queue.push(resolved);
      }
    }
    if (["node:fs", "fs", "node:fs/promises", "fs/promises"].includes(specifier)) {
      if (statement.importClause?.name) fsBindings.add(statement.importClause.name.text);
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) fsBindings.add(bindings.name.text);
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) fsBindings.add(element.name.text);
      }
    }
  }
  graph.set(file, imports);

  function visit(node, currentFunction = "module scope") {
    let fn = currentFunction;
    if (ts.isFunctionDeclaration(node) && node.name) fn = node.name.text;
    else if (ts.isMethodDeclaration(node) && node.name) fn = text(node.name, source);
    else if (ts.isVariableDeclaration(node) && node.name && node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
      fn = text(node.name, source);
    }
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      let api = null;
      if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression) && fsBindings.has(expression.expression.text)) {
        api = `${expression.expression.text}.${expression.name.text}`;
      } else if (ts.isIdentifier(expression) && fsBindings.has(expression.text)) api = expression.text;
      if (api) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        operations.push({
          file,
          line,
          symbol: fn,
          filesystemApi: api,
          expression: text(node, source),
          neededAtImportTime: fn === "module scope",
        });
      }
    }
    ts.forEachChild(node, (child) => visit(child, fn));
  }
  visit(source);
}

function chain(file) {
  const result = [];
  for (let current = file; current; current = parents.get(current)) result.push(current);
  return result.reverse();
}

const relevantFamilies = [
  "jsonStore", "jobStore", "rawTrialRetention", "storageSummary", "deletionSafety",
  "commandStore", "backtestStore", "strategyStore", "/agent/v2/", "runtimePaths",
];
const rows = operations.map((operation) => ({
    ...operation,
    focusFamily: relevantFamilies.find((family) => operation.file.includes(family)) ?? null,
    importingParent: parents.get(operation.file),
    importChain: chain(operation.file),
  }));

const evidence = {
  entrypoint: entry,
  reachableLocalModuleCount: parents.size,
  reachableLocalModules: [...parents.keys()].sort(),
  filesystemOperationCount: operations.length,
  relevantFilesystemOperationCount: rows.filter((row) => row.focusFamily).length,
  operations: rows,
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ ...evidence, operations: undefined }, null, 2));
