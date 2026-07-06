# Rextora Pre-Live Checklist

## Implemented

- Next.js App Router pages and API routes are connected to `src/lib/rextora` service modules.
- `SAFE_v44_i4060` is preserved in `data/strategies/SAFE_v44_i4060.json` with params hash `7893ca3f0e30`.
- Domain types, seed data, strategy repository, safety gates, paper trading, risk, API status, Telegram status, alert rules, AI briefing, TP/SL status, and order manager modules are present.
- Backtest output is marked `seeded_from_preserved_snapshot`.

## Mock Or Simulated

- Backtest results are preserved snapshot data only: 현재 결과는 보존된 전략 스냅샷 기반입니다. 실제 엔진 연결 전입니다.
- Alert evaluation and AI briefing are mock outputs.
- Telegram sends only mock/configured test status. LIVE execution messages are blocked.
- API status checks environment variable presence only and do not call real order endpoints.

## PAPER Only

- PAPER is the default bot mode.
- PAPER start/stop/restart, order logs, position close, partial close, cancel orders, and emergency stop are simulated/logged.
- PAPER TP/SL can be simulated, but it is not an exchange-side order.

## LIVE Blocked

- LIVE starts are blocked by default.
- LIVE is blocked without server TP/SL, futures permission, order permission, valid strategy file/hash, risk confirmation, non-aggressive strategy, and explicit live approval.
- `verified_for_live: false` means `SAFE_v44_i4060` is only a candidate and is not actual live eligible.
- LIVE 주문 실행은 아직 비활성화되어 있습니다.

## Binance API Safety Checklist

- Use read-only keys first.
- Do not store real secrets in the repo.
- Confirm `BINANCE_TESTNET=true` while testing.
- Verify IP restrictions, futures permissions, balance read, order read, server TP/SL registration, and real order engine design before any live phase.
- Order permission remains blocked in this MVP.

## Server TP/SL

- LIVE requires exchange/server-side TP/SL before any order can be considered.
- Current labels are `비활성`, `모의 활성`, and `실거래 활성`.
- Default status is `비활성`.

## Telegram Setup

- Optional variables: `TG_TOKEN`, `TG_CHAT_ID`.
- Only test messages are allowed when configured.
- Entry, exit, bot start, and LIVE execution messages are blocked.

## Risk Settings

- Defaults: daily loss `-5%`, total loss `-10%`, consecutive losses `3`, max daily trades `20`, max leverage `2.5x`, max positions `1`.
- Risk settings can be persisted locally in browser storage or safe memory fallback.

## Before Real Live Execution

- Build a separate audited live order engine.
- Add exchange testnet integration tests.
- Add server-side TP/SL order registration and reconciliation.
- Add position/order reconciliation against exchange state.
- Add secret storage outside the repo.
- Add manual approval, dry-run evidence, rollback, monitoring, and incident procedures.

No real orders are placed by this implementation.
