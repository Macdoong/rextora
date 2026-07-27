import fs from "node:fs";

function audit(mode: string, runId: string) {
  const raw = fs.readFileSync(`data/rextora/backtests/${runId}.json`, "utf8");
  const r = JSON.parse(raw) as { report: Record<string, unknown> };
  const rep = r.report;
  const matches = [...raw.matchAll(/"leverage":\s*([0-9.]+)/g)].map((m) => +m[1]);
  const levs = matches.length ? matches : [];
  console.log(
    JSON.stringify(
      {
        mode,
        runId,
        strategyId: rep.strategyId,
        tradeCount: rep.tradeCount,
        levCount: levs.length,
        levMin: levs.length ? Math.min(...levs) : null,
        levMax: levs.length ? Math.max(...levs) : null,
        all3: levs.length ? levs.every((l) => Math.abs(l - 3) < 0.001) : null,
        all1: levs.length ? levs.every((l) => Math.abs(l - 1) < 0.001) : null,
        inRange24: levs.length ? levs.every((l) => l >= 2 && l <= 4) : null,
      },
      null,
      2,
    ),
  );
}

audit("auto", "bt_ms37lx5e_f7eb18");
audit("fixed", "bt_ms37lqjk_d45471");
audit("range", "bt_ms37lsla_333ff5");
audit("disabled", "bt_ms37luu1_f150ab");
