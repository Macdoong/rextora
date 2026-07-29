import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Backtest state restoration wiring", () => {
  it("syncs tradeId into URL and sessionStorage", () => {
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/backtest/BacktestReviewWorkbench.tsx",
      ),
      "utf8",
    );
    expect(src).toContain('url.searchParams.set("tradeId"');
    expect(src).toContain("rextora.backtest.viewState");
    expect(src).toContain("readPersistedBacktestViewState");
    expect(src).toContain("sessionStorage.getItem");
    expect(src).toContain("initialSelectedTradeId");
    expect(src).toContain("onSelectedTradeChange");
  });

  it("AnalysisView accepts initialSelectedTradeId", () => {
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/charts/BacktestAnalysisView.tsx",
      ),
      "utf8",
    );
    expect(src).toContain("initialSelectedTradeId");
    expect(src).toContain("onSelectedTradeChange");
  });

  it("exposes trade workspace split layout contract", () => {
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/charts/BacktestAnalysisView.tsx",
      ),
      "utf8",
    );
    expect(src).toContain("backtest-trade-workspace");
    expect(src).toContain("selected-trade-inspector");
    expect(src).toContain("trade-inspector-timeline");
    expect(src).toContain('"번호"');
  });
});

describe("Strategy library archive and run management", () => {
  it("supports library archive tag and API actions", () => {
    const archive = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/strategy/libraryArchive.ts"),
      "utf8",
    );
    const route = fs.readFileSync(
      path.join(process.cwd(), "app/api/rextora/strategies/route.ts"),
      "utf8",
    );
    const results = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/results/ResultsWorkbench.tsx",
      ),
      "utf8",
    );
    expect(archive).toContain("export function applyLibraryArchiveTag");
    expect(route).toContain("library_archive");
    expect(route).toContain("library_restore");
    expect(results).toContain("library-related-runs-");
    expect(results).toContain("deleteRelatedRun");
  });
});

describe("Backtest run deletion API", () => {
  it("exposes deleteSavedBacktest and DELETE handler", () => {
    const store = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/lib/rextora/backtest/backtestStore.ts",
      ),
      "utf8",
    );
    const route = fs.readFileSync(
      path.join(process.cwd(), "app/api/rextora/backtest/run/route.ts"),
      "utf8",
    );
    expect(store).toContain("export function deleteSavedBacktest");
    expect(route).toContain("export async function DELETE");
    expect(route).toContain("deleteSavedBacktest");
  });
});
