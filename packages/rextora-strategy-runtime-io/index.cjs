"use strict";

const fs = require("node:fs");
const path = require("node:path");

module.exports = Object.freeze({
  absolutePath: (target) => path.resolve(target),
  baseName: (target) => path.basename(target),
  canonicalSafeFile: (cwd, safeId) => path.join(cwd, "data", "strategies", `${safeId}.json`),
  canonicalSafeSourceDir: (cwd) => path.resolve(cwd, "data", "strategies"),
  ensureDirectory: (root) => fs.mkdirSync(root, { recursive: true }),
  fileSystemRoot: (target) => path.parse(target).root,
  hasPath: (target) => fs.existsSync(target),
  isPathInside: (child, parent) => {
    const resolvedChild = path.resolve(child);
    const resolvedParent = path.resolve(parent);
    if (resolvedChild === resolvedParent) return true;
    const prefix = resolvedParent.endsWith(path.sep) ? resolvedParent : resolvedParent + path.sep;
    return resolvedChild.startsWith(prefix);
  },
  listNames: (root) => fs.readdirSync(root),
  productionStrategiesRoot: (cwd) => path.resolve(cwd, "data", "rextora", "strategies"),
  readText: (target) => fs.readFileSync(target, "utf8"),
  removeFile: (target) => fs.unlinkSync(target),
  resolveIndexPath: (root) => path.join(root, "index.json"),
  resolveStrategyPath: (root, id) => path.resolve(root, `${id}.json`),
  writeText: (target, contents) => fs.writeFileSync(target, contents, "utf8"),
});
