/**
 * Stable repository-root resolution for Node acceptance harnesses.
 * Never depends on process.cwd().
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function resolveRepoRoot(fromModuleUrl) {
  let dir = path.dirname(fileURLToPath(fromModuleUrl));
  while (true) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error("repository_root_not_found");
    }
    dir = parent;
  }
}

export function resolveFromRepo(fromModuleUrl, ...segments) {
  return path.join(resolveRepoRoot(fromModuleUrl), ...segments);
}
