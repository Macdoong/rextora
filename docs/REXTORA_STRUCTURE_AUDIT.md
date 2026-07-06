# Rextora Structure Audit

**Project path:** `D:\Rextora`

**Audit type:** Documentation-only, static file existence and source review  
**Audit date:** 2026-06-02  
**Runtime commands executed:** None  
**.env read:** No  

**Reference documents:**
- [README.md](../README.md)
- [REXTORA_TARGET_SCOPE.md](./REXTORA_TARGET_SCOPE.md)
- [REXTORA_MODULE_CLASSIFICATION.md](./REXTORA_MODULE_CLASSIFICATION.md)
- [REXTORA_DEVELOPMENT_ROADMAP.md](./REXTORA_DEVELOPMENT_ROADMAP.md)

---

## Audit Scope

This audit verifies whether the current Rextora file structure and static source claims match the documented pre-live scope. It does not execute scripts, run npm commands, start the server, or read `.env` files.

**Classification key:**

| Label | Meaning |
|-------|---------|
| Present | File or route exists |
| Missing | Expected item not found |
| Needs review | Exists but warrants manual follow-up |
| Matches documentation | Static content aligns with docs |
| Does not match documentation | Static content diverges from docs |

---

## Route Audit

| Route | Path | Status | Doc alignment |
|-------|------|--------|---------------|
| Dashboard | `app/dashboard/page.tsx` | Present | Matches documentation |
| Strategy discovery | `app/strategies/discovery/page.tsx` | Present | Matches documentation |
| Strategy ranking | `app/strategies/ranking/page.tsx` | Present | Matches documentation |
| Strategy detail | `app/strategies/[id]/page.tsx` | Present | Matches documentation |
| Backtests | `app/backtests/page.tsx` | Present | Matches documentation |
| Trading bot | `app/trading/bot/page.tsx` | Present | Matches documentation |
| Trading orders | `app/trading/orders/page.tsx` | Present | Matches documentation |
| Risk | `app/risk/page.tsx` | Present | Matches documentation |
| Alert rules | `app/alerts/rules/page.tsx` | Present | Matches documentation |
| Alert history | `app/alerts/history/page.tsx` | Present | Matches documentation |
| API status | `app/system/api-status/page.tsx` | Present | Matches documentation |
| Settings | `app/settings/page.tsx` | Present | Matches documentation |

**Additional route found (not in audit list):** `app/page.tsx` (root redirect) - Present, acceptable.

**Route audit result:** All 12 required routes are **Present**. **Matches documentation.**

---

## API Route Audit

| API route | Path | Status | Doc alignment |
|-----------|------|--------|---------------|
| Binance status | `app/api/binance/status/route.ts` | Present | Matches documentation |
| Binance balance | `app/api/binance/balance/route.ts` | Present | Matches documentation |
| Binance market | `app/api/binance/market/route.ts` | Present | Matches documentation |
| Binance klines | `app/api/binance/klines/route.ts` | Present | Matches documentation |
| Telegram test | `app/api/telegram/test/route.ts` | Present | Matches documentation |
| Bot status | `app/api/bot/status/route.ts` | Present | Matches documentation |
| Cancel all orders | `app/api/orders/cancel-all/route.ts` | Present | Matches documentation |
| Strategies | `app/api/strategies/route.ts` | Present | Matches documentation |

**Additional API routes found (beyond audit list):**

| Path | Status | Notes |
|------|--------|-------|
| `app/api/dashboard/route.ts` | Present | Needs review (undocumented in this audit list) |
| `app/api/strategies/[id]/route.ts` | Present | Matches broader docs |
| `app/api/strategies/discover/route.ts` | Present | Matches broader docs |
| `app/api/bot/start/route.ts` | Present | Needs review |
| `app/api/bot/stop/route.ts` | Present | Needs review |
| `app/api/bot/restart/route.ts` | Present | Needs review |
| `app/api/orders/close-position/route.ts` | Present | Needs review |
| `app/api/orders/partial-close/route.ts` | Present | Needs review |
| `app/api/emergency/stop-all/route.ts` | Present | Matches broader docs |
| `app/api/risk/route.ts` | Present | Matches broader docs |
| `app/api/alerts/rules/route.ts` | Present | Matches broader docs |
| `app/api/alerts/history/route.ts` | Present | Matches broader docs |
| `app/api/system/api-status/route.ts` | Present | Matches broader docs |
| `app/api/backtests/run/route.ts` | Present | Needs review |
| `app/api/backtests/validation/route.ts` | Present | Needs review |

