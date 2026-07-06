# Rextora Module Classification

**Project path:** `D:\Rextora`

This document classifies current Rextora modules and actions by maintenance priority and approval requirements. It is documentation only and does not change runtime behavior.

---

## Keep

These modules form the current safety boundary and pre-live foundation. Preserve them unless CEO approval is granted with a documented replacement plan.

| Module | Path | Role |
|--------|------|------|
| Safety gates | `src/lib/rextora/safety.ts` | LIVE/PAPER/BACKTEST eligibility checks |
| PAPER engine | `src/lib/rextora/paperTradingEngine.ts` | Simulated bot, orders, positions |
| Binance read-only | `src/lib/rextora/binanceReadOnlyService.ts` | Read-only exchange data |
| Order manager | `src/lib/rextora/orderManager.ts` | Mode-separated close/cancel/emergency actions |
| TP/SL manager | `src/lib/rextora/tpSlManager.ts` | TP/SL status and pre-live readiness gate |
| API status | `src/lib/rextora/apiStatusService.ts` | Permission and engine connection status |
| Verification script | `scripts/verify-rextora.mjs` | Automated safety and route checks |
| E2E smoke test | `tests/e2e/rextora-smoke.spec.ts` | Browser-level route and safety UI checks |
| Preserved strategy | `data/strategies/SAFE_v44_i4060.json` | Baseline strategy (`params_hash: 7893ca3f0e30`) |

---

## Review

These areas are useful but should be reviewed before any live phase. They may contain mock data, env-dependent behavior, or documentation that needs periodic alignment with the codebase.

| Area | Path | Notes |
|------|------|-------|
| Project overview | `README.md` | Keep aligned with current phase and approval boundary |
| Documentation | `docs/*` | Scope, checklists, and readiness docs |
| Binance API routes | `app/api/binance/*` | Read-only routes; verify env handling and error responses |
| Telegram test route | `app/api/telegram/test/route.ts` | Test message only; no live execution messages |
| Telegram service | `src/lib/rextora/telegramService.ts` | Mock/configured status; test path only |
| Seed data | `src/lib/rextora/seedData.ts` | Centralized mock and preserved snapshot data |
| AI briefing | `src/lib/rextora/aiBriefingService.ts` | Mock briefing output |
| Alert rules | `src/lib/rextora/alertRuleEngine.ts` | Mock alert evaluation and rule management |

---

## Rebuild later

These areas are placeholders, design-only, or not production-ready. Rebuild and audit before any live trading phase.

| Area | Path / Scope | Current status |
|------|--------------|----------------|
| Live trading engine | `src/lib/rextora/liveTradingEngine.ts` | Interface only; always rejects |
| Production live order execution | Not implemented | Blocked by design |
| Server-side TP/SL production | `src/lib/rextora/tpSlManager.ts` (live path) | Design only; not production-ready |
| Real backtest engine | `src/lib/rextora/backtestEngine.ts` | Preserved snapshot; not live-computed |
| Strategy discovery engine | `src/lib/rextora/strategyDiscoveryEngine.ts` | Mock generation |
| Real exchange write-side integration | Order, position, leverage, margin endpoints | Not implemented |

---

## CEO approval required

These actions are not permanently forbidden. They require explicit CEO approval before execution.

| Action | Reason |
|--------|--------|
| File deletion | May remove safety artifacts or audit history |
| Source code modification | May alter safety behavior |
| npm command execution | May install, build, or test against live systems |
| Server execution | May activate runtime behavior on live infrastructure |
| API key changes | Credential and access risk |
| Account changes | Exchange account exposure |
| Withdrawal | Direct financial risk |
| Leverage changes | Risk profile change |
| Position changes | Direct financial exposure |
| Loss limit changes | Risk tolerance change |
| Live order execution | Direct financial risk |
| Live trading mode transition | Removes default PAPER-safe operating mode |

**Note:** These actions are not permanently forbidden. They require explicit CEO approval before execution.

---

## Quick reference

| Classification | Count (listed items) | Intent |
|----------------|----------------------|--------|
| Keep | 9 | Preserve safety boundary |
| Review | 8 | Periodic alignment and audit |
| Rebuild later | 6 | Not ready for live phase |
| CEO approval required | 12 | Explicit approval before action |

---

## Related documentation

- [REXTORA_TARGET_SCOPE.md](./REXTORA_TARGET_SCOPE.md)
- [REXTORA_PRE_LIVE_CHECKLIST.md](./REXTORA_PRE_LIVE_CHECKLIST.md)
- [REXTORA_SERVER_TPSL_DESIGN.md](./REXTORA_SERVER_TPSL_DESIGN.md)
- [REXTORA_LIVE_ORDER_READINESS_REVIEW.md](./REXTORA_LIVE_ORDER_READINESS_REVIEW.md)
