import crypto from "node:crypto";
import fs from "node:fs";

import path from "node:path";
import { rextoraDataRoot } from "@/src/lib/rextora/storage/runtimePaths";

interface ToolIdempotencyReceipt {
  toolId: string;
  sessionId: string | null;
  idempotencyKeyHash: string;
  inputHash: string;
  completedAt: string;
  data: unknown;
}

function root(): string {
  const override = process.env.REXTORA_AGENT_TOOL_IDEMPOTENCY_DIR?.trim();
  return override
    ? path.resolve(override)
    : path.join(rextoraDataRoot(), "agent-tool-idempotency");
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function digest(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function receiptPath(toolId: string, sessionId: string | null, idempotencyKey: string): string {
  const scope = digest(`${sessionId ?? "global"}:${toolId}:${idempotencyKey}`);
  return path.join(root(), `${scope}.json`);
}

export function readToolIdempotency(input: {
  toolId: string;
  sessionId: string | null;
  idempotencyKey: string;
  arguments: Record<string, unknown>;
}): { hit: false } | { hit: true; data: unknown } {
  const file = receiptPath(input.toolId, input.sessionId, input.idempotencyKey);
  if (!fs.existsSync(file)) return { hit: false };
  const receipt = JSON.parse(fs.readFileSync(file, "utf8")) as ToolIdempotencyReceipt;
  const inputHash = digest(stable(input.arguments));
  if (receipt.inputHash !== inputHash) throw new Error("IDEMPOTENCY_KEY_CONFLICT");
  return { hit: true, data: receipt.data };
}

export function writeToolIdempotency(input: {
  toolId: string;
  sessionId: string | null;
  idempotencyKey: string;
  arguments: Record<string, unknown>;
  data: unknown;
}): void {
  const directory = root();
  fs.mkdirSync(directory, { recursive: true });
  const file = receiptPath(input.toolId, input.sessionId, input.idempotencyKey);
  if (fs.existsSync(file)) return;
  const receipt: ToolIdempotencyReceipt = {
    toolId: input.toolId,
    sessionId: input.sessionId,
    idempotencyKeyHash: digest(input.idempotencyKey),
    inputHash: digest(stable(input.arguments)),
    completedAt: new Date().toISOString(),
    data: input.data,
  };
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(receipt), { encoding: "utf8", mode: 0o600 });
  try {
    fs.renameSync(temporary, file);
  } catch (error) {
    if (fs.existsSync(file)) fs.unlinkSync(temporary);
    else throw error;
  }
}
