#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  process.chdir(root);
  delete process.env.REXTORA_DATA_DIR;
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
    const mod = await server.ssrLoadModule(
      "/src/lib/rextora/auth/resetPasswordCli.ts",
    );
    const result = await mod.runAuthPasswordReset(process.argv);
    console.log(
      `비밀번호가 변경되었습니다: ${result.username} (${result.displayName}, ${result.role}) / 사용자 수 ${result.totalUsers}`,
    );
  } finally {
    await server.close();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(message.includes("사용자를 찾을 수 없습니다") ? 2 : 1);
});
