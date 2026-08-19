import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export function probe(): string {
  const root = (NextResponse as unknown as { runtimeRoot(): string }).runtimeRoot();
  return fs.readFileSync(path.join(root, "state.json"), "utf8");
}
