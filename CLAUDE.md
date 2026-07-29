# CLAUDE.md — Rextora Operating Constitution

This document is the permanent operating constitution for the Rextora project. Every session begins here. Every decision is measured against this document. This is not a style guide. This is the law.

---

## Rextora Mission

Rextora is NOT an auto trading bot.

Rextora is an **AI Trading Employee**.

Its purpose is to continuously research markets, discover strategies, validate them, explain evidence, report findings, assist decision making, and execute only after explicit human approval.

The execution engine already exists and is considered complete.

**Claude must never redesign or replace the execution engine.**

Claude's role is to improve the product around the engine — the research layer, the AI layer, the UI, the UX, the reporting, the explainability, and the validation pipeline.

The product succeeds when a trader can delegate all research and analysis to Rextora and receive a clear, evidence-backed recommendation that they approve or reject with full understanding. The trader remains in command. Rextora eliminates guesswork, not control.

---

## Product Vision

The long-term workflow is a sequential pipeline. Every stage is intentional. No stage may be skipped.

```
Market
  ↓
Research
  ↓
Strategy Discovery
  ↓
Backtest
  ↓
Paper Trading
  ↓
Report
  ↓
Approval
  ↓
Live Execution
  ↓
Continuous Improvement
```

This pipeline defines the product. Every feature, screen, and AI capability maps to one or more stages in this pipeline. When building or reviewing a feature, identify which stage it belongs to and ensure it advances that stage without overstepping into a later one.

The product should feel closer to **ChatGPT, TradingView, Cursor, and Linear** than to a traditional trading application. These are the reference products. Study their interaction patterns, information hierarchy, navigation speed, and visual clarity before making design decisions.

---

## Core Principles

These are non-negotiable. They apply to every line of code, every UI decision, every AI response, and every architectural change.

**Never modify the SAFE strategy.**
The SAFE strategy is a protected baseline. It must not be altered under any circumstances without a separate explicit instruction that references this rule by name and overrides it for a specific, documented reason.

**Never change execution logic without evidence.**
Changes to how trades are entered, exited, sized, or managed require measurable evidence — backtest data, trade logs, or documented analysis. Opinion is not evidence. Preference is not evidence.

**Never fabricate trading performance.**
AI must never generate, estimate, extrapolate, or hallucinate performance metrics. All displayed metrics must be derived from real backtest or live data with a clear data source. If data is unavailable, display a clear unavailable state — not a placeholder number.

**Never bypass approval.**
No trade, strategy activation, or live execution may occur without an explicit, logged human approval step. The approval gate is a product requirement, not a UX detail. It must never be streamlined away.

**Never enable live trading automatically.**
Live trading mode must require a deliberate, unambiguous action from the user — never an automatic state transition, background process, or progressive activation.

**Never weaken validation.**
Backtest validation rules, pattern detection rules, and strategy evaluation criteria must only become more rigorous over time. Loosening a validation rule to make more trades appear valid is never acceptable.

**Always preserve backward compatibility.**
Existing strategies, saved backtests, and stored results must remain readable and usable after any update. Never introduce a breaking change to stored data formats without a migration path.

**Always keep deterministic behaviour.**
The same inputs must always produce the same outputs. Random elements in strategy evaluation, pattern detection, or trade simulation are not permitted unless they are seeded and reproducible.

---

## Project Architecture

The execution engine is immutable unless Claude receives an explicit, specific instruction to modify it that references this rule and provides a documented reason. When in doubt, do not touch the execution engine.

The AI layer is a **Control Plane** — it observes, analyses, recommends, and routes decisions. It does not execute.

Execution remains independent of the AI layer. The Execution Adapter is the only legal interface between the AI Control Plane and the Execution Engine.

```
UI
  ↓
AI Control Plane
  ↓
Policy Engine
  ↓
Approval Layer
  ↓
Execution Adapter
  ↓
Execution Engine
  ↓
Evidence Collector
  ↓
Report Generator
```

Each layer has a single responsibility. No layer may reach past the next layer. The UI communicates with the AI Control Plane only. The AI Control Plane communicates with the Policy Engine only. The Policy Engine communicates with the Approval Layer only. This separation is enforced by design, not convention.

When adding a new feature, identify which layer it belongs to before writing any code. If a feature spans multiple layers, identify the boundary and implement each side of the boundary independently.

---

## Design Principles

Every screen, component, and view must satisfy all of the following criteria before it is considered complete:

**Professional** — The product must look like it belongs next to Bloomberg Terminal, TradingView Pro, and institutional-grade tools. No amateur colour choices, no crowded layouts, no inconsistent spacing.

**Minimal** — Show only what is necessary. If a piece of information is not actionable or informative, it should not be on the screen. Whitespace is a design element, not wasted space.

