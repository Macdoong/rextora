import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  runAndRecordCommand,
  deriveGateVerdict,
  writeGateEvidence,
} = require("../scripts/commandEvidence.mjs");

describe("command evidence writer", () => {
  it("preserves raw logs and exit codes; missing evidence is NOT VERIFIED", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-gate-"));
    const stdoutLogPath = path.join(root, "stdout.log");
    const stderrLogPath = path.join(root, "stderr.log");
    const gatesPath = path.join(root, "gates.json");

    const ok = runAndRecordCommand({
      command: process.execPath,
      args: ["-e", "console.log('ok')"],
      cwd: process.cwd(),
      stdoutLogPath,
      stderrLogPath,
    });
    expect(ok.exitCode).toBe(0);
    expect(ok.evidenceComplete).toBe(true);
    expect(fs.existsSync(stdoutLogPath)).toBe(true);
    expect(fs.readFileSync(stdoutLogPath, "utf8")).toContain("ok");

    const missing = runAndRecordCommand({
      command: process.execPath,
      args: ["-e", "console.log('x')"],
      cwd: process.cwd(),
    });
    expect(missing.exitCode).toBeNull();
    expect(missing.evidenceComplete).toBe(false);
    expect(missing.pass).toBe(false);

    const verdictMissing = deriveGateVerdict([missing]);
    expect(verdictMissing.verdict).toBe("NOT VERIFIED");

    const verdictOk = deriveGateVerdict([ok]);
    expect(verdictOk.pass).toBe(true);

    writeGateEvidence(gatesPath, { gates: [ok], verdict: verdictOk });
    expect(fs.existsSync(gatesPath)).toBe(true);
  });
});
