# Rextora Operator Acceptance Audit Notes
Started: 2026-07-27
App: http://127.0.0.1:3000
Mode: Paper (모의거래)

## Screenshots
- audit-01-landing-collapsed-form.png — finished job sticky UI with 3% + future ETA
- audit-02-expert-ob-params.png — Expert params visible but finished job still dominating viewport
- audit-03-s1-ob-only-config.png — S1 config OB only / single / AND
- audit-04-s1-running-progress.png — S1 running

## Scenario 1 — OrderBlock only
- Job: search_903b362a-6393-477e-badd-48f308ac06a9
- Name: AUDIT_S1_OB_ONLY
- Config observed: OB checked; FVG/TL/SR unchecked; template 단일 패턴; logic AND; fast; custom 2 min
- UI after start: "AND · BTCUSDT 15m · Order Block"
- Live: 16% @ ~19s; elapsed 19.4s / remaining 1m41s; evaluated 261; qualified 43
- Top1: BTCUSDT 15m · Order Block · 단일 역할 · 공격형 · 자동 1.0–5.0x · B85 | WR 86.67% | Ret 2.87% | DD -0.53% | trades 15

### Bugs observed so far
1. **HIGH** Finished/cancelled job shows live-looking progress (3%) + remaining time + future ETA (UI_VERIFY job).
2. **MEDIUM** Sticky job / form prefill: navigating to /strategy-search keeps prior job name & multi-pattern form values until manually cleared.
3. **MEDIUM** Collapsed "탐색 설정(접힘)" while finished job selected — unclear how to start new research; operator must clear recent job or navigate carefully.
4. **MEDIUM** Custom 2-minute budget displays as "요청 시간: 0시간" after start.
5. **MEDIUM** Truncated label "패턴 설" in config summary.
6. **HIGH** Contradictory messaging: AI weakness says "비용 스트레스 검증을 통과하지 못했습니다" while Top1 row says "비용 스트레스 통과".
7. **LOW** English mixed into Korean UI (balanced, single_close, TOP 10, AND, ANY).
8. **MEDIUM** Expert OB params present: minImpulseAtrMult, minImpulsePct, minVolumeMult, mitigationPct, confirmationCandleCount, penetrationPct, zoneLookback, body zone, close_beyond invalidation. **Missing from UI labels (not observed as trader-named controls):** engulf ratio, body ratio, wick %, entry depth %, zone type (supply/demand naming), expiration as dedicated OB param (global 유효 기간 48봉 exists).

## Expert settings inventory (UI observed)
### Order Block
Present: 존 침투 비율, 확인 봉 수, 확인 구간, 패턴 탐색 구간, 최소 충격 ATR, 최소 충격 비율, 최소 거래량 배수, 완화 비율, 몸통 존 사용, 종가 이탈 무효, 무효화 방식
### FVG
Present: 최소 갭 절대/비율, 갭 ATR 배수, 부분 채움, 완전 채움 무효, 종가 관통 무효, confirmation/penetration/lookback
### Trendline
Present: min pivots/touches, slope min/max, tolerance, line confirmation candles
### SR
Present: min touches, tolerance, zone width, volume confirm toggle

## Pending scenarios
S2 OB+FVG, S3 +TL, S4 +SR, AND/OR/SEQUENCE, all templates, Auto/Basic/Expert, all leverage modes
Lifecycle: Results → Register → Backtest → Paper → Live dry-run
Failure: cancel, restart, invalid, empty, refresh