**Readable** — Text must be legible at a glance. Hierarchy must be immediately obvious. The most important information must dominate the screen. Secondary information must visually recede.

**Fast** — Interactions must feel instant. Transitions must be purposeful and brief. No skeleton screens that linger. No loading states that block interaction unnecessarily.

**Modern** — Visual language must be current. Reference Vercel, Linear, Raycast, and Notion for interaction patterns, typography, and component design.

**Consistent** — Spacing, colour, typography, component behaviour, and interaction patterns must be identical across every screen. A button is a button everywhere. A card is a card everywhere.

**Premium** — The product must feel expensive. This is not achieved through decoration but through precision, density, and detail.

**Dark-first** — All screens are designed for dark mode. Light mode is a secondary concern and must not degrade the dark-mode experience.

**Responsive** — All screens must work at standard desktop resolutions. Components must not overflow or collapse unexpectedly.

**Large typography** — Key metrics, prices, and labels must be large enough to read at a glance without squinting. Use scale deliberately.

**High information hierarchy** — The user's eye must travel from most important to least important naturally. Use size, weight, colour, and position to enforce hierarchy.

**Low cognitive load** — The user must never need to think about where to find something or what an element does. Clarity is the highest form of design intelligence.

**No developer-looking screens.** Raw JSON, debug output, internal IDs, and technical state dumps must never appear in the production UI. If a screen looks like it was built for a developer to debug, it must be redesigned before it is considered done.

---

## UX Rules

**Always reduce clicks.** Every additional click is a tax on the user. Before finalising any flow, count the clicks and ask whether any can be eliminated.

**Avoid long forms.** Forms with more than five fields must be broken into steps, collapsed into progressive disclosure, or eliminated in favour of smarter defaults.

**Collapse advanced settings.** Default views show the most important controls only. Advanced settings are available but hidden behind an explicit reveal. Never expose complexity to users who have not asked for it.

**Show beginner mode first.** The default experience must be approachable. Expert features must be discoverable but not dominant.

**Expert settings remain available.** Power users must be able to access full configuration without leaving the product. Never remove depth in the name of simplicity.

**Every important action must have a preview.** Before a backtest runs, show what will run. Before a strategy is applied, show what it will do. Before a report is generated, show the scope. Surprises are a UX failure.

**Every destructive action requires confirmation.** Deleting a strategy, removing a backtest, clearing history, or disabling a running process requires an explicit confirmation step. The confirmation must describe exactly what will be deleted or changed. It must not be skippable.

---

## Pattern Engine Principles

The pattern engine supports a growing library of configurable pattern definitions. The following patterns are in scope:

- Order Block
- Fair Value Gap
- Trendline
- Support
- Resistance
- Supply
- Demand
- Liquidity
- Structure
- Swing

**Every pattern must support:**

- Configurable detection rules — the criteria that identify the pattern on a chart
- Validation rules — the criteria that confirm the pattern is tradeable
- Entry rules — the criteria that trigger an entry when the pattern is valid
- Invalidation rules — the criteria that cancel a pattern after it has been detected
- Weighting — a numeric weight used in voting and scoring systems
- Priority — a ranking used in priority chain resolution
- Mandatory / optional mode — whether the pattern must be present for a strategy to trigger, or whether it contributes without being required

**Pattern combinations must support:**

- AND — all patterns must be present
- OR — any pattern must be present
- SEQUENCE — patterns must appear in a defined order within a defined time window
- Weighted voting — patterns contribute scores and a threshold must be reached
- Priority chain — patterns are evaluated in priority order and the first match wins
- Nested combinations — combinations of combinations, allowing complex strategy logic to be expressed cleanly

When adding a new pattern type, implement all of the above capabilities from the start. A pattern that only supports detection but not validation, invalidation, or weighting is incomplete and must not be considered done.

---

## Order Block Standard

Order blocks are a core pattern type with specific requirements that govern both detection and visualisation.

**Body-based zones are preferred.** Order block zones are calculated from candle bodies, not from full high-low ranges. Wick-only zones are inaccurate and must not be used as the default basis.

**Do not use oversized wick-only zones.** Zones that extend to the full candle wick without a body filter produce zones that are too large to be actionable and must not be the default.

**Configurable parameters that must be supported:**

- Body percentage — the minimum percentage of the candle that must be body (not wick) for the candle to qualify as an order block origin
- Impulse filter — whether the order block must be followed by an impulsive move to be valid
- Minimum body ratio — the minimum ratio of the order block candle's body to its total range
- Engulfing filter — whether the subsequent candle must engulf the order block candle
- Mitigation percentage — the percentage of the zone that may be entered before the zone is considered mitigated
- Retest depth — how deep into the zone price may enter on retest before the zone is invalidated
- Confirmation candles — the number of confirming candles required before the zone is considered active
- Invalidation — the criteria that mark an order block as no longer valid

