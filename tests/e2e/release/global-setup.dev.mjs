import { spawnSync } from "node:child_process";
import path from "node:path";

export default async function globalSetup() {
  const script = path.join(process.cwd(), "scripts/warmDevRoutes.mjs");
  const result = spawnSync(process.execPath, [script], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error("warmDevRoutes_failed");
  }
}
