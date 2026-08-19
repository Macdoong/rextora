# Rextora Tester Runtime

Verified tester-candidate build for external testing. This is **not** a public production release gate.

## Build

- **BUILD_ID:** `Bt9hwUM42EQX4tnRiIVUW`
- Evidence root: `tmp/rextora-tester-readiness/`

## Prerequisites

- Node.js compatible with this repo (`package.json` engines / local Node used for verification)
- Repository dependencies installed (`npm ci` or `npm install`)
- Production build already present under `.next` for BUILD_ID above, or rebuild with:
  - `node scripts/buildTesterCandidate.mjs`
- AI provider credentials configured in Settings (OpenAI + Gemini). Do not paste keys into chat logs.
- Isolated data directory recommended via `REXTORA_DATA_DIR` so tester runs do not mutate shared local data.

## Startup (existing production path)

```bash
# From repository root, after build:
REXTORA_DATA_DIR=/path/to/isolated-data npm run start -- -H 127.0.0.1 -p 3000
```

Equivalent:

```bash
REXTORA_DATA_DIR=/path/to/isolated-data npx next start -H 127.0.0.1 -p 3000
```

## URL

- App: `http://127.0.0.1:3000`
- Primary entry: `http://127.0.0.1:3000/dashboard`

## What testers may exercise

- Dashboard / Strategy Search / Results / Backtest / Paper / Settings
- AI Provider Settings (OpenAI `gpt-5-mini`, Gemini `gemini-2.5-flash`)
- Agent conversation, planning, approval, and status reporting
- Paper / research workflows that require explicit approval

## Hard restrictions

- Do **not** enable Live trading
- Do **not** place real exchange / Binance orders
- Do **not** modify `data/strategies/SAFE_v44_i4060.json`
- Approval is required before write/exec tools run; repeated approval must not duplicate execution

## Known remaining non-blocking notes

- Long-lived `next dev` was not used as the tester runtime; use production `next start`
- Provider latency varies; conversational turns can take tens of seconds
- OpenAI connection-test health checks may report intermittent non-fatal anomalies while canary/conversation still succeed

## How to report a failure

Include:

1. BUILD_ID (`Bt9hwUM42EQX4tnRiIVUW`)
2. Exact URL + viewport
3. Exact user steps / prompts
4. Screenshot
5. Time (UTC)
6. Whether Live was attempted (must be no)
7. Relevant files under `tmp/rextora-tester-readiness/` (do not attach secrets)

## Evidence paths from this readiness run

- Focused 9: `tmp/rextora-tester-readiness/focused/`
- Lint/unit: `tmp/rextora-tester-readiness/quality/`
- Lifecycle 52: `tmp/rextora-tester-readiness/lifecycle/lifecycle52-summary.json`
- Production 88: `tmp/rextora-tester-readiness/production-88/summary.json`
- E2E: `tmp/rextora-tester-readiness/e2e/e2e.stdout.txt`
- Provider sanity: `tmp/rextora-tester-readiness/provider-sanity/provider-sanity.json`
- Approval exactly-once: `tmp/rextora-tester-readiness/approval-exactly-once/approval-exactly-once.json`
- Tester smoke: `tmp/rextora-tester-readiness/smoke/tester-smoke.json`
- Security/SAFE: `tmp/rextora-tester-readiness/security/`
