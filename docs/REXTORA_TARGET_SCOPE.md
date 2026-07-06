# Rextora Target Scope

This document defines the confirmed current state, preserved modules, future review areas, and the strict approval boundary for the Rextora project.

**Project path:** `D:\Rextora`

**Current phase:** Pre-live verification and integration complete. Real live order execution is intentionally blocked.

---

## 1. Confirmed Current State

The following capabilities are implemented and verified as of the pre-live integration phase.

### 1.1 UI

- Next.js App Router dashboard with Korean labels
- Dark theme, sidebar navigation, status cards, emergency controls
- All primary routes load without build/runtime errors
- Playwright E2E smoke tests cover all main pages

**Routes:**

- `/dashboard`
- `/strategies/discovery`
- `/strategies/ranking`
- `/strategies/[id]` (including `/strategies/SAFE_v44_i4060`)
- `/backtests`
- `/trading/bot`
- `/trading/orders`
- `/risk`
- `/alerts/rules`
- `/alerts/history`
- `/system/api-status`
- `/settings`

### 1.2 PAPER Trading Simulation

- **Default mode:** PAPER
- Bot start / stop / restart simulated via `paperTradingEngine.ts`
- Order history labeled `paper` or `mock`
- Position updates are simulated only
- No real Binance order endpoints are called from PAPER flows

### 1.3 Safety Gates

- LIVE mode blocked by default
- `REXTORA_LIVE_APPROVED=false` by default in `.env.example`
- Pure safety functions in `safety.ts`:
  - `canStartLiveTrading`
  - `isStrategyLiveEligible`
  - `isAggressiveStrategyBlocked`
  - `isServerTpSlRequired`
  - `isRiskLimitBreached`
  - `shouldEmergencyStop`
  - `getLiveBlockReasons`
- Aggressive candidates (aggressive candidate) blocked from LIVE
- Discovery-generated strategies (discovery-generated strategy) blocked from LIVE
- Risk limit breach blocks trading
- Emergency stop available in all modes (PAPER simulated; LIVE blocked)

### 1.4 Binance Read-Only Integration

- Service: `src/lib/rextora/binanceReadOnlyService.ts`
- Environment variables: `BINANCE_API_KEY`, `BINANCE_API_SECRET`, `BINANCE_TESTNET`
- Read-only capabilities when configured:
  - Config status
  - Futures account balance (read-only)
  - Futures account info (read-only)
  - Server time
  - Public market ticker
  - Public klines
- API routes:
  - `GET /api/binance/status`
  - `GET /api/binance/balance`
  - `GET /api/binance/market`
  - `GET /api/binance/klines`
- **Order permission remains blocked.** Real order engine remains not connected.

### 1.5 Telegram Service / Test Path

- Service: `src/lib/rextora/telegramService.ts`
- Environment variables: `TG_TOKEN`, `TG_CHAT_ID`
- Missing env → status `mock`
- Configured env → status `configured` / test-ready
- `POST /api/telegram/test` sends connectivity test message only
- Live entry/exit/bot-start execution messages are blocked
- Secrets are never exposed in UI or logs

### 1.6 Verification Script

- Script: `scripts/verify-rextora.mjs`
- Package script: `npm run verify:rextora`
- Pre-live aggregate: `npm run check:prelive`
- Checks include:
  - SAFE strategy existence and hash
  - PAPER default
  - LIVE blocked
  - No order placement code paths
  - No hardcoded secrets
  - Required docs and routes exist

### 1.7 Live Trading — Intentionally Blocked

- `liveTradingEngine.ts` is interface-only
- `startLiveBot()` always rejects
- UI displays: **LIVE order execution is not enabled yet.**
- No real market, limit, futures, close, or TP/SL order placement exists

### 1.8 Server-Side TP/SL — Not Production Implemented

- `tpSlManager.ts` has `designOnly: true`, `liveImplementationReady: false`
- Design document: `docs/REXTORA_SERVER_TPSL_DESIGN.md`
- PAPER may simulate TP/SL state
- LIVE blocked with reason: **Server TP/SL live order implementation not ready**
- Real exchange-side TP/SL order submission is not implemented

---

## 2. Preserved Baseline Strategy

| Field | Value |
|-------|-------|
| Name | `SAFE_v44_i4060` |
| params_hash | `7893ca3f0e30` |
| File | `data/strategies/SAFE_v44_i4060.json` |
| Type | stable type |
| live_eligible_candidate | `true` |
| verified_for_live | `false` |

This strategy is the preserved safe baseline. It is not an explosive strategy. It must always exist with the exact params_hash above.

---

## 3. Modules That Must Be Kept

These modules are part of the safety boundary. **Do not delete or bypass them** without CEO approval and a documented replacement plan.

