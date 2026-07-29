import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const readAgent = (name: string) =>
  fs.readFileSync(
    path.join(process.cwd(), "components/rextora/agent", name),
    "utf8",
  );

describe("Dashboard AI Agent commercial UX", () => {
  it("separates verified facts, interpretation, evidence links, and retry", () => {
    const message = readAgent("AgentMessage.tsx");
    expect(message).toContain("검증된 사실");
    expect(message).toContain("AI 해석");
    expect(message).toContain("권장 다음 작업");
    expect(message).toContain("분석 범위");
    expect(message).toContain("SOURCE_LINKS");
    expect(message).toContain("다시 시도");
    expect(message).toContain('aria-label="개발자 상세"');
  });

  it("supports send, stop, disabled reasons, and empty-session suggestions", () => {
    const panel = readAgent("AgentPanel.tsx");
    const input = readAgent("AgentInput.tsx");
    expect(panel).toContain("AI 트레이딩 연구원");
    expect(panel).toContain("읽기 전용");
    expect(panel).toContain("stopResponse");
    expect(panel).toContain("turns.length === 0");
    expect(input).toContain('e.key === "Enter" && !e.shiftKey');
    expect(input).toContain('aria-label={disabled ? "응답 중지" : "전송"}');
    expect(input).toContain("agent-input-disabled-reason");
  });
});
