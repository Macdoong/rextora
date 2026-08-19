"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { nodeFileTrace, resolve: nftResolve } = require("next/dist/compiled/@vercel/nft");
const ts = require("typescript");

const repo = process.cwd();
const entrypoint = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);

function localCandidate(base) {
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.json`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
    path.join(base, "index.js"),
  ];
  return candidates.find((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
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
  let source;
  try {
    source = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") return "";
    throw error;
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
    ignore: (file) => file.includes("node_modules/"),
  });
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  const evidence = {
    entrypoint: path.relative(repo, entrypoint),
    elapsedMs,
    tracedFileCount: result.fileList.size,
    esmFileCount: result.esmFileList.size,
    warningCount: result.warnings.size,
    warnings: [...result.warnings].map((warning) => String(warning).replaceAll(repo, "<REPO>")),
    tracedFiles: [...result.fileList].sort(),
  };
  fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ ...evidence, tracedFiles: undefined }, null, 2)}\n`);
})().catch((error) => {
  fs.writeFileSync(
    output,
    `${JSON.stringify({ entrypoint: path.relative(repo, entrypoint), failed: true, error: String(error).replaceAll(repo, "<REPO>") }, null, 2)}\n`,
  );
  throw error;
});
