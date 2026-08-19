# Rextora tester handoff — blocked

Rextora is **not ready for external tester startup** from this checkout. No `FINAL_TESTER_BUILD_ID` exists because the normal `npm run build` command failed twice at the same Turbopack/PostCSS boundary. The incomplete `.next` directory must not be used.

## Current status

- Final source fingerprint: `732f3e52f66484cc163f7ee25a3702de5fb37bb232c712606ac1fb7dfb0ff780`
- Final tester build ID: unavailable
- Startup command: unavailable until a clean `npm run build` succeeds; after a verified build the intended command is `npm start`
- Intended local URL: `http://127.0.0.1:3000`
- External tester decision: blocked

## Provider setup

Configure OpenAI or Gemini in Settings. Credentials are stored server-side and must never be copied into screenshots, browser storage, reports, or issue text. Focused checks reached OpenAI `gpt-5-mini` and Gemini `gemini-2.5-flash` without fallback, but those checks were not run on a final build.

## Paper/mock risk behavior

- The repeated stop was caused by the consecutive-loss counter: persisted value `4` exceeded the previous limit `3`.
- New Paper sessions reset simulated risk counters deterministically.
- Paper evaluates a finite consecutive-loss limit of `6`, derived from the observed normal value `4` plus 50% headroom.
- Live retains the configured limit `3`; the Paper value is not persisted into shared Live settings.
- Reaching `6` consecutive Paper losses still causes the hard emergency stop.
- Telegram emits one alert on entry into a specific blocked state, suppresses repeats while it remains blocked, and allows a new alert after recovery or for a distinct risk breach.

## Restrictions

- Live Trading remains blocked and was not run.
- No real exchange order was executed.
- No Binance order endpoint was called.
- `data/strategies/SAFE_v44_i4060.json` remains protected and unchanged.

## Known blocking limitation

The normal Next.js 16.2.6 Turbopack production build panics while processing `app/globals.css`: the PostCSS worker times out receiving a process message. Because the second attempt failed at the same boundary, the run stopped under the usage-budget rule. Lifecycle 52, Production 88, standard E2E, final provider/approval sanity, Paper runtime sanity, and tester smoke were therefore not executed on a final build.

## Failure reporting

Include the affected page, exact action, time, screenshot, and browser console message. Never include API keys, tokens, credentials, or raw environment files.

Evidence is under `tmp/rextora-codex-final/`. Build logs are `build/build.stdout.txt` and `build/build-final.stdout.txt`; focused and quality evidence is summarized in `final-report.json`.
