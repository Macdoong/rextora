import { describe, expect, it } from "vitest";
import {
  openaiCompletionBudget,
  openaiReasoningEffort,
  isProviderBackedReadProfile,
  providerTimeoutMs,
  resolveReasoningTaskProfile,
} from "@/src/lib/rextora/agent/v2/reasoning/reasoningTaskProfile";
import {
  openaiMaxOutputParam,
  openaiReasoningEffortParam,
  openaiTemperatureParam,
} from "@/src/lib/rextora/agent/v2/providers/openaiRequestParams";

describe("Reasoning task profiles for gpt-5-mini", () => {
  it("allocates higher completion budget for READ_AND_ANSWER", () => {
    expect(
      openaiCompletionBudget("DIRECT_ANSWER", { model: "gpt-5-mini" }),
    ).toBeGreaterThan(openaiCompletionBudget("DIRECT_ANSWER", { model: "gpt-4o-mini" }));
    expect(openaiCompletionBudget("READ_AND_ANSWER_SIMPLE")).toBeLessThan(
      openaiCompletionBudget("READ_AND_ANSWER_COMPLEX"),
    );
  });

  it("uses max_completion_tokens and reasoning_effort for gpt-5-mini", () => {
    expect(openaiMaxOutputParam("gpt-5-mini", 3500)).toEqual({
      max_completion_tokens: 3500,
    });
    expect(openaiTemperatureParam("gpt-5-mini", 0.2)).toEqual({});
    expect(openaiReasoningEffortParam("gpt-5-mini", "low")).toEqual({
      reasoning_effort: "low",
    });
  });

  it("resolves READ_AND_ANSWER profile from fact volume", () => {
    expect(
      resolveReasoningTaskProfile({
        conversationMode: "READ_AND_ANSWER",
        factCount: 4,
        readToolCount: 1,
      }),
    ).toBe("READ_AND_ANSWER_SIMPLE");
    expect(
      resolveReasoningTaskProfile({
        conversationMode: "READ_AND_ANSWER",
        factCount: 14,
        readToolCount: 1,
      }),
    ).toBe("READ_AND_ANSWER_COMPLEX");
  });

  it("extends timeout for gpt-5 READ_AND_ANSWER", () => {
    expect(
      providerTimeoutMs("READ_AND_ANSWER_SIMPLE", "openai", "gpt-5-mini"),
    ).toBeGreaterThan(
      providerTimeoutMs("DIRECT_ANSWER", "openai", "gpt-4o-mini"),
    );
    expect(openaiReasoningEffort("READ_AND_ANSWER_COMPLEX")).toBe("medium");
  });

  it("marks READ_AND_ANSWER profiles as provider-backed reads", () => {
    expect(isProviderBackedReadProfile("READ_AND_ANSWER_SIMPLE")).toBe(true);
    expect(isProviderBackedReadProfile("DIRECT_ANSWER")).toBe(false);
  });
});
