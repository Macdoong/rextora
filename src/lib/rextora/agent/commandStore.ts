/**
 * Persist typed agent commands for idempotency and audit.
 * Files under data/rextora/agent-commands/ — never Live / exchange.
 */

import fs from "node:fs";

import path from "node:path";
import type { TypedCommand } from "./typedCommand";

function commandsRoot(): string {
  const override = process.env.REXTORA_AGENT_COMMANDS_DIR;
  if (override && override.trim()) return path.resolve(override);
  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "data",
    "rextora",
    "agent-commands",
  );
}

function ensureDir(): void {
  fs.mkdirSync(commandsRoot(), { recursive: true });
}

function fileFor(commandId: string): string {
  return path.join(commandsRoot(), `${commandId}.json`);
}

export function saveCommand(command: TypedCommand): TypedCommand {
  ensureDir();
  fs.writeFileSync(fileFor(command.commandId), JSON.stringify(command, null, 2));
  return command;
}

export function getCommand(commandId: string): TypedCommand | null {
  try {
    const raw = fs.readFileSync(fileFor(commandId), "utf8");
    return JSON.parse(raw) as TypedCommand;
  } catch {
    return null;
  }
}

export function findByIdempotencyKey(
  idempotencyKey: string,
): TypedCommand | null {
  ensureDir();
  const root = commandsRoot();
  const files = fs.readdirSync(root).filter((f) => f.endsWith(".json"));
  let best: TypedCommand | null = null;
  for (const file of files) {
    try {
      const cmd = JSON.parse(
        fs.readFileSync(path.join(root, file), "utf8"),
      ) as TypedCommand;
      if (cmd.idempotencyKey !== idempotencyKey) continue;
      if (
        cmd.executionStatus === "succeeded" ||
        cmd.executionStatus === "skipped_idempotent"
      ) {
        return cmd;
      }
      if (
        !best ||
        Date.parse(cmd.createdAt) > Date.parse(best.createdAt)
      ) {
        best = cmd;
      }
    } catch {
      // skip corrupt
    }
  }
  return best;
}
