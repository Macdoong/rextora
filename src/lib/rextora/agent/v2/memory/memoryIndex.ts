import fs from "node:fs";
import path from "node:path";
import { sanitizeSessionId } from "../session/sessionPersistence";
import { agentMemoryRoot, readMemoryRecords } from "./memoryStore";
import type { MemoryIndex } from "./memoryTypes";

function indexFile(sessionId: string): string {
  return path.join(agentMemoryRoot(), `${sanitizeSessionId(sessionId)}.index.json`);
}

function terms(value: string): string[] {
  return [...new Set(value.toLocaleLowerCase("ko-KR").split(/[^\p{L}\p{N}_-]+/u).filter((term) => term.length >= 2))].slice(0, 40);
}

export function rebuildMemoryIndex(sessionId: string): MemoryIndex {
  const index: MemoryIndex = {
    version: 1,
    sessionId,
    rebuiltAt: new Date().toISOString(),
    entries: readMemoryRecords(sessionId).map((record) => ({
      memoryId: record.memoryId,
      kind: record.kind,
      statementKo: record.statementKo,
      evidenceRefs: record.evidenceRefs,
      verifiedAt: record.verifiedAt,
      terms: terms(record.statementKo),
    })),
  };
  const file = indexFile(sessionId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  return index;
}

export function searchVerifiedMemory(sessionId: string, query: string, limit = 10) {
  const wanted = terms(query);
  const entries = rebuildMemoryIndex(sessionId).entries;
  const matched = entries
    .map((entry) => ({ entry, score: wanted.filter((term) => entry.terms.includes(term)).length }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.entry.verifiedAt.localeCompare(a.entry.verifiedAt))
    .slice(0, Math.max(1, Math.min(limit, 50)))
    .map((item) => item.entry);
  if (matched.length > 0) return matched;
  return [...entries]
    .sort((a, b) => b.verifiedAt.localeCompare(a.verifiedAt))
    .slice(0, Math.max(1, Math.min(limit, 50)));
}
