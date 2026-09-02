# Official AI Sources and Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collect allowlisted official AI updates and retain trustworthy KRW/USD price observations without weakening per-source failure isolation.

**Architecture:** Add dependency-free shared catalog, feed parser, and price-history modules. Node and Cloudflare adapters consume the same catalog and attach observations to reports; pricing parsers use recorded fixtures and fail closed when required values disappear.

**Tech Stack:** Node ESM, Cloudflare Worker TypeScript, built-in `fetch`, Node test runner, pnpm/Vite.

---

### Task 1: Define catalog and feed parsing

**Files:**
- Create: `shared/official-source-catalog.mjs`
- Create: `shared/official-source-parsers.mjs`
- Create: `server/official-source-parsers.test.mjs`
- Create: `server/fixtures/official/release-feed.xml`

- [ ] Write tests proving an allowlisted Atom/RSS item becomes a normalized message, old items are excluded, unknown catalog IDs are rejected, and redirects/private URLs cannot be supplied by runtime config.
- [ ] Run `node --test server/official-source-parsers.test.mjs` and confirm missing-module failures.
- [ ] Implement `getOfficialSource(id)`, `listOfficialSources(ids)`, and `parseOfficialFeed(source, body, since)` with catalog-owned URL, publisher, trust, and parser metadata.
- [ ] Re-run the focused test and commit the green contract.

### Task 2: Define price observations and history

**Files:**
- Create: `shared/price-snapshots.mjs`
- Create: `server/price-snapshots.test.mjs`
- Create: `server/fixtures/official/pricing-us.html`
- Create: `server/fixtures/official/pricing-kr.html`

- [ ] Write failing tests for USD decimal-to-minor conversion, KRW integer handling, stable keys, same-value verification updates, two-value history, region/period separation, promotions, and missing-KRW fail-closed behavior.
- [ ] Run the focused test and verify RED failures are about missing behavior.
- [ ] Implement `normalizePriceObservation`, `priceObservationSignature`, and `mergePriceSnapshots(previous, observed)`; keep only two distinct values per key.
- [ ] Add catalog-selected pricing parsers that return `{ observations, warnings }` and throw on zero required plans.
- [ ] Re-run focused tests and commit.

### Task 3: Integrate Node collection

**Files:**
- Modify: `server/adapters.mjs`
- Modify: `server/report-service.mjs`
- Modify: `server/report-service.test.mjs`
- Modify: `server/source-config.mjs`
- Modify: `server/source-config.test.mjs`

- [ ] Write tests for official feed messages, price observations in the report, `ok/partial/error` source runs, and survival of other sources after parser/network failure.
- [ ] Verify the tests fail before integration.
- [ ] Add official adapters selected only by catalog ID. Normalize source-run fields to include `sourceId`, `source`, `kind`, `status`, `count`, `checkedAt`, warnings, and a safe error.
- [ ] Merge price observations against the previous report without treating old/new prices as independent corroboration.
- [ ] Run all server tests and commit.

### Task 4: Integrate Cloudflare collection

**Files:**
- Modify: `cloudflare/worker.ts`
- Modify: `cloudflare/worker.test.mjs`
- Modify: `wrangler.jsonc`
- Modify: `.env.example`

- [ ] Write Worker tests using stubbed fetch bodies for official messages, partial pricing, previous-price inheritance, and one-source failure isolation.
- [ ] Verify focused Worker tests fail.
- [ ] Parse allowlisted catalog IDs from public configuration, collect each independently, and merge `priceSnapshots` from the prior `latest` report.
- [ ] Preserve all PR 1 evidence rules and never log response bodies or secrets.
- [ ] Run Worker tests, full `pnpm --ignore-workspace test`, and `pnpm --ignore-workspace build`; commit only after both pass.
