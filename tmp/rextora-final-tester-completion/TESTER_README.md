# Rextora tester candidate

Tester use may begin with production BUILD_ID `-6CTCAJcZAMY02xezkvRO`.

- Use Paper only. Live activation and real exchange orders remain prohibited and blocked.
- OpenAI uses `gpt-5-mini`; Gemini uses `gemini-2.5-flash`.
- Production acceptance: 88/88 passed across 390, 768, 1024, and 1440px.
- Standard E2E: 31/31 passed. Lifecycle: 52/52 passed. Unit: 1,560/1,560 passed.
- Paper consecutive-loss stop: 6. Live consecutive-loss threshold remains 3.
- SAFE `data/strategies/SAFE_v44_i4060.json` is unchanged and protected.
- No real order, Live activation, SAFE mutation, secret leak, or raw internal-field leak occurred.

The final repair prevents an already executed approval from being recovered from older conversation history and resurrected after refresh. The rebuilt candidate passed focused regression, full Unit, Lifecycle 52, Production 88, standard E2E, provider sanity, and the tester journey.

Evidence is in this directory, especially `tester-readiness.json`, `final-report.json`, `production-88-after-fix-results.json`, `lifecycle-52-after-fix-summary.json`, and `final-provider-sanity.json`.
