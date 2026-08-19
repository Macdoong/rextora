/**
 * Input/output schemas for Agent V2 tools.
 */

import type { ToolJsonSchema } from "./toolTypes";

export const emptyObjectSchema: ToolJsonSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
};

export const jobIdInputSchema: ToolJsonSchema = {
  type: "object",
  properties: {
    jobId: { type: "string", description: "Strategy search job id" },
  },
  required: ["jobId"],
  additionalProperties: false,
};

export const strategyIdInputSchema: ToolJsonSchema = {
  type: "object",
  properties: {
    strategyId: { type: "string" },
  },
  required: ["strategyId"],
  additionalProperties: false,
};

export const runIdInputSchema: ToolJsonSchema = {
  type: "object",
  properties: {
    runId: { type: "string" },
  },
  required: ["runId"],
  additionalProperties: false,
};

export const listLimitSchema: ToolJsonSchema = {
  type: "object",
  properties: {
    limit: { type: "number" },
    offset: { type: "number" },
  },
  additionalProperties: false,
};

export const searchCreateInputSchema: ToolJsonSchema = {
  type: "object",
  properties: {
    createBody: {
      type: "object",
      description: "Canonical createStrategySearchJobApi body",
      additionalProperties: true,
    },
  },
  required: ["createBody"],
  additionalProperties: false,
};

export const backtestRunInputSchema: ToolJsonSchema = {
  type: "object",
  properties: {
    strategyId: { type: "string" },
    symbol: { type: "string" },
    timeframe: { type: "string" },
    startDate: { type: "string" },
    endDate: { type: "string" },
  },
  required: ["strategyId"],
  additionalProperties: true,
};

export const paperPrepareInputSchema: ToolJsonSchema = {
  type: "object",
  properties: {
    strategyId: { type: "string" },
    backtestRunId: { type: "string" },
    backtestResultId: { type: "string" },
    symbol: { type: "string" },
    timeframe: { type: "string" },
    sourceResearchJobId: { type: "string" },
    sourceTrialIteration: { type: "number" },
  },
  required: ["strategyId"],
  additionalProperties: false,
};

export const resultsPromoteInputSchema: ToolJsonSchema = {
  type: "object",
  properties: {
    jobId: { type: "string" },
    iteration: { type: "number" },
    limit: { type: "number" },
    mode: {
      type: "string",
      enum: ["single", "top"],
      description: "single=registerTrialForBacktest, top=promoteTopResearchResults",
    },
    idempotencyKey: { type: "string" },
  },
  required: ["jobId", "idempotencyKey"],
  additionalProperties: false,
};

export const sessionIdInputSchema: ToolJsonSchema = {
  type: "object",
  properties: {
    sessionId: { type: "string" },
  },
  additionalProperties: false,
};

export const paperControlInputSchema: ToolJsonSchema = {
  type: "object",
  properties: {
    sessionId: { type: "string" },
    strategyId: { type: "string" },
    idempotencyKey: { type: "string" },
    stopReason: { type: "string" },
  },
  required: ["sessionId", "idempotencyKey"],
  additionalProperties: false,
};

export const strategyRenameInputSchema: ToolJsonSchema = {
  type: "object",
  properties: {
    strategyId: { type: "string" },
    name: { type: "string" },
    idempotencyKey: { type: "string" },
  },
  required: ["strategyId", "name", "idempotencyKey"],
  additionalProperties: false,
};

export const strategyMutationInputSchema: ToolJsonSchema = {
  type: "object",
  properties: {
    strategyId: { type: "string" },
    idempotencyKey: { type: "string" },
  },
  required: ["strategyId", "idempotencyKey"],
  additionalProperties: false,
};

export const strategyDeleteInputSchema: ToolJsonSchema = {
  type: "object",
  properties: {
    strategyId: { type: "string" },
    detachRefsFirst: { type: "boolean" },
    idempotencyKey: { type: "string" },
  },
  required: ["strategyId", "idempotencyKey"],
  additionalProperties: false,
};

export const genericOutputSchema: ToolJsonSchema = {
  type: "object",
  additionalProperties: true,
};
