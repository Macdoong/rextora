import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultOperatorFormState } from "@/components/rextora/strategySearch/formDefaults";
import { buildAppliedSettingsPreview } from "@/components/rextora/strategySearch/formValidation";

describe("strategy search advanced settings helpers", () => {
  it("default form includes error threshold fields", () => {
    const form = createDefaultOperatorFormState();
    expect(form.errorWarningRate).toBe("0.35");
    expect(form.errorAutoPauseRate).toBe("0.55");
    expect(form.repeatedSignatureThreshold).toBe("25");
  });

  it("applied settings preview shows operator labels", () => {
    const form = createDefaultOperatorFormState();
    form.candidateBudgetOverride = "120";
    const { rows, detailRows, summary } = buildAppliedSettingsPreview(form);
    expect(summary.labelKo).toBe("정상");
    expect(rows.some((r) => r.labelKo === "합격 목표")).toBe(true);
    expect(rows.some((r) => r.labelKo === "탐색 프리셋")).toBe(true);
    expect(detailRows.some((r) => r.labelKo === "세대당 생성 수")).toBe(true);
    expect(detailRows.some((r) => r.labelKo === "초기 평가 묶음")).toBe(true);
    expect(detailRows.some((r) => r.labelKo === "초기 평가 묶음(재정의)")).toBe(true);
    expect(detailRows.some((r) => r.labelKo === "연구 시간")).toBe(true);
    expect(detailRows.some((r) => r.labelKo === "장기 저장 결과")).toBe(true);
    expect(rows.some((r) => r.labelKo === "전체 평가 수")).toBe(false);
  });
});

describe("searchConfigStore", () => {
  const originalCwd = process.cwd();
  let tmpDir = "";

  afterEach(() => {
    process.chdir(originalCwd);
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    vi.resetModules();
  });

  it("saves and loads named operator configs", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-ss-config-"));
    process.chdir(tmpDir);
    const {
      listStrategySearchConfigs,
      loadStrategySearchConfig,
      saveStrategySearchConfig,
      deleteStrategySearchConfig,
    } = await import("@/src/lib/rextora/strategySearch/searchConfigStore");
    const form = createDefaultOperatorFormState();
    saveStrategySearchConfig("btc-standard", form);
    expect(listStrategySearchConfigs().map((c) => c.name)).toContain(
      "btc-standard",
    );
    const loaded = loadStrategySearchConfig("btc-standard");
    expect(loaded?.form.timeframe).toBe(form.timeframe);
    expect(deleteStrategySearchConfig("btc-standard")).toBe(true);
    expect(loadStrategySearchConfig("btc-standard")).toBeNull();
  });
});
