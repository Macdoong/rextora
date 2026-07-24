const base = process.env.REXTORA_BASE ?? "http://localhost:3001";

async function post(body) {
  const r = await fetch(`${base}/api/rextora/strategies`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}

const upd = await post({
  action: "save",
  id: "SAFE_v44_i4060",
  patch: { name: "hacked" },
});
const del = await post({
  action: "delete",
  id: "SAFE_v44_i4060",
});
console.log(JSON.stringify({ upd, del }, null, 2));
