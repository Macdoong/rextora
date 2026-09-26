import fs from "node:fs";
import path from "node:path";
import type { FullConfig } from "@playwright/test";
import {
  createUser,
  getUserByUsername,
} from "../../src/lib/rextora/auth/userStore";

const E2E_CEO = {
  username: "temp_ceo",
  displayName: "임시 대표",
  role: "ceo" as const,
  password: "ceo-temp-pass-9f3a",
};

/**
 * Seeds file-backed auth users into the isolated Playwright REXTORA_DATA_DIR
 * before `next start` serves requests.
 */
export default async function globalSetup(_config: FullConfig) {
  const dataRoot = process.env.REXTORA_E2E_DATA_ROOT;
  if (!dataRoot) {
    throw new Error("REXTORA_E2E_DATA_ROOT is required for Playwright global setup");
  }
  process.env.REXTORA_DATA_DIR = dataRoot;
  process.env.REXTORA_STRATEGIES_DIR = path.join(dataRoot, "strategies");
  fs.mkdirSync(path.join(dataRoot, "strategies"), { recursive: true });

  if (!getUserByUsername(E2E_CEO.username)) {
    await createUser(E2E_CEO);
  }
}
