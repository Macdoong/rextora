# Rextora Server TP/SL Design

## Status

- Current implementation status: design only.
- `designOnly`: `true`.
- `liveImplementationReady`: `false`.
- LIVE trading remains blocked with the reason `서버 TP/SL 실주문 구현 전`.
- PAPER mode may simulate TP/SL state and logs, but it must not submit real exchange orders.

## Required Server Behavior Before LIVE

Server TP/SL must be placed and monitored by a backend service before any live entry can be considered. Browser/UI state must never be the authority for live protective orders.

The future implementation must:

- Create protective stop-loss and take-profit orders immediately after an accepted live entry.
- Verify that both protective orders exist on Binance Futures before reporting a live position as protected.
- Reconcile open positions and protective orders on restart.
- Fail closed if TP/SL placement, verification, or reconciliation fails.
- Store only non-secret order metadata needed for audit and recovery.
- Avoid client-side-only timers for live protection.

## Endpoints Still Forbidden

This phase does not implement real order placement, futures position open/close, leverage changes, margin mode changes, or live TP/SL order submission.

Forbidden Binance actions remain blocked:

- Futures order creation.
- Futures order cancellation for real orders.
- Leverage changes.
- Margin mode changes.
- Real TP/SL order submission.

## Pre-LIVE Readiness Gate

`validatePreLiveTpSlReadiness()` must return blocked for LIVE until a separate implementation proves server-side TP/SL creation, verification, recovery, and audit logging.

PAPER simulation is acceptable only for UI and workflow testing.
