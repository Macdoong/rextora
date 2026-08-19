/**
 * Load repository environment through the supported .env.local mechanism.
 * Never logs or returns secret values.
 */
import fs from "node:fs";
import path from "node:path";

export function loadProjectEnv(repoRoot, baseEnv = process.env) {
  const env = { ...baseEnv };
  const file = path.join(repoRoot, ".env.local");
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}
