# Signalroom Next Phase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely integrate the existing AI-briefing PR chain, make recurring community signals work across Worker runs, and validate real official pricing/update coverage before adding more sources.

**Architecture:** Treat the already-pushed PR chain as the source of truth and merge it in order (#2 → #3 → #4 → #5). Do not cherry-pick the conflicted Claude rehearsal worktree. After integration, make the Cloudflare Worker retain a bounded history record, then expand only verified official pricing/discount sources. Keep fixture tests, live endpoint checks, browser checks, and deployment approval as separate gates.

**Tech Stack:** GitHub PRs, pnpm 10.17.1, Node ESM test runner, Cloudflare Worker/KV, Vite/React/TypeScript, Wrangler.

---

## Current baseline and non-negotiable boundaries

- Repository: /Users/sungha/signalroom.
- main: 22fe8ae, equal to origin/main; it has no briefing feature changes.
- PRs #2–#5 are open, mergeable, and their local heads equal their remote heads.
- Final feature head: feat/briefing-ui at f44bbc6.
- The four requested editorial lanes already exist in the feature chain: product updates, pricing/offers, setup tips, and community patterns.
- /private/tmp/claude-501/.../sr-rehearse4 has staged changes and an unresolved src/types.ts index conflict. It is a rehearsal artifact, not an input branch.
- /Users/sungha/signalroom/.claude/launch.json is untracked local launch configuration. Preserve it, but never add it to a feature commit.
- No live deployment, live crawl, or browser rendering is considered proven by unit tests or a successful build alone.

## Parallelization rule

Run these read-only checks in parallel:

1. GitHub CI and PR metadata for #2–#5.
2. Worker /api/health and /api/report response inspection.
3. Status/diff inspection of the two Claude rehearsal worktrees.

All writes remain sequential. In particular, never rebase or merge two stacked branches at the same time, and never edit the conflicted rehearsal worktree while the canonical PR chain is being integrated.

---

### Task 1: Freeze the integration baseline

**Files:**
- Read only: /Users/sungha/signalroom/.git, all linked worktrees, GitHub PR metadata.

- [ ] **Step 1: Confirm the canonical worktree and branch heads.**

Run:

~~~bash
git -C /Users/sungha/signalroom status --short --branch
git -C /Users/sungha/signalroom worktree list
git -C /Users/sungha/signalroom branch -vv
~~~

Expected: main is at 22fe8ae; each feat/* branch is clean and tracks the same-named origin/feat/* branch; no branch points at sr-rehearse4.

- [ ] **Step 2: Check all stacked PRs without changing them.**

Run:

~~~bash
for pr in 2 3 4 5; do
  gh pr view "$pr" --repo dumbmetal/signalroom --json number,state,headRefName,baseRefName,mergeable,statusCheckRollup,url
done
~~~

Expected: each PR is OPEN, its base is the preceding branch (main for #2), and no required check is failing. If a check is pending, wait; do not compensate with a local merge.

- [ ] **Step 3: Re-run the final branch gates before any merge.**

Run from /Users/sungha/.config/superpowers/worktrees/signalroom/feat-briefing-ui:

~~~bash
pnpm --ignore-workspace test
pnpm --ignore-workspace build
~~~

Expected: all server, Worker, and browser view-model tests pass and both TypeScript/Vite builds pass. Record the exact counts and commit hash in the merge checklist; do not claim live behavior from this result.

- [ ] **Step 4: Mark the rehearsal worktree as excluded.**

Record these facts in the handoff/PR notes: sr-rehearse is a clean unpushed rehearsal branch, sr-review is a clean detached review snapshot, and sr-rehearse4 has an unresolved src/types.ts index conflict. Do not cherry-pick, reset, delete, or resolve those paths in this phase.

---

### Task 2: Integrate PRs #2–#5 in order

**Files:**
- Modify only through GitHub merge operations: PR #2, then #3, then #4, then #5.
- Preserve local-only /Users/sungha/signalroom/.claude/launch.json.

- [ ] **Step 1: Merge PR #2 only after its checks and review are green.**

Use the GitHub merge action for PR #2 with a merge commit. Keep the source branch until all downstream stacked PRs are merged so their base references remain inspectable.

- [ ] **Step 2: Refresh main and validate the new base.**

Run:

~~~bash
git -C /Users/sungha/signalroom switch main
git -C /Users/sungha/signalroom pull --ff-only
pnpm --ignore-workspace test
pnpm --ignore-workspace build
~~~

Expected: fast-forwarded local main, no unexpected tracked changes, and the PR #2 test/build gates still pass.

- [ ] **Step 3: Merge PR #3, then repeat the refresh and gates.**

Do not change the base manually if GitHub keeps the stacked relationship intact. If GitHub requires retargeting, retarget #3 to the new main only after checking that its diff contains only official-source and pricing work.

- [ ] **Step 4: Merge PR #4, then repeat the refresh and gates.**

Confirm that content classification, conservative near-duplicate handling, recurrence metadata, and trust/freshness rules remain present after the merge.

- [ ] **Step 5: Merge PR #5 last, then run the complete integrated gates.**

Run:

~~~bash
pnpm --ignore-workspace test
pnpm --ignore-workspace build
git -C /Users/sungha/signalroom diff --check origin/main...HEAD
~~~

Expected: the four-lane UI and offline/source-health behavior are on main, all tests/builds pass, and diff --check is clean. Do not delete feature branches until the integrated checks and human review are complete.

---

### Task 3: PR #6 — Persist Worker history for real recurrence

**Goal:** Make repeated community opinion use multiple days of Worker history instead of only the latest report.

**Files:**
- Modify: cloudflare/worker.ts
- Modify: cloudflare/worker.test.mjs
- Modify: shared/briefing-quality.mjs only if a small adapter is required to consume the bounded history envelope

- [ ] **Step 1: Add a failing test for cross-day recurrence.**

Create a Worker KV stub containing a prior report from day 1 and a current crawl from day 2. Assert that a topic with at least three distinct authors, two independent publishers, and two observation days is promoted to community_opinion with a recurrence window. Assert that the same topic on one day remains unpromoted.

- [ ] **Step 2: Add failing retention and failure-isolation tests.**

Test that the stored history is capped at 30 days, an absent/corrupt history value falls back to an empty history, and a failed source run does not erase prior reports or prior price snapshots.

- [ ] **Step 3: Implement a bounded KV history envelope.**

Use one dedicated KV value, for example:

~~~ts
type HistoryEnvelope = {
  reports: Array<{
    date: string
    generatedAt: string
    topics: unknown[]
    priceSnapshots?: unknown[]
  }>
}
~~~

On crawl, read and safely parse the envelope, pass all retained reports to topicHistoryFromReports, prepend the new report after topic construction, keep the newest 30 report dates, and write the envelope with a finite TTL. Keep latest as the public report key and never expose the history key through the public API.

- [ ] **Step 4: Preserve current report semantics.**

Continue using the existing isReportableTopic threshold, evidence-derived counts, and mergePriceSnapshots. A model summary may not create history entries, authors, publishers, prices, or trust states.

- [ ] **Step 5: Run the focused and full gates.**

Run:

~~~bash
node --test --experimental-strip-types cloudflare/worker.test.mjs
pnpm --ignore-workspace test
pnpm --ignore-workspace build
~~~

Expected: cross-day recurrence tests pass, existing source-failure and imported-report tests remain green, and the build has no new type errors.

- [ ] **Step 6: Commit PR #6.**

Commit message:

~~~text
feat: persist bounded worker briefing history
~~~

Open one PR against main; do not combine it with new pricing sources.

---

### Task 4: PR #7 — Expand verified pricing and discount coverage

**Goal:** Cover the requested ChatGPT/Claude/local-LLM pricing and offers without inventing KRW conversions or trusting arbitrary pages.

**Files:**
- Modify: shared/official-source-catalog.mjs
- Modify: shared/official-source-parsers.mjs
- Modify: shared/price-snapshots.mjs
- Create: server/fixtures/official/pricing-claude-kr.html
- Create: server/fixtures/official/pricing-local-llm.html
- Modify: server/official-source-parsers.test.mjs
- Modify: server/price-snapshots.test.mjs
- Modify: .env.example
- Modify: wrangler.jsonc only for public catalog IDs

- [ ] **Step 1: Inventory missing official surfaces before editing the catalog.**

Compare the current catalog against these required families: ChatGPT, Claude, and local-LLM tooling. Add a source only when its current official URL, publisher identity, region/currency behavior, and parser shape can be verified. If a vendor has no official paid plan or discount page, leave it out and record the absence rather than creating a synthetic price.

- [ ] **Step 2: Write fixture tests before adding each source.**

For every new source, test: one valid observation, unchanged value updating lastVerifiedAt, a changed value producing a before/now pair, an explicit promotion end date, zero required plans failing closed, and a redirect/private-host rejection. Assert that USD and KRW, billing period, and unit never compare with one another.

- [ ] **Step 3: Add only catalog-owned source metadata.**

Each catalog entry must provide id, kind, canonical URL, allowed redirect hosts, publisherId, independenceKey, trustTier, parser key, and explicit pricing dimensions. Runtime config contains IDs only; URLs, tokens, cookies, and response bodies never enter .env, KV, logs, or error strings.

- [ ] **Step 4: Represent discounts as observations, not community claims.**

Use the existing promotion shape (kind, label, optional original amount and end time). A discount without an explicit official end date is displayed as an offer with unknown expiry; it is not converted into a permanent price change. Never derive KRW from USD using an exchange rate.

- [ ] **Step 5: Run the complete parser and integration gates.**

Run:

~~~bash
node --test --experimental-strip-types server/official-source-parsers.test.mjs server/price-snapshots.test.mjs
pnpm --ignore-workspace test
pnpm --ignore-workspace build
~~~

Expected: all fixtures and both runtimes agree on the same price keys, source statuses, and failure behavior.

- [ ] **Step 6: Commit PR #7.**

Commit message:

~~~text
feat: expand verified ai pricing coverage
~~~

Keep source additions separate from Worker history so a pricing parser regression can be reverted independently.

---

### Task 5: Live and browser acceptance gate — no automatic release

**Files:**
- Modify only the smallest file necessary when a verified defect is found.
- Record evidence in the relevant PR or handoff note; do not add live responses or credentials to the repository.

- [ ] **Step 1: Check the deployed Worker health and report shape.**

Run without credentials:

~~~bash
curl -fsS https://signalroom-crawler.wbvcos.workers.dev/api/health
curl -fsS https://signalroom-crawler.wbvcos.workers.dev/api/report
~~~

Check separately: HTTP success, JSON shape, sourceRuns status coverage, evidence URLs, price dimensions, and whether all four lanes have real or explicitly empty content. A 404/no-crawl response is a deployment/data blocker, not a test failure to hide.

- [ ] **Step 2: Run a controlled crawl only with already-configured secrets.**

Use the existing authenticated operational path; never paste or print tokens. Confirm that one official-source failure produces partial/error for that source while other topics and prices remain.

- [ ] **Step 3: Verify the UI at desktop and mobile widths.**

Check the canonical main build at 1440px and 390px: fixed lane order, legacy lane, price before/now compatibility, recurrence counts, source-health warnings, saved-report fallback, keyboard expansion, visible focus, and no horizontal overflow. Confirm no raw response body, bearer token, cookie, or secret appears in the UI.

- [ ] **Step 4: Decide whether a defect needs a follow-up PR.**

Create a small fix PR only for a reproducible defect with a regression test. Do not add speculative source adapters or UI cards based on a single live response.

- [ ] **Step 5: Keep deployment as a separate approval.**

Only after CI, live response checks, browser checks, and human review are recorded should Wrangler deployment or branch cleanup be considered. No plan step above implies production deployment.

---

## Completion checklist

- [ ] PRs #2–#5 merged in order with a green gate after each merge.
- [ ] main contains no accidental .claude/launch.json, data store, credentials, or temporary worktree files.
- [ ] Worker recurrence is proven across at least two stored report dates.
- [ ] Official pricing/discount sources are fixture-tested, allowlisted, and dimension-safe.
- [ ] Four requested content lanes are populated only from evidence, or explicitly shown as empty.
- [ ] Fixture tests, full tests, TypeScript/Vite build, live endpoint checks, and browser checks are recorded as separate evidence.
- [ ] No production deployment or branch deletion occurs without explicit human approval.

## Self-review

- **Spec coverage:** The four requested content types are covered by the existing PR chain; this plan addresses the remaining Worker recurrence gap, official price/discount breadth, and real live/browser validation.
- **Placeholder scan:** No source is added by guessing a URL; the exact catalog and fixture gates define when a source may be added.
- **Type consistency:** The existing Topic, PriceObservation, SourceRun, BriefingReport, and topicHistoryFromReports contracts remain the interfaces for all follow-up work.
- **Risk check:** The conflicted Claude rehearsal worktree is explicitly excluded; all writes are serial and all external release actions remain approval-gated.
