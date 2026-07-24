import fs from "node:fs";
import crypto from "node:crypto";

const safePath = "data/strategies/SAFE_v44_i4060.json";
const st = fs.statSync(safePath);
const buf = fs.readFileSync(safePath);
const sha = crypto.createHash("sha256").update(buf).digest("hex").toUpperCase();
const raw = buf.toString("utf8");
const m = raw.match(/"params_hash"\s*:\s*"([^"]+)"/);
const after = {
  bytes: st.size,
  hash: m?.[1] ?? null,
  sha,
  mtimeUtc: st.mtime.toISOString(),
};

async function tryApi(url, body) {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return await r.json();
  } catch (e) {
    return { error: String(e) };
  }
}

const base = process.env.REXTORA_BASE ?? "http://localhost:3001";
const upd = await tryApi(`${base}/api/rextora/strategies`, {
  action: "update",
  id: "SAFE_v44_i4060",
  name: "hack",
});
const del = await tryApi(`${base}/api/rextora/strategies`, {
  action: "delete",
  strategyId: "SAFE_v44_i4060",
});

console.log(
  JSON.stringify(
    {
      after,
      updateRejection: upd,
      deleteRejection: del,
    },
    null,
    2,
  ),
);
