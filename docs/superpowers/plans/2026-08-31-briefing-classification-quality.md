# Briefing Classification and Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deterministically classify briefing topics, suppress near-duplicate repetition, assign honest trust/freshness states, and promote only recurring community patterns.

**Architecture:** Put portable editorial rules in a shared module used by Node and Worker. Keep exact evidence and publisher identity from PR 1, enrich topics after clustering, and carry a bounded rolling topic history for recurrence.

**Tech Stack:** Node ESM, Cloudflare Worker TypeScript, Node test runner, existing shared evidence contract.

---

### Task 1: Classification and trust rules

**Files:**
- Create: `shared/briefing-quality.mjs`
- Create: `server/briefing-quality.test.mjs`
- Modify: `src/types.ts`

- [ ] Write failing table tests for all five content types, primary-only `reported`, two-publisher `confirmed`, expired promotions, and content-specific freshness boundaries.
- [ ] Verify RED with `node --test server/briefing-quality.test.mjs`.
- [ ] Implement `classifyContent`, `claimStatusFor`, `freshnessFor`, and `enrichTopic` without model calls.
- [ ] Add optional `lastVerifiedAt`, `priceKeys`, and `recurrence` topic types while keeping legacy reports valid.
- [ ] Run focused tests and commit.

### Task 2: Conservative near-duplicate handling

**Files:**
- Modify: `shared/briefing-quality.mjs`
- Modify: `server/briefing-quality.test.mjs`
- Modify: `server/pipeline.mjs`
- Modify: `server/pipeline.test.mjs`

- [ ] Write tests showing markup/case copies collapse, high-overlap items from one publisher collapse, and similar items from different publishers remain independent cluster evidence.
- [ ] Verify current code fails the within-publisher near-duplicate case.
- [ ] Implement normalized token sets and a conservative Jaccard threshold; use it only for within-publisher suppression.
- [ ] Integrate before clustering while preserving PR 1 exact-copy attribution and evidence selection.
- [ ] Run pipeline and quality tests and commit.

### Task 3: Rolling recurrence

**Files:**
- Modify: `shared/briefing-quality.mjs`
- Modify: `server/briefing-quality.test.mjs`
- Modify: `server/report-service.mjs`
- Modify: `server/report-service.test.mjs`

- [ ] Write failing tests for stable topic fingerprints, seven-day history, unique-author/publisher counts, multi-day observation, and rejection below the 3-author/2-publisher/2-day threshold.
- [ ] Verify RED.
- [ ] Implement bounded history records and recurrence aggregation from evidence; no model-provided counts.
- [ ] Enrich Node topics using previous reports and retain at most 30 days of compact history.
- [ ] Run server tests and commit.

### Task 4: Worker parity and imported-report safety

**Files:**
- Modify: `cloudflare/worker.ts`
- Modify: `cloudflare/worker.test.mjs`

- [ ] Write Worker parity tests for classification, status, freshness, near duplicates, recurrence, and preservation of optional fields through `normalizeReport`.
- [ ] Verify RED before integration.
- [ ] Reuse the shared quality module, carry compact history in the latest report, and ensure model summaries may change only title/summary—not evidence, status, counts, or prices.
- [ ] Run Worker tests, full `pnpm --ignore-workspace test`, and `pnpm --ignore-workspace build`; commit only after both pass.