**Visualisation requirements:**

- The visualisation must always match the execution logic precisely. If the engine uses body-based zones, the chart must draw body-based zones.
- Never display zones that differ from what the engine actually uses for decision-making.
- Zone boundaries must be computed by the same function used for trade execution, not by a separate display calculation.
- Visual zone colour, opacity, and labelling must be consistent with the broader design system.

---

## Chart Principles

The chart is the primary source of truth. Everything drawn on the chart is a statement of fact about what the engine has detected, decided, or acted upon.

**Never draw debugging text on the chart.** Internal event names, variable dumps, object references, and log-style messages must never appear on the chart in production.

**Never draw raw internal event logs.** Events from the backtest engine, pattern engine, or strategy evaluator must be translated into user-friendly annotations before display.

**Display only user-friendly annotations.** Every element drawn on the chart must have a clear, user-visible purpose. If a developer cannot explain what an annotation means to a non-technical user in one sentence, the annotation must not be shown.

**Every annotation must have a purpose.** The following annotation types are in scope and must be drawn consistently with their corresponding engine decisions:

- Order Blocks — drawn as zones, must match engine zone boundaries exactly
- Fair Value Gaps — drawn as shaded regions, must match engine gap boundaries exactly
- Trendlines — drawn as lines, must match engine trendline calculations exactly
- Support and Resistance — drawn as horizontal lines or zones
- Supply and Demand — drawn as zones
- Entries — drawn as markers at the exact price and time of entry
- Stops — drawn as horizontal lines at the stop-loss price
- Targets — drawn as horizontal lines at the take-profit price
- Retests — marked at the candle where price re-entered a zone
- Confirmations — marked at the candle that confirmed a pattern
- Invalidations — marked at the candle that invalidated a pattern

All of these must reflect the same data the engine uses. The chart is not a visualisation layer that approximates engine decisions. The chart is an exact representation of engine decisions.

---

## Backtest Principles

Backtest results are the product's most critical output. They must be reliable, persistent, and navigable.

**Backtest must survive navigation.** If a user navigates away from a running or completed backtest and returns, the backtest must be exactly as they left it. Nothing may be lost or reset by navigation.

**Backtest state must persist.** The selected strategy, date range, parameter configuration, and result set must all persist across page reloads, tab switches, and browser restarts.

**Charts must reopen correctly.** If a user opens a chart for a specific trade, navigates away, and returns, the chart must reopen at the same trade with the same view state.

**Trade selection must restore.** The selected trade in a result list must persist across navigation. Returning to a result list must not clear the user's selection.

**Scroll position should remain.** Long result lists must preserve scroll position across navigation where technically feasible.

**History should remain.** Past backtest runs must remain accessible in the session. The user must be able to return to a previous backtest without rerunning it.

---

## Performance

**Avoid unnecessary rendering.** Components must not re-render when their inputs have not changed. Use memoisation, stable references, and selector optimisation to prevent cascade re-renders.

**Avoid duplicate requests.** The same data must not be fetched multiple times within a single user interaction. Use caching, deduplication, and request management to ensure each piece of data is fetched once.

**Cache expensive operations.** Pattern detection, backtest calculations, and chart annotation generation are expensive. Results must be cached at an appropriate layer and invalidated only when inputs change.

**Use optimistic navigation where safe.** Navigation between views must feel instant. Where the destination view's data is already available, navigate immediately and load in the background. Where data is not available, show a minimal loading state that does not block interaction.

**Keep navigation responsive.** No navigation action should produce a perceptible delay. If loading is required, the UI must remain interactive during loading. Never block the entire screen to fetch data.

---

## AI Principles

The AI layer is a trusted research assistant, not an oracle. It operates within strict epistemic boundaries.

**AI never invents facts.** The AI layer must never generate, infer, or fabricate market data, performance metrics, historical prices, or trade outcomes. Every fact displayed in an AI response must be derived from a real data source.

**AI separates three categories clearly:**

- **Verified Facts** — data derived directly from real sources, clearly labelled with the source and time
- **Interpretation** — the AI's analysis of verified facts, clearly labelled as interpretation
- **Recommendations** — the AI's suggested actions or conclusions, clearly labelled as recommendations and clearly separated from facts

**Always display evidence.** AI recommendations must be accompanied by the specific facts and interpretations that support them. A recommendation without evidence is not a valid AI output.

**Never present opinions as facts.** Phrases like "this strategy is likely to perform well" or "the market is showing bullish momentum" must always be clearly labelled as interpretation, not fact. The UI must enforce this distinction visually if the AI does not enforce it textually.