| Module | Path | Role |
|--------|------|------|
| Safety gates | `src/lib/rextora/safety.ts` | Pure LIVE/PAPER/BACKTEST eligibility checks |
| PAPER engine | `src/lib/rextora/paperTradingEngine.ts` | Simulated bot, orders, positions |
| Binance read-only | `src/lib/rextora/binanceReadOnlyService.ts` | Read-only exchange data only |
| Order manager | `src/lib/rextora/orderManager.ts` | Mode-separated close/cancel/emergency actions |
| TP/SL manager | `src/lib/rextora/tpSlManager.ts` | TP/SL status and pre-live readiness gate |
| API status | `src/lib/rextora/apiStatusService.ts` | Permission and engine connection status |
| Verification script | `scripts/verify-rextora.mjs` | Automated safety/doc/route checks |
| E2E smoke test | `tests/e2e/rextora-smoke.spec.ts` | Browser-level route and safety UI checks |

Supporting modules that should also be preserved:

- `src/lib/rextora/strategyRepository.ts`
- `src/lib/rextora/riskManager.ts`
- `src/lib/rextora/backtestEngine.ts` (seed/snapshot mode)
- `src/lib/rextora/strategyDiscoveryEngine.ts`
- `src/lib/rextora/telegramService.ts`
- `src/lib/rextora/localStore.ts`
- `data/strategies/SAFE_v44_i4060.json`

---

## 4. Modules and Areas Requiring Review or Rebuild Later

These areas exist as placeholders, design documents, or blocked interfaces. They must be **reviewed, audited, and rebuilt** before any live trading phase.

| Area | Path / Doc | Current Status | Required Before LIVE |
|------|------------|----------------|----------------------|
| Live trading engine | `src/lib/rextora/liveTradingEngine.ts` | Interface only, always rejects | Full audited implementation behind approval gate |
| Server-side TP/SL | `src/lib/rextora/tpSlManager.ts`, `docs/REXTORA_SERVER_TPSL_DESIGN.md` | Design only | Real exchange order creation, verification, reconciliation |
| Production order execution | Not implemented | Blocked | Separate order engine module with testnet → minimum-size live phases |
| Exchange/account/API integration (write) | Partial read-only only | Read paths only | Order, position, leverage, margin endpoints with audit logging |
| Backtest engine | `src/lib/rextora/backtestEngine.ts` | Preserved snapshot | Real compute backend (e.g. vectorbt) if desired |
| Strategy discovery | `src/lib/rextora/strategyDiscoveryEngine.ts` | Mock generation | Real search pipeline with validation gates |

See also:

- `docs/REXTORA_LIVE_ORDER_READINESS_REVIEW.md`
- `docs/REXTORA_PRE_LIVE_CHECKLIST.md`

---

## 5. Strict Approval Boundary

### 5.1 Allowed Without CEO Approval

- Read-only codebase analysis
- Read-only documentation updates (including this document)
- Reviewing verification output already produced
- Reading public project structure and non-secret configuration examples (e.g. `.env.example`)

### 5.2 Requires Explicit CEO Approval

The following actions must **not** be performed by automation or agents without explicit CEO approval:

| Action | Reason |
|--------|--------|
| File deletion | Irreversible loss of safety artifacts |
| Source code modification | May alter safety behavior |
| `npm` command execution | May install, build, or test against live systems |
| Server execution / deployment | May expose or activate runtime behavior |
| API key creation, rotation, or storage changes | Credential risk |
| Exchange account changes | Financial exposure |
| Leverage changes | Financial exposure |
| Position changes | Financial exposure |
| Loss limit changes | Risk profile change |
| Live order execution | Direct financial risk |
| Setting `REXTORA_LIVE_APPROVED=true` | Removes default LIVE block |
| Enabling real TP/SL order submission | Direct financial risk |
| Storing real API keys in UI or source code | Security risk |

### 5.3 Default Safety Invariants

These invariants must hold unless CEO explicitly approves a controlled change:

1. `REXTORA_LIVE_APPROVED=false` by default
2. PAPER is the default trading mode
3. No real Binance order placement functions exist or are called
4. Order permission status remains blocked for live execution
5. Real order engine remains reported as not connected
6. Server TP/SL production implementation remains absent
7. No profit guarantee text appears anywhere in the product

---

## 6. Phase Summary

| Capability | Status |
|------------|--------|
| UI | Ready |
| PAPER simulation | Ready |
| Pre-live safety gates | Ready |
| Telegram test path | Ready (env-dependent) |
| Binance read-only | Ready (env-dependent) |
| Market data read-only | Ready (public API with mock fallback) |
| Server TP/SL design | Ready (design only) |
| Live order readiness review | Documented |
| **Real live order execution** | **Blocked** |

---

## 7. Related Documentation

| Document | Purpose |
|----------|---------|
| [REXTORA_PRE_LIVE_CHECKLIST.md](./REXTORA_PRE_LIVE_CHECKLIST.md) | What is implemented vs mock vs blocked |
| [REXTORA_SERVER_TPSL_DESIGN.md](./REXTORA_SERVER_TPSL_DESIGN.md) | Server TP/SL design requirements |
| [REXTORA_LIVE_ORDER_READINESS_REVIEW.md](./REXTORA_LIVE_ORDER_READINESS_REVIEW.md) | Steps before enabling real orders |
| [../README.md](../README.md) | Project overview |

---

## 8. Disclaimer

Rextora does not guarantee profit or returns. All investment decisions are the sole responsibility of the owner.

*This is not investment advice. The user is solely responsible for all investment decisions.*
