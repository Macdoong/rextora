"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { nodeFileTrace, resolve: nftResolve } = require("next/dist/compiled/@vercel/nft");
const ts = require("typescript");

const repo = process.cwd();
const entrypoint = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const observedPatterns = new Set();
const observedPackageInputs = new Set();
const guard = setTimeout(() => {
  fs.writeFileSync(output, `${JSON.stringify({ failed: true, timedOut: true }, null, 2)}\n`);
  process.exit(124);
}, 20_000);

function localCandidate(base) {
  return [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, `${base}.json`,
    path.join(base, "index.ts"), path.join(base, "index.tsx"), path.join(base, "index.js")]
    .find((candidate) => {
      try { return fs.statSync(candidate).isFile(); } catch { return false; }
    });
}

async function resolve(id, parent, job, isCjs) {
  if (id.startsWith("@/")) {
    const candidate = localCandidate(path.join(repo, id.slice(2)));
    if (candidate) return candidate;
  }
  if (id.startsWith("./") || id.startsWith("../")) {
    const candidate = localCandidate(path.resolve(path.dirname(parent), id));
    if (candidate) return candidate;
  }
  return nftResolve(id, parent, job, isCjs);
}

async function readFile(file) {
  const opaquePackage = process.env.REXTORA_NFT_OPAQUE_PACKAGE;
  if (opaquePackage && file.includes(`/node_modules/${opaquePackage}/`)) {
    return "module.exports = {};";
  }
  let source;
  try { source = fs.readFileSync(file, "utf8"); }
  catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") return "";
    throw error;
  }
  const neuter = process.env.REXTORA_NFT_NEUTER_RUNTIME_IO;
  if (neuter && path.relative(repo, file) === neuter) {
    const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const transformed = ts.transform(parsed, [
      (context) => {
        const visit = (node) => {
          if (
            ts.isImportDeclaration(node) &&
            ts.isStringLiteral(node.moduleSpecifier) &&
            node.moduleSpecifier.text === "@rextora/strategy-runtime-io"
          ) {
            return undefined;
          }
          if (
            ts.isCallExpression(node) &&
            ts.isPropertyAccessExpression(node.expression) &&
            ts.isIdentifier(node.expression.expression) &&
            ["runtimeIo", "strategyRuntimeIo"].includes(node.expression.expression.text)
          ) {
            const name = node.expression.name.text;
            if (name === "readDirectory") return ts.factory.createArrayLiteralExpression();
            if (name === "fileExists") return ts.factory.createFalse();
            if (name === "readFile") return ts.factory.createStringLiteral("");
            if (name === "fileStat") {
              return ts.factory.createObjectLiteralExpression([
                ts.factory.createPropertyAssignment("size", ts.factory.createNumericLiteral(0)),
                ts.factory.createMethodDeclaration(undefined, undefined, "isFile", undefined, undefined, [], undefined, ts.factory.createBlock([ts.factory.createReturnStatement(ts.factory.createFalse())])),
                ts.factory.createMethodDeclaration(undefined, undefined, "isDirectory", undefined, undefined, [], undefined, ts.factory.createBlock([ts.factory.createReturnStatement(ts.factory.createFalse())])),
              ]);
            }
            if (name === "openFile") return ts.factory.createNumericLiteral(0);
            return ts.factory.createVoidZero();
          }
          if (
            ts.isCallExpression(node) &&
            ts.isPropertyAccessExpression(node.expression) &&
            ts.isIdentifier(node.expression.expression) &&
            node.expression.expression.text === "path" &&
            ["join", "resolve"].includes(node.expression.name.text)
          ) {
            return ts.factory.createStringLiteral("/fixed/path");
          }
          return ts.visitEachChild(node, visit, context);
        };
        return (node) => ts.visitNode(node, visit);
      },
    ]);
    source = ts.createPrinter().printFile(transformed.transformed[0]);
    transformed.dispose();
    fs.writeFileSync(path.join(repo, "tmp/rextora-nft-runtime-boundary/neutered-source.ts"), source);
  }
  const staticJsonNames = process.env.REXTORA_NFT_STATIC_JSON_NAMES;
  if (staticJsonNames && path.relative(repo, file) === staticJsonNames) {
    const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const transformed = ts.transform(parsed, [
      (context) => {
        const visit = (node) => {
          if (ts.isTemplateExpression(node) && node.templateSpans.length === 1 && node.templateSpans[0].literal.text === ".json") {
            return ts.factory.createStringLiteral("fixed-strategy.json");
          }
          return ts.visitEachChild(node, visit, context);
        };
        return (node) => ts.visitNode(node, visit);
      },
    ]);
    source = ts.createPrinter().printFile(transformed.transformed[0]);
    transformed.dispose();
  }
  if (/\.[cm]?tsx?$/.test(file)) {
    return ts.transpileModule(source, {
      fileName: file,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText;
  }
  return source;
}

(async () => {
  const started = process.hrtime.bigint();
  const result = await nodeFileTrace([entrypoint], {
    base: repo,
    processCwd: repo,
    mixedModules: true,
    readFile,
    resolve,
    ignore: (file) => {
      if (file.includes("rextora-runtime-paths")) observedPackageInputs.add(file);
      if (file.includes("node_modules/")) return true;
      if (/[*?\[\]]/.test(file)) {
        observedPatterns.add(file.split(path.sep).join("/"));
        return true;
      }
      return false;
    },
  });
  const evidence = {
    entrypoint: path.relative(repo, entrypoint),
    elapsedMs: Number(process.hrtime.bigint() - started) / 1e6,
    tracedFileCount: result.fileList.size,
    warningCount: result.warnings.size,
    observedAssetGlobInputs: [...observedPatterns].sort(),
    observedPackageInputs: [...observedPackageInputs].sort(),
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
  clearTimeout(guard);
  console.log(JSON.stringify(evidence));
})().catch((error) => {
  fs.writeFileSync(output, `${JSON.stringify({ failed: true, error: String(error) }, null, 2)}\n`);
  throw error;
});