---

## Testing Loop

Claude should continuously perform the following loop without being prompted. When a task is complete, the next iteration of the loop begins immediately. The loop never terminates while the product exists.

1. **Understand project** — Read CLAUDE.md and any updated documentation. Verify understanding of the current state of the product.
2. **Review architecture** — Confirm that recent changes are consistent with the architecture defined in this document.
3. **Run lint** — Identify and fix all linting errors before proceeding.
4. **Run tests** — Identify and fix all failing tests before proceeding.
5. **Run build** — Confirm the production build succeeds without errors or warnings.
6. **Open browser** — Navigate to the running application in a browser.
7. **Use the application** — Exercise the primary user flows from the perspective of a trader, not a developer.
8. **Find UX issues** — Identify anything that feels unfinished, slow, confusing, inconsistent, or below production quality.
9. **Improve UX** — Address the most impactful issue identified. Apply the design principles and UX rules in this document.
10. **Improve performance** — Identify and address any rendering, loading, or request performance issues.
11. **Improve readability** — Identify and address any code that is harder to understand than it needs to be.
12. **Improve consistency** — Identify and address any visual or behavioural inconsistencies across screens.
13. **Repeat** — Return to step 1.

The loop exists because production quality is not a destination. It is a maintained standard. The product degrades without continuous attention.

---

## Success Criteria

The product is not complete until it feels like the following products in terms of their respective strengths:

- **ChatGPT** — conversation quality, evidence presentation, and reasoning clarity
- **TradingView** — chart fidelity, annotation precision, and data integrity
- **Cursor** — AI integration depth, workflow fluency, and developer-grade reliability
- **Linear** — navigation speed, keyboard-first interaction, and information density
- **Raycast** — command speed, discoverability, and zero-friction access to everything
- **Notion** — documentation clarity, structured content presentation, and flexibility
- **Vercel** — deployment confidence, status visibility, and professional polish

When a screen, feature, or flow feels unfinished, Claude must continue improving it. The bar is not "working." The bar is not "acceptable." The bar is production quality by the standards of the reference products above.

**Never stop at "working." Stop only when it feels production quality.**

---

## AI Agent Roadmap

The AI Trading Employee is built in phases. Each phase unlocks the next. No phase may be skipped. No later phase may be activated before an earlier phase is fully implemented, tested, and validated.

**Phase 1 — Read-only assistant**
The AI can read market data, strategy definitions, and backtest results. It can answer questions, explain patterns, and describe what it observes. It cannot initiate any action.

**Phase 2 — Research assistant**
The AI can search for patterns, analyse historical data, and generate research reports. It can propose strategy ideas with supporting evidence. It cannot evaluate strategies or run backtests autonomously.

**Phase 3 — Strategy planner**
The AI can generate complete strategy definitions from research findings. It can compare candidate strategies and rank them by evidence quality. It can present a strategy plan for human review and approval before backtest.

**Phase 4 — Approval assistant**
The AI can explain a strategy's backtest results in plain language, highlight risks, and provide a structured recommendation for or against advancing to paper trading. All recommendations require explicit human approval.

**Phase 5 — Paper automation**
The AI can manage paper trading runs autonomously within approved parameters, collect results, detect anomalies, and generate progress reports. Live funds are never touched in this phase.

**Phase 6 — Live execution assistant**
The AI can propose live trades based on strategy signals and present them for approval. Upon approval, it routes the approved trade to the Execution Adapter. It monitors the trade and reports results.

**Phase 7 — Full AI Trading Employee**
The AI manages the full research-to-execution pipeline with human oversight at defined checkpoints. It continuously improves strategies based on evidence, surfaces market opportunities, and maintains a living record of all decisions and outcomes.

**Never skip phases. Never bypass approval.**

---

## Product Philosophy

The goal is not to automate trading.

The goal is to **eliminate emotional trading** by replacing manual research with evidence-driven AI assistance.

Human traders lose money not because they lack intelligence but because research is exhausting, decisions are stressful, and emotions override analysis at the worst possible moments. Rextora solves this by doing all the work that causes those problems — the research, the pattern detection, the backtesting, the comparison, the reporting — and presenting the trader with a clear, evidence-backed decision to approve or reject.

The trader's role is not eliminated. It is elevated. Rextora handles the labour. The trader handles the judgement.

Every improvement to this product must move it toward becoming the world's best AI Trading Employee. Every screen, every feature, every AI capability, every piece of data, and every line of code exists to serve that goal.

If a change does not make the product a better AI Trading Employee, it must be reconsidered.

If a change makes the product feel more like a bot and less like an employee, it must be reverted.

If a change makes the product feel more finished, more professional, more trustworthy, and more useful to a real trader — it belongs here.
