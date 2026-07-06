# Rextora Development Roadmap

**Project path:** `D:\Rextora`

This document defines a documentation-only development roadmap based on the current confirmed Rextora state. It does not enable live trading or change runtime behavior.

**Current status:** Pre-live verification and integration complete. **Live trading is not enabled yet.**

---

## Safe Foundation (Preserve Throughout All Phases)

The following are confirmed and must remain intact unless CEO approval is granted with a documented replacement plan:

| Capability | Status |
|------------|--------|
| UI (Next.js App Router) | Implemented |
| PAPER trading simulation | Implemented (default mode) |
| Safety gates | Implemented |
| Binance read-only integration | Implemented (env-dependent) |
| Telegram test path | Implemented (env-dependent) |
| Verification script | `scripts/verify-rextora.mjs` |
| E2E smoke test | `tests/e2e/rextora-smoke.spec.ts` |
| Preserved baseline strategy | `SAFE_v44_i4060` / `params_hash: 7893ca3f0e30` |

Core safety modules to keep: `safety.ts`, `paperTradingEngine.ts`, `binanceReadOnlyService.ts`, `orderManager.ts`, `tpSlManager.ts`, `apiStatusService.ts`.

See also: [REXTORA_TARGET_SCOPE.md](./REXTORA_TARGET_SCOPE.md), [REXTORA_MODULE_CLASSIFICATION.md](./REXTORA_MODULE_CLASSIFICATION.md).

**Note:** Actions marked CEO approval required are not permanently forbidden. They require explicit CEO approval before execution.

---

## Phase 1: Structure Stabilization

### Goal

Align documentation, routes, and module boundaries so the current pre-live foundation is clearly understood and consistently labeled.

### What to keep

- All Keep modules from [REXTORA_MODULE_CLASSIFICATION.md](./REXTORA_MODULE_CLASSIFICATION.md)
- Existing route structure under `app/`
- PAPER as default mode
- LIVE blocked by default
- `REXTORA_LIVE_APPROVED=false` in `.env.example`

### What to build

- Documentation alignment across `README.md`, `docs/*`, and module classification
- Route inventory confirmation for all primary pages and API routes
- Clear labels for mock, simulated, read-only, paper, and live-blocked states in docs
- Removal or relabeling of misleading placeholder wording in documentation only

### What not to touch yet

- `liveTradingEngine.ts` implementation
- Production order execution
- Server-side TP/SL production implementation
- Exchange write-side endpoints
- Live trading mode transition

### CEO approval required

- Source code modification (beyond approved doc-only tasks)
- File deletion
- npm command execution
- Server execution

### Completion criteria

- All docs describe the same current phase and approval boundary
- All primary routes documented and confirmed
- Safety modules listed and classified
- Mock/PAPER boundaries clearly labeled in documentation
- No documentation implies live trading is enabled

---

## Phase 2: Real Analysis Foundation

### Goal

Design the analysis pipeline that will eventually replace preserved snapshot data, without enabling live trading.

### What to keep

- `data/strategies/SAFE_v44_i4060.json` and hash validation
- `backtestEngine.ts` snapshot mode until real engine is ready
- `strategyDiscoveryEngine.ts` mock mode until real pipeline is ready
- Safety gates and strategy eligibility rules

### What to build

- Real backtest engine design (backend integration plan)
- Strategy validation pipeline design (recent_3m, prev_3m, full_10m, cost stress, jitter)
- Market data ingestion design (read-only first)
- Trade journal structure (PAPER and analysis logs)
- Risk scoring model design

### What not to touch yet

- Live order execution
- Exchange write-side integration
- Server-side TP/SL production orders
- LIVE mode enablement

### CEO approval required

- Source code modification for new analysis backends
- npm command execution for integration testing
- API key changes (if expanded beyond read-only scope)

### Completion criteria

- Design documents exist for backtest, validation, market data, trade journal, and risk scoring
- Preserved snapshot remains fallback until real engine is connected
- No live trading paths introduced
- Strategy eligibility rules unchanged

---

## Phase 3: Monitoring and Alerting

### Goal

Improve condition monitoring, alert delivery, and briefing formats while keeping all trading actions in PAPER or mock mode.

### What to keep

- `alertRuleEngine.ts` and `aiBriefingService.ts` as starting points
- `telegramService.ts` test path only (no live execution messages)
- Safety gates and emergency action logging

### What to build

- Multi-coin watchlist design
- Condition-based alert rule schema (RSI, EMA, volume, pattern, multi-condition)
- Telegram briefing format specification
- Risk alert format specification
- Daily summary format specification

### What not to touch yet

- Live entry/exit Telegram messages
- Real order triggers from alerts
- LIVE mode transition
- Exchange write-side integration

### CEO approval required

- Source code modification for alert delivery expansion
- API key changes for Telegram or exchange APIs
- Server execution for scheduled alert jobs

### Completion criteria

- Alert and briefing formats documented
- Watchlist and rule schema defined
- Telegram remains test-ready or mock only
- Alerts do not trigger live orders
- Disclaimer preserved: no investment advice, no profit guarantees

---

## Phase 4: PAPER Operating System

### Goal

Make PAPER mode a reliable daily operating environment for strategy review and simulated trading workflows.

### What to keep

- `paperTradingEngine.ts` as the primary trading engine
- `orderManager.ts` PAPER simulation paths
- `localStore.ts` for persisted settings and emergency logs
- Default mode: PAPER

### What to build

- PAPER bot lifecycle improvements (start/stop/restart, state persistence)
- PAPER order and position tracking (clear paper/mock labels)
- PAPER TP/SL simulation (not exchange-side)
- Strategy performance logs for PAPER runs
- Review dashboard for PAPER session history

