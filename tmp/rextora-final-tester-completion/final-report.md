# REXTORA FINAL 37%-BUDGET TESTER REPORT

1. **Starting source fingerprint** — 937 files; `209ae0043c0f6538283c9783d764b769a4944659e23569700db316d28790e631`.
2. **Current BUILD_ID** — `-6CTCAJcZAMY02xezkvRO`.
3. **Source/build consistency** — PASS. Final raw 937-file fingerprint is `25edc3c17daced6497136d6479156c9569f5fc1851de4f214119102315bb3d6c`. No application source changed after the rebuild; only Next-generated `next-env.d.ts` is newer than BUILD_ID. Branch `main`, HEAD `5e0f089e5b2e02761705944710e6f6156c5d7663`.
4. **Existing evidence reused** — NFT trace/boundaries, prior root-cause work, SAFE baseline, build-output audit, and unchanged-boundary risk semantics were reused until the source repair invalidated affected evidence.
5. **Heavy gates skipped to save usage** — no Development 88, no dev stress matrix, no repeat NFT investigation, no Tailwind/PostCSS diagnostics, no redundant lint full run. Focused ESLint passed; full Unit/Lifecycle/Production/E2E were rerun only after the source change required them.
6. **Production 390** — 22/22 PASS.
7. **Production 768** — 22/22 PASS.
8. **Production 1024** — 22/22 PASS.
9. **Production 1440** — 22/22 PASS.
10. **Production aggregate** — 88 expected, 88 executed, 88 passed, 0 failed, 0 skipped, 0 flaky, retryCount 0, one worker; 43.5 minutes.
11. **Previous billing-failure scenario result** — scenario 01 passed at all four viewports. OpenAI stored/configured state and live provider rows passed; no billing/quota/credit error remained. The earlier stop was account-billing-related, not an application defect.
12. **Standard E2E** — 31 discovered, 31 passed, 0 skipped, 0 failed, exit 0 on the single post-fix run.
13. **OpenAI final result** — PASS on `gpt-5-mini`: providerAttempted=true, providerSucceeded=true, fallbackUsed=false, structuredOutputValid=true, writeToolCount=0, no billing/quota/credential error, no secret exposure. A preceding focused attempt fell back after provider response validation; the single affected-row rerun passed and the transient is not hidden.
14. **Gemini final result** — PASS on `gemini-2.5-flash`: providerAttempted=true, providerSucceeded=true, fallbackUsed=false, structuredOutputValid=true, contextPreserved=true, writeToolCount=0.
15. **Approval exactly-once** — PASS. Lifecycle B passed at all four viewports: pre-approval no write; approval providerCallCount=0; persisted state matched; repeated approval was `skipped_idempotent` with writeAuditDelta=0, jobCountDelta=0, duplicateExecutionCount=0.
16. **Ambiguous approval result** — PASS. Post-fix Unit includes the multiple-valid-pending case: clarification required, no execution result, no proposed action; full Unit passed 1,560/1,560.
17. **Execution reporting** — PASS at all Production viewports and Lifecycle; persisted execution receipt was used, no new write, no fabricated completion, no primary raw ID/enum leak.
18. **Paper start** — PASS. Lifecycle K and the tester journey traversed active → paused → active → stopped through the canonical Paper service; exchangeCalled=false.
19. **Paper 4-loss result** — PASS: no stop solely from consecutive-loss threshold.
20. **Paper 6-loss result** — PASS: risk stop triggered.
21. **Live risk threshold** — unchanged at 3; Paper threshold is 6.
22. **Stale Paper-state result** — PASS: new intended Paper session reset stale counters and did not false-stop.
23. **Telegram dedup result** — PASS: NORMAL→BLOCKED sent 1; repeated BLOCKED sent 0; recovery then BLOCKED sent 1 new; distinct breach independently alerted. Mock transport only.
24. **Tester journey** — PASS as a persisted chained journey on the rebuilt candidate: dashboard, Settings/provider status, Agent questions, strategy plan/approval/execution/report, reload with no stale approval, Results, Backtest, Paper lifecycle/risk view, Live/order refusal, SAFE refusal. Evidence-only parsers were corrected/continued; no application failure remained.
25. **Secret leak result** — 0 across Production full scans, journey DOM/network/browser scans, Settings responses, provider sanity, and server logs.
26. **Raw leak result** — 0 across Production full scans, Lifecycle primary answers, and final journey.
27. **Real-order result** — realOrderCount=0. No order tool ran; acceptance tool audits contain no Live/order invocation.
28. **Live activation result** — liveActivationCount=0; Lifecycle L passed all viewports with no Live runtime.
29. **SAFE verification** — params_hash `7893ca3f0e30`; SHA-256 `fb3f19169c8911fe041f3f8cb1d9e654f9166078f0c5cd8e29f04ec02a56dfc0`; git hash-object `4f4876335b2e6fae5d1f3aec20e3fd39c78b1c32`; protected diff empty; safeMutationCount=0.
30. **Any source changes made** — yes, one minimal P1 repair: pending-action recovery now treats successful execution/cancel as a history barrier, preventing older proposals from resurrecting after refresh. Added focused regression coverage. No SAFE, Live, or order code was changed.
31. **Any rebuild performed** — yes, exactly one post-fix Webpack rebuild; exit 0 in 23.9s, zero swap, no build warning/error output.
32. **Final BUILD_ID** — `-6CTCAJcZAMY02xezkvRO`.
33. **Remaining P0 blockers** — 0.
34. **Remaining P1 blockers** — 0.
35. **tester-readiness.json** — written with every mandatory field proven and `testerReady=true`.
36. **Tester decision** — external tester use can begin, Paper only.
37. **Approximate usage-saving actions** — reused valid NFT/root-cause/SAFE evidence; skipped Development 88, repeated stress/NFT/CSS investigations, redundant stability runs, and full lint; ran only invalidated heavy gates after the real source fix.
38. **Final verdict** — **REXTORA TESTER READY**.
