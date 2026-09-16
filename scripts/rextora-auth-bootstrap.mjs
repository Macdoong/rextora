#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const server = await createServer({
    root,
    configFile: false,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error",
    ssr: {
      external: ["@rextora/runtime-paths", "@rextora/strategy-runtime-io"],
    },
  });
  try {
    const mod = await server.ssrLoadModule("/src/lib/rextora/auth/bootstrapCli.ts");
    const user = await mod.runAuthBootstrap(process.argv);
    console.log(`대표 계정이 생성되었습니다: ${user.username} (${user.displayName})`);
  } finally {
    await server.close();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(message === "BOOTSTRAP_PASSWORD_INPUT_GAP" ? 3 : 1);
});