### What not to touch yet

- Live trading engine implementation
- Real Binance order placement
- Server-side TP/SL production orders
- Leverage or position changes on real exchange

### CEO approval required

- Source code modification
- npm command execution
- Loss limit changes (if changing default risk settings in production use)

### Completion criteria

- PAPER bot lifecycle documented and testable
- All PAPER orders labeled paper/mock
- PAPER TP/SL clearly marked as simulated
- Performance logs available for review
- LIVE remains blocked

---

## Phase 5: Pre-Live Readiness

### Goal

Complete design, audit, and approval gates required before any live code work begins. No live order implementation in this phase.

### What to keep

- All safety modules and verification script
- `docs/REXTORA_SERVER_TPSL_DESIGN.md`
- `docs/REXTORA_LIVE_ORDER_READINESS_REVIEW.md`
- `tpSlManager.ts` design-only gate (`designOnly: true`, `liveImplementationReady: false`)

### What to build

- Server-side TP/SL production design (finalized, audited)
- Exchange write-side interface design (order, position, cancel, reconcile)
- API permission audit checklist
- Emergency stop design (kill switch, recovery, audit log)
- Manual approval gates (CEO sign-off workflow)

### What not to touch yet

- Real live order execution code
- `REXTORA_LIVE_APPROVED=true` without CEO approval
- Exchange account changes, leverage changes, position changes

### CEO approval required

- All Phase 5 design reviews that precede live code work
- API key permission changes (order permission)
- Account changes
- Any transition toward live trading mode

### Completion criteria

- Server TP/SL design complete and reviewed
- Write-side interface design complete
- API permission audit checklist complete
- Emergency stop design complete
- Manual approval gates documented
- Live order execution still not implemented

---

## Phase 6: Live Trading Preparation

### Goal

Define the checklist and approval process required before any live code work. **This phase does not implement live orders.**

### What to keep

- Entire safe foundation from Phase 1
- All safety gates and verification script
- PAPER as default until explicit CEO-approved transition

### What to build

- Pre-live code work checklist (see below)
- Testnet phase plan
- Minimum-size live phase plan
- Kill switch and recovery procedures
- Audit logging requirements

### What not to touch yet (until checklist complete and CEO approval granted)

- Live order implementation
- Real futures position open/close
- Real TP/SL order submission
- Leverage or margin mode changes on live account
- Setting `REXTORA_LIVE_APPROVED=true`

### CEO approval required

- **All items in this phase require CEO approval before any live code work:**
  - Live order execution
  - Live trading mode transition
  - API key changes (order permission)
  - Account changes
  - Withdrawal
  - Leverage changes
  - Position changes
  - Loss limit changes
  - Source code modification for live engine
  - Server execution on production infrastructure

### Required checklist before any live code work

1. Phases 1–5 completion criteria met
2. Server-side TP/SL production design audited and approved
3. Exchange write-side interface design audited and approved
4. API permission audit completed (read, futures, order, IP restriction)
5. Emergency stop and kill switch design approved
6. Testnet phase plan approved
7. Minimum-size live phase plan approved
8. Audit logging requirements defined
9. Manual CEO sign-off recorded
10. `REXTORA_LIVE_APPROVED=true` set only after explicit CEO approval

### Completion criteria

- Checklist documented and reviewed
- No live order code implemented in this roadmap document
- Live trading remains blocked until checklist complete and CEO approval granted

---

## Phase Overview

| Phase | Focus | Live trading |
|-------|-------|--------------|
| 1 | Structure stabilization | Blocked |
| 2 | Real analysis foundation | Blocked |
| 3 | Monitoring and alerting | Blocked |
| 4 | PAPER operating system | Blocked |
| 5 | Pre-live readiness (design) | Blocked |
| 6 | Live preparation (checklist only) | CEO approval required |

---

## Immediate Next Recommended Task

**Do not start live trading.**

1. **Verify current state first**
   - Confirm all primary routes load (`/dashboard` through `/settings`)
   - Confirm Keep modules exist and are classified correctly
   - Confirm safety gates block LIVE by default
   - Confirm `SAFE_v44_i4060` exists with `params_hash: 7893ca3f0e30`
   - Run verification script when CEO approval allows: `npm run verify:rextora`

2. **Then improve PAPER and monitoring**
   - Strengthen PAPER bot lifecycle and logging (Phase 4)
   - Improve alert and briefing formats (Phase 3)
   - Align documentation (Phase 1)

3. **Defer all live work**
   - No live order implementation until Phase 6 checklist complete and CEO approval granted
   - No exchange write-side integration until Phase 5 design complete

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| [README.md](../README.md) | Project overview |
| [REXTORA_TARGET_SCOPE.md](./REXTORA_TARGET_SCOPE.md) | Current scope and approval boundary |
| [REXTORA_MODULE_CLASSIFICATION.md](./REXTORA_MODULE_CLASSIFICATION.md) | Keep / Review / Rebuild / CEO approval |
| [REXTORA_PRE_LIVE_CHECKLIST.md](./REXTORA_PRE_LIVE_CHECKLIST.md) | Pre-live implementation status |
| [REXTORA_SERVER_TPSL_DESIGN.md](./REXTORA_SERVER_TPSL_DESIGN.md) | Server TP/SL design |
| [REXTORA_LIVE_ORDER_READINESS_REVIEW.md](./REXTORA_LIVE_ORDER_READINESS_REVIEW.md) | Live order readiness review |

---

## Disclaimer

Rextora does not guarantee profit or returns. All investment decisions are the sole responsibility of the owner.

*This is not investment advice. The user is solely responsible for all investment decisions.*
