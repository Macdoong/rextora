# Rextora Live Order Readiness Review

## Current Status

Rextora is ready for pre-live verification only. UI routes, PAPER simulation, Telegram connectivity testing, Binance read-only checks, and market data reads are present. Real live order execution is still blocked.

## Implemented

- PAPER default mode.
- LIVE safety blocks.
- Binance read-only configuration/status checks.
- Binance read-only futures balance/account reads when env vars are present.
- Binance public ticker and klines reads with mock fallback.
- Telegram env-only connectivity test.
- Emergency action PAPER simulation and logs.
- Server TP/SL design-only readiness gate.
- Verification script checks for safety blocks and missing live order paths.

## Blocked

- Real Binance order placement.
- Futures position open/close.
- Live TP/SL order submission.
- Leverage changes.
- Margin mode changes.
- Real API key storage in UI or app state.
- LIVE start while `REXTORA_LIVE_APPROVED=false`.
- LIVE start while server TP/SL real implementation is not ready.

## Required Steps Before Any LIVE Phase

- Implement a separate real order engine behind an explicit approval gate.
- Add Binance testnet order placement only after review.
- Implement server-side TP/SL creation and reconciliation.
- Add durable audit logging for every live intent, exchange response, and safety decision.
- Add operator kill switch and recovery procedure.
- Prove failure behavior with tests and manual drills.

## Manual Checklist

- Confirm `REXTORA_LIVE_APPROVED=false` by default.
- Confirm PAPER is the default mode.
- Confirm live start buttons remain disabled or blocked.
- Confirm real order engine reports disconnected.
- Confirm API keys are only supplied through environment variables.
- Confirm no token, chat ID, API key, or secret is shown in UI or logs.
- Confirm no profit guarantee or guaranteed return wording appears.

## Binance Permissions

Use read-only permissions for this phase. Futures trading permissions must remain unnecessary and unused until a separate testnet/live rollout is approved.

## Testnet Phase

Before mainnet, run a separate Binance Futures testnet phase with minimum quantity orders, server TP/SL verification, kill switch drills, and full log review.

## Minimum-Size Live Phase

If a future review approves mainnet, use the minimum practical order size, one symbol, one strategy, low leverage, and manual monitoring. Stop immediately on any reconciliation mismatch.

## Kill Switch

The kill switch must stop automation, block new live intents, and preserve logs. It must not depend on browser state.

## Server TP/SL

LIVE is not ready until server TP/SL orders are created, verified, reconciled after restart, and audited. Current status: design only.

## Logging

Log safety decisions, operator actions, exchange request IDs, sanitized exchange responses, and reconciliation results. Never log secrets.

## No-Profit-Guarantee Warning

Backtests and PAPER simulation do not guarantee future returns. Rextora must not present guaranteed profit claims.
