# Rextora

Rextora is a private, safety-first AI quant trading web application for a single owner. It provides strategy discovery, backtest validation, paper trading simulation, risk monitoring, alert management, and pre-live safety controls. **Real live order execution is intentionally blocked** in the current phase.

## Current Phase

Rextora is complete up to the last safe point **before** real Binance live order execution. The application supports UI, PAPER simulation, safety gates, read-only exchange checks, and verification tooling. It does **not** place real market, limit, futures, close, or TP/SL orders.

## Confirmed State

| Area | Status |
|------|--------|
| UI (Next.js App Router) | Implemented |
| PAPER trading simulation | Implemented (default mode) |
| Safety gates | Implemented |
| Binance read-only integration | Implemented (env-dependent) |
| Telegram service / test path | Implemented (env-dependent) |
| Verification script | Implemented (`scripts/verify-rextora.mjs`) |
| E2E smoke tests | Implemented (`tests/e2e/rextora-smoke.spec.ts`) |
| Live trading | **Intentionally blocked** |
| Server-side TP/SL (production) | **Not implemented** (design only) |

## Preserved Baseline Strategy

- **Name:** `SAFE_v44_i4060`
- **params_hash:** `7893ca3f0e30`
- **File:** `data/strategies/SAFE_v44_i4060.json`
- **Role:** Preserved safe baseline strategy. Not an explosive strategy. Candidate only; not verified for live trading.

## Main Routes

| Route | Purpose |
|-------|---------|
| `/dashboard` | Bot status, risk, balance, market summary, emergency controls |
| `/strategies/discovery` | Random Search strategy generation (mock/simulated) |
| `/strategies/ranking` | Strategy ranking table |
| `/strategies/[id]` | Strategy detail and validation |
| `/backtests` | Backtest validation (preserved snapshot) |
| `/trading/bot` | PAPER bot control and LIVE safety checklist |
| `/trading/orders` | Order history (PAPER/mock) |
| `/risk` | Risk limits and warnings |
| `/alerts/rules` | Alert rule settings |
| `/alerts/history` | Alert history and AI briefing |
| `/system/api-status` | API, Binance read-only, Telegram status |
| `/settings` | Private owner settings (no real API key storage) |

## Project Structure

```
D:\Rextora\
- app/                    # Next.js App Router pages and API routes
- components/rextora/     # Dashboard UI components
- src/lib/rextora/        # Domain services, safety, engines
- data/strategies/        # Preserved strategy JSON files
- scripts/                # Verification scripts
- tests/                  # Unit and E2E tests
- docs/                   # Project documentation
```

## Core Safety Modules (Do Not Remove)

These modules form the safety boundary and must be preserved:

| Module | Path |
|--------|------|
| Safety gates | `src/lib/rextora/safety.ts` |
| PAPER engine | `src/lib/rextora/paperTradingEngine.ts` |
| Binance read-only | `src/lib/rextora/binanceReadOnlyService.ts` |
| Order manager | `src/lib/rextora/orderManager.ts` |
| TP/SL manager | `src/lib/rextora/tpSlManager.ts` |
| API status | `src/lib/rextora/apiStatusService.ts` |
| Verification script | `scripts/verify-rextora.mjs` |
| E2E smoke test | `tests/e2e/rextora-smoke.spec.ts` |

## Environment Variables

Copy `.env.example` to `.env` locally. **Do not commit `.env`.**

| Variable | Purpose |
|----------|---------|
| `BINANCE_API_KEY` | Read-only Binance checks only (this phase) |
| `BINANCE_API_SECRET` | Read-only Binance checks only (this phase) |
| `BINANCE_TESTNET` | Use testnet when `true` |
| `TG_TOKEN` | Optional Telegram test message |
| `TG_CHAT_ID` | Optional Telegram test message |
| `REXTORA_LIVE_APPROVED` | Must remain `false` until explicit CEO approval |

Real order execution is **not** enabled by any environment variable in the current phase.

## Documentation

| Document | Description |
|----------|-------------|
| [docs/REXTORA_TARGET_SCOPE.md](docs/REXTORA_TARGET_SCOPE.md) | Target scope, preserved modules, approval boundary |
| [docs/REXTORA_PRE_LIVE_CHECKLIST.md](docs/REXTORA_PRE_LIVE_CHECKLIST.md) | Pre-live implementation checklist |
| [docs/REXTORA_SERVER_TPSL_DESIGN.md](docs/REXTORA_SERVER_TPSL_DESIGN.md) | Server TP/SL design (not production-ready) |
| [docs/REXTORA_LIVE_ORDER_READINESS_REVIEW.md](docs/REXTORA_LIVE_ORDER_READINESS_REVIEW.md) | Live order readiness review |

## Verification (Reference Only)

These commands exist for local verification. **Do not run without appropriate approval context.**

```powershell
npm run lint
npm run build
npm run verify:rextora
npm test
npm run test:e2e
npm run check:prelive
```

## Approval Boundary

**Allowed without CEO approval:**

- Read-only analysis
- Documentation updates

**Requires explicit CEO approval:**

- File deletion
- Source code modification (except approved doc-only tasks)
- `npm` command execution on production systems
- Server execution / deployment
- API key creation, rotation, or storage changes
- Exchange account changes
- Leverage changes
- Position changes
- Loss limit changes
- Live order execution
- Enabling `REXTORA_LIVE_APPROVED=true`

## Disclaimer

Rextora does not guarantee profit or returns. All investment decisions are the sole responsibility of the owner. UI text includes: *This is not investment advice. The user is solely responsible for all investment decisions.*