**API route audit result:** All 8 required API routes are **Present**. **Matches documentation.**

---

## Safety Module Audit

| Module | Path | Status | Doc alignment |
|--------|------|--------|---------------|
| Safety gates | `src/lib/rextora/safety.ts` | Present | Matches documentation |
| PAPER engine | `src/lib/rextora/paperTradingEngine.ts` | Present | Matches documentation |
| Live trading engine | `src/lib/rextora/liveTradingEngine.ts` | Present | Matches documentation (interface-only) |
| Binance read-only | `src/lib/rextora/binanceReadOnlyService.ts` | Present | Matches documentation |
| Order manager | `src/lib/rextora/orderManager.ts` | Present | Matches documentation |
| TP/SL manager | `src/lib/rextora/tpSlManager.ts` | Present | Matches documentation |
| API status | `src/lib/rextora/apiStatusService.ts` | Present | Matches documentation |
| Telegram service | `src/lib/rextora/telegramService.ts` | Present | Matches documentation |

**Legacy re-export layer found:**

| Path | Status | Notes |
|------|--------|-------|
| `lib/safety.ts` | Present | Re-exports from `src/lib/rextora/safety.ts` - **Needs review** |
| `lib/mock-data.ts` | Present | Re-exports from `src/lib/rextora` - **Needs review** |
| `lib/types.ts` | Present | Legacy layer - **Needs review** |
| `lib/services/engines.ts` | Present | Legacy wrapper - **Needs review** |

**Safety module audit result:** All 8 required modules are **Present**. Primary implementation is under `src/lib/rextora/`. Legacy `lib/` layer **Needs review** for long-term consolidation.

---

## Verification Asset Audit

| Asset | Path | Status | Doc alignment |
|-------|------|--------|---------------|
| Verification script | `scripts/verify-rextora.mjs` | Present | Matches documentation |
| E2E smoke test | `tests/e2e/rextora-smoke.spec.ts` | Present | Matches documentation |
| Preserved strategy | `data/strategies/SAFE_v44_i4060.json` | Present | Matches documentation |

**Verification asset audit result:** All 3 required assets are **Present**. **Matches documentation.**

---

## Static Safety Claims

Static review of source files and `.env.example` only (`.env` not read).

| Claim | Evidence | Status |
|-------|----------|--------|
| PAPER is default | `botStatusSeed.mode: "PAPER"` in `src/lib/rextora/seedData.ts` | **Matches documentation** |
| LIVE trading blocked by default | `getLiveBlockReasons()` always adds live-order block reason; `startLiveBot()` always returns `ok: false`; `REXTORA_LIVE_APPROVED=false` in `.env.example` | **Matches documentation** |
| Real order execution not connected | `apiStatusSeed.realOrderEngineConnected: false`; `binanceReadOnlyService` type declares `realOrderEngineConnected: false`; `orderPermission: "차단"` | **Matches documentation** |
| Binance integration is read-only | `binanceReadOnlyService.ts` calls only `/fapi/v2/balance`, `/fapi/v2/account`, `/fapi/v1/time`, `/fapi/v1/ticker/24hr`, `/fapi/v1/klines`; no order endpoints found | **Matches documentation** |
| Server-side TP/SL design-only / not production-ready | `tpSlManager.ts`: `designOnly: true`, `liveImplementationReady: false` | **Matches documentation** |
| SAFE_v44_i4060 exists | `data/strategies/SAFE_v44_i4060.json` name field | **Matches documentation** |
| params_hash is 7893ca3f0e30 | JSON file + `SAFE_PARAMS_HASH` in `strategyRepository.ts` | **Matches documentation** |

