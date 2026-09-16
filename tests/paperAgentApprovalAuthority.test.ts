import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getPaperSession } from "../src/lib/rextora/paper/paperSessionStore";
import { productionPaperSessionsRoot } from "./helpers/productionResearchBaseline";

const VERIFY_ID = "paper_e1dab933-f951-4e07-acbe-c09c2d993b09";

describe("Paper/Agent approval authority", () => {
  it("VERIFY_PAPER2 production session remains paper-only without retroactive SAFE ledger attach", () => {
    const session = getPaperSession(VERIFY_ID, {
      rootDir: productionPaperSessionsRoot(),
    });
    expect(session).not.toBeNull();
    expect(session?.strategyName).toBe("VERIFY_PAPER2_1785644402829");
    expect(session?.exchangeCalled).toBe(false);
    expect(session?.mode).toBe("paper");
    expect(session?.realizedPnl).toBe(0);
    expect(session?.tradeCount).toBe(0);
    expect(session?.virtualBalance).toBe(10000);
    expect(["active", "risk_halted", "paused", "stopped"]).toContain(
      session?.status,
    );
  });

  it("Agent paper.status and Paper page both read session.status", () => {
    const agent = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/agent/v2/tools/readHandlers.ts"),
      "utf8",
    );
    const paper = fs.readFileSync(
      path.join(process.cwd(), "app/paper-trading/page.tsx"),
      "utf8",
    );
    const presentation = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/lib/rextora/paper/paperOperatorPresentation.ts",
      ),
      "utf8",
    );
    const service = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/paper/paperSessionService.ts"),
      "utf8",
    );
    expect(service).toContain("getCurrentPaperSession");
    expect(agent).toContain("activeStatus: active?.status");
    expect(agent).toContain("status: session.status");
    expect(paper).toContain("session.status === \"pending_approval\"");
    expect(paper).toContain("paperOperatorStatusLabel");
    expect(presentation).toContain('case "pending_approval"');
    expect(presentation).toContain('return "승인 대기"');
  });
});
