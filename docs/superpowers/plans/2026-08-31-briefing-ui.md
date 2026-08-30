# Four-Lane Briefing UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the four AI briefing lanes with price, trust, recurrence, source-health, offline, mobile, and keyboard states while preserving Signalroom's editorial visual language.

**Architecture:** Normalize unknown API data into a typed view model, cache only valid reports, and split the current monolithic report rendering into focused components. The UI consumes optional backend fields and keeps legacy topics visible.

**Tech Stack:** React, TypeScript, CSS tokens, Node test runner for pure view-model tests, Vite.

---

### Task 1: Safe report view model

**Files:**
- Create: `src/briefing-view.ts`
- Create: `src/briefing-view.test.ts`
- Modify: `src/api.ts`

- [ ] Write failing tests for report validation, five-to-four lane mapping, legacy fallback, `source`/`sourceId` normalization, price-pair compatibility, malformed cache rejection, and missing source runs.
- [ ] Run `node --test --experimental-strip-types src/briefing-view.test.ts` and verify RED.
- [ ] Implement `normalizeLiveReport`, `groupBriefingTopics`, `priceChangeView`, `readCachedReport`, and `writeCachedReport` with a versioned cache key.
- [ ] Make `loadLiveReport` return the normalized type instead of `unknown[]` casts.
- [ ] Run focused tests and commit.

### Task 2: Four briefing sections and topic details

**Files:**
- Create: `src/components/BriefingSections.tsx`
- Create: `src/components/TopicRow.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

- [ ] Add view-model tests for stable lane ordering and accessible topic IDs before component work.
- [ ] Render Product updates, Pricing & offers, Setup tips, Community patterns, then Legacy signals.
- [ ] Show type, status, freshness, last verification, independent source count, compatible before/now prices, and recurrence counts without inventing absent data.
- [ ] Add `aria-expanded`, `aria-controls`, landmarks, visible focus, 44px mobile targets, and reduced-motion rules.
- [ ] Run tests and build, then commit.

### Task 3: Source health and offline fallback

**Files:**
- Create: `src/components/SourceHealth.tsx`
- Modify: `src/App.tsx`
- Modify: `src/api.ts`
- Modify: `src/styles.css`

- [ ] Write view-model tests for partial/error counts, safe error copy, last checked time, live success cache writes, and network-failure cache reads.
- [ ] Keep the last valid report on live-request failure and label it “Saved report” with its generated time.
- [ ] Show per-source attention without hiding the report; do not display raw response bodies.
- [ ] Run focused tests, full `pnpm --ignore-workspace test`, and `pnpm --ignore-workspace build`; commit.

### Task 4: Browser verification

**Files:**
- Modify only files above if a verified visual or interaction defect requires a fix.

- [ ] Run the app with deterministic fixture data.
- [ ] Check 1440px and 390px layouts, price wrapping, evidence expansion, and no horizontal overflow.
- [ ] Check keyboard Enter/Space expansion, focus visibility, semantic section headings, and reduced motion.
- [ ] Check partial-source failure, first price observation, stale/disputed/expired topics, legacy topics, and offline saved-report state.
- [ ] Re-run tests/build after any fix and record screenshots or concise browser evidence in the PR handoff.
