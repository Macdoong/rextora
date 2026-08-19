import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const readAgent = (name: string) =>
  fs.readFileSync(
    path.join(process.cwd(), "components/rextora/agent", name),
    "utf8",
  );

describe("Dashboard AI Agent commercial UX", () => {
  it("uses conversational-first hierarchy with collapsed evidence", () => {
    const message = readAgent("AgentMessage.tsx");
    expect(message).toContain("agent-conversational-answer");
    expect(message).toContain("근거 자세히 보기");
    expect(message).toContain("agent-evidence-toggle");
    expect(message).toContain("다시 시도");
    expect(message).toContain("SOURCE_LINKS");
    expect(message).toContain("agent-safety-banner");
  });

  it("supports send, stop, disabled reasons, and empty-session suggestions", () => {
    const panel = readAgent("AgentPanel.tsx");
    const input = readAgent("AgentInput.tsx");
    expect(panel).toContain("AI 트레이딩 직원");
    expect(panel).toContain("ApprovalCenter");
    expect(panel).toContain("agent-details-toggle");
    expect(panel).toContain("stopResponse");
    expect(panel).toContain("turns.length === 0");
    expect(panel).toContain('sendQuery("진행해")');
    expect(input).toContain('e.key === "Enter" && !e.shiftKey');
    expect(input).toContain('aria-label={disabled ? "응답 중지" : "전송"}');
    expect(input).toContain("agent-input-disabled-reason");
  });
});
