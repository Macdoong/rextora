import { describe, expect, it } from "vitest";
import { assertHarnessDependencies } from "../scripts/providerCanaryProbe.mjs";
import { loadProjectEnv } from "../scripts/loadProjectEnv.mjs";
import { resolveRepoRoot } from "../scripts/repoPaths.mjs";

describe("acceptance harness dependency resolution", () => {
  it("resolves repository root from harness module location", () => {
    const harnessUrl = new URL("../tmp/codex-master-run/phase3-isolated-acceptance.mjs", import.meta.url);
    const repoRoot = assertHarnessDependencies(harnessUrl);
    expect(repoRoot.endsWith("Rextora") || repoRoot.includes("Rextora")).toBe(true);
  });

  it("loads project env without throwing", () => {
    const repoRoot = resolveRepoRoot(import.meta.url);
    const env = loadProjectEnv(repoRoot);
    expect(env).toBeTruthy();
    expect(typeof env.NODE_ENV === "string" || env.NODE_ENV === undefined).toBe(true);
  });
});
