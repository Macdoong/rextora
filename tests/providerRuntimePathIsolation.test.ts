import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rextoraDataRoot } from "../src/lib/rextora/storage/runtimePaths";
import { getDataDir, invalidateJsonStoreCache } from "../src/lib/rextora/storage/jsonStore";

const REAL_DATA = path.join(process.cwd(), "data", "rextora");

describe("provider runtime path isolation", () => {
  let tmpRoot = "";
  let prevDataDir: string | undefined;

  beforeEach(() => {
    prevDataDir = process.env.REXTORA_DATA_DIR;
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-path-iso-"));
    process.env.REXTORA_DATA_DIR = tmpRoot;
    invalidateJsonStoreCache();
  });

  afterEach(() => {
    if (prevDataDir === undefined) delete process.env.REXTORA_DATA_DIR;
    else process.env.REXTORA_DATA_DIR = prevDataDir;
    invalidateJsonStoreCache();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("rextoraDataRoot and jsonStore follow REXTORA_DATA_DIR", () => {
    expect(path.resolve(rextoraDataRoot())).toBe(path.resolve(tmpRoot));
    expect(path.resolve(getDataDir())).toBe(path.resolve(tmpRoot));
    expect(path.resolve(getDataDir())).not.toBe(path.resolve(REAL_DATA));
  });

  it("credential secrets dir resolves under REXTORA_DATA_DIR", async () => {
    const prevOpenAi = process.env.OPENAI_API_KEY;
    const prevGemini = process.env.GEMINI_API_KEY;
    const prevGoogle = process.env.GOOGLE_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    try {
      const mod = await import(
        "../src/lib/rextora/agent/v2/providers/providerCredentialStore"
      );
      // Must not read cwd secrets when override set; no env fallback in this test.
      expect(mod.hasStoredCredential("openai")).toBe(false);
      expect(mod.hasStoredCredential("gemini")).toBe(false);
      expect(mod.resolveProviderApiKey("openai")).toBeUndefined();
      expect(mod.resolveProviderApiKey("gemini")).toBeUndefined();
    } finally {
      if (prevOpenAi === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prevOpenAi;
      if (prevGemini === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = prevGemini;
      if (prevGoogle === undefined) delete process.env.GOOGLE_API_KEY;
      else process.env.GOOGLE_API_KEY = prevGoogle;
    }
  });
});

