/**
 * Initialize the shared demo workspace fixture.
 * Same implementation as POST /api/rextora/first-run/demo (confirm=true).
 *
 * Usage (isolated root recommended):
 *   set REXTORA_DATA_DIR=...
 *   set REXTORA_STRATEGIES_DIR=%REXTORA_DATA_DIR%\strategies
 *   node scripts/init-demo-workspace.mjs
 */
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

async function main() {
  // Prefer ts via Next/tsx path — load compiled through dynamic import of source via ts-node is unavailable.
  // Use vitest-style: spawn is overkill; import TypeScript via next's loader isn't here.
  // Instead call the same module through a small register of tsx if available, else fail with guidance.
  const root = process.cwd();
  process.env.REXTORA_DATA_DIR =
    process.env.REXTORA_DATA_DIR?.trim() ||
    path.join(root, "tmp", "demo-init-runtime");
  process.env.REXTORA_STRATEGIES_DIR =
    process.env.REXTORA_STRATEGIES_DIR?.trim() ||
    path.join(process.env.REXTORA_DATA_DIR, "strategies");

  // Dynamic import of TS source works under Node with the project's vitest/tsx toolchain via npx.
  const { initializeDemoWorkspace } = await import(
    "../src/lib/rextora/firstRun/demoFixture.ts"
  );
  const result = initializeDemoWorkspace();
  console.log(
    JSON.stringify(
      {
        ok: true,
        dataDir: process.env.REXTORA_DATA_DIR,
        strategiesDir: process.env.REXTORA_STRATEGIES_DIR,
        result,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