**Additional static observations:**

| Observation | Status |
|-------------|--------|
| `verified_for_live: false` in SAFE JSON | Matches documentation (candidate only) |
| `startLiveBot()` returns `ok: false` even when preflight runs | Matches documentation (live execution not enabled) |
| Telegram live entry/exit messages blocked in `telegramService.ts` | Matches documentation |
| PAPER orders labeled `paper` / `mock` in seed data | Matches documentation |

---

## Mismatches

| Item | Expected (docs) | Found (static review) | Severity |
|------|-----------------|----------------------|----------|
| Module path references | Docs primarily cite `src/lib/rextora/*` | Legacy `lib/*` re-export layer still exists | Low - **Needs review**, not a safety mismatch |
| Additional API routes | Audit list covers 8 routes | 15 additional API routes exist | Low - **Needs review** for documentation completeness |
| Strategy JSON type field | Docs use English "stable type" in some places | JSON still contains Korean type label | Low - cosmetic/doc wording only |

**No critical safety mismatches found.** Static source aligns with documented pre-live scope.

---

## Risks

| Risk | Description | Mitigation |
|------|-------------|------------|
| Dual module layer | `lib/` and `src/lib/rextora/` coexist | Document canonical path; consolidate in future phase with CEO approval |
| Undocumented API routes | Extra routes beyond audit list | Update route inventory in docs during Phase 1 |
| Env-dependent behavior | Binance/Telegram behavior depends on env vars | Cannot verify runtime without CEO-approved command execution |
| Legacy tests import path | `tests/safety.test.ts` imports from both `lib/` and `src/lib/rextora/` | Needs review for import consistency |
| No runtime verification in this audit | Static review only | Run `npm run verify:rextora` and `npm run test:e2e` when CEO approval allows |

---

## Next Recommended Actions

1. **Do not start live trading.**
2. Align documentation route inventory with all existing API routes (Phase 1).
3. Mark `src/lib/rextora/` as canonical path; label `lib/` as legacy re-export layer.
4. When CEO approval allows, run verification commands to confirm runtime behavior matches static audit:
   - `npm run verify:rextora`
   - `npm test`
   - `npm run test:e2e`
5. Proceed with Phase 4 (PAPER operating system) and Phase 3 (monitoring) per [REXTORA_DEVELOPMENT_ROADMAP.md](./REXTORA_DEVELOPMENT_ROADMAP.md).

---

## CEO Approval Required Items

These actions are not permanently forbidden. They require explicit CEO approval before execution.

| Action | Relevance to this audit |
|--------|-------------------------|
| Source code modification | Required to consolidate `lib/` vs `src/lib/rextora/` |
| File deletion | Required if removing legacy `lib/` layer |
| npm command execution | Required to run verify/test/build commands |
| Server execution | Required for runtime smoke verification |
| API key changes | Required to test live Binance read-only connectivity |
| Live order execution | Not applicable in current phase - remains blocked |
| Live trading mode transition | Not applicable - `REXTORA_LIVE_APPROVED=false` by default |

---

## Audit Summary

| Area | Result |
|------|--------|
| Routes (12 required) | 12 Present - Matches documentation |
| API routes (8 required) | 8 Present - Matches documentation |
| Safety modules (8 required) | 8 Present - Matches documentation |
| Verification assets (3 required) | 3 Present - Matches documentation |
| Static safety claims (7 checked) | 7 Matches documentation |
| Critical mismatches | 0 |
| Items needing review | Legacy `lib/` layer, additional API routes, test import paths |

**Overall conclusion:** Current implementation **matches documented pre-live scope**. Live trading is not enabled. Real order execution is not connected. Binance integration is read-only by static design. Server-side TP/SL is design-only. SAFE baseline strategy and hash are present and correct.
