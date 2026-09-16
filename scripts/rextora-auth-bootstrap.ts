#!/usr/bin/env node
import { runAuthBootstrap } from "../src/lib/rextora/auth/bootstrapCli";

runAuthBootstrap()
  .then((user) => {
    console.log(`대표 계정이 생성되었습니다: ${user.username} (${user.displayName})`);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(message === "BOOTSTRAP_PASSWORD_INPUT_GAP" ? 3 : 1);
  });
