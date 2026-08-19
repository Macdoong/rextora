#!/usr/bin/env node
/** Warm webpack dev routes before Development matrix. */
import { loadProjectEnv } from "./loadProjectEnv.mjs";

const root = process.cwd();
Object.assign(process.env, loadProjectEnv(root));
const base = process.env.REXTORA_DEV_BASE_URL ?? "http://127.0.0.1:3101";

const requiredPaths = ["/settings", "/api/rextora/settings/ai-providers"];
const optionalPaths = ["/dashboard"];

async function probe(path, timeoutMs = 120_000) {
  const t0 = Date.now();
  const res = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
  await res.text();
  return { path, status: res.status, ms: Date.now() - t0 };
}

async function requiredWarm() {
  try {
    const api = await probe("/api/rextora/settings/ai-providers", 5_000);
    if (api.status !== 200) return null;
    const settings = await probe("/settings", 10_000);
    if (settings.status !== 200) return null;
    return [settings, api];
  } catch {
    return null;
  }
}

async function main() {
  const warm = await requiredWarm();
  if (warm) {
    const optional = [];
    for (const path of optionalPaths) {
      try {
        optional.push(await probe(path, 15_000));
      } catch {
        optional.push({ path, status: 0, ms: 0, skipped: true });
      }
    }
    console.log(JSON.stringify({ warmed: true, skipped: true, results: [...warm, ...optional] }, null, 2));
    return;
  }

  const results = [];
  for (let round = 0; round < 60; round++) {
    try {
      results.length = 0;
      for (const path of requiredPaths) {
        results.push(await probe(path));
      }
      if (results.every((r) => r.status === 200)) break;
    } catch {
      /* dev still compiling */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!results.every((r) => r.status === 200)) {
    console.error(JSON.stringify({ warmed: false, base, results }, null, 2));
    process.exit(1);
  }
  for (const path of optionalPaths) {
    try {
      results.push(await probe(path));
    } catch {
      results.push({ path, status: 0, ms: 0, optionalFailed: true });
    }
  }
  console.log(JSON.stringify({ warmed: true, results }, null, 2));
}

await main();
