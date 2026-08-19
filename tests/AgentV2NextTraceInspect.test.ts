import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

describe("next trace inspection script", () => {
  it("reports traced tmp/screenshots/env and fails on secret traces", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-trace-"));
    const nextDir = path.join(root, ".next", "server");
    fs.mkdirSync(nextDir, { recursive: true });
    fs.writeFileSync(
      path.join(nextDir, "page.js.nft.json"),
      JSON.stringify({
        files: [
          "../../../../tmp/agent-v2-final-verification/report.json",
          "../../../../tmp/agent-employee-screens/agent-1440.png",
          "../../../../.env.local",
        ],
      }),
    );

    const outPath = path.join(root, "trace.json");
    const result = spawnSync(
      process.execPath,
      [
        path.join(process.cwd(), "scripts", "inspect-next-trace.mjs"),
        `--out=${outPath}`,
      ],
      {
        cwd: root,
        encoding: "utf8",
      },
    );

    expect(fs.existsSync(outPath)).toBe(true);
    const report = JSON.parse(fs.readFileSync(outPath, "utf8"));
    expect(report.traced.tmp).toBeGreaterThan(0);
    expect(report.traced.screenshots).toBeGreaterThan(0);
    expect(report.traced.envFiles).toBeGreaterThan(0);
    expect(report.secretTraceFailure).toBe(true);
    expect(result.status).toBe(1);
  });
});
