# Continuity checkpoint: signalroom-briefing-evidence-contract

**Status:** active

_created: 2026-08-31T00:50:03_

## Goal
Implement PR 1, an evidence-first contract for Signalroom briefing data, without adding new live sources or changing the user interface.

## Current contract
The briefing must preserve raw source provenance, distinguish source labels from independent publishers, and keep the existing rule that a confirmed topic needs evidence from two independent sources. Existing Telegram, Reddit, X, and Threads behaviour must remain compatible when no new metadata is configured. Pricing regions are confirmed as both Korea/KRW and United States/USD, but pricing collection belongs to PR 2.

## Decisions
- Work only in the linked worktree on branch feat/briefing-evidence-contract; main remains untouched.
- Add a portable shared JavaScript contract so the local Node pipeline and Cloudflare Worker calculate source identity consistently.
- Keep existing source labels for rendering; add stable sourceKey, publisherId, independenceKey, canonicalUrl, and contentHash as evidence metadata.
- Use independenceKey, not display source labels, to decide corroboration and confidence.
- Add content-type, trust-tier, and claim-status vocabulary now; do not classify legacy topics automatically.

## Blockers / open questions
- pnpm invokes an environment supply-chain hook that blocks on the ignored opencode-ai build script. opencode-ai is absent from this repository's package.json and pnpm-lock.yaml; the same failure happened before code changes and is tied to the parent /Users/sungha/node_modules plus pnpm allowBuilds policy. Direct Node tests pass; final pnpm test/build remain environment-blocked.

## Failures to avoid
- Do not count cross-posted copies as independent confirmation merely because their display source labels differ.
- Do not drop evidence URLs or make the UI require new optional metadata.
- Do not add live credentials, source lists, or pricing scraping in this PR.
- Do not write secrets or tokens into continuity files or tests.

## Next action
Hand off the committed PR 1 branch without pushing or opening a pull request. Before merge, obtain Vite/TypeScript production-build evidence in a clean environment or with explicit pnpm build-script approval.

## Verification
- Baseline direct Node command passed: node --test --experimental-strip-types server/*.test.mjs cloudflare/*.test.mjs (9 tests, 0 failures).
- PR 1 direct Node command passed: node --test --experimental-strip-types server/*.test.mjs cloudflare/*.test.mjs (20 tests, 0 failures).
- pnpm build blocked before compilation by ERR_PNPM_IGNORED_BUILDS for opencode-ai@1.18.25.

## Evidence
- Repository baseline: main at 22fe8ae3e7d92eab473ba0c6bd9952f59783387b, clean before worktree creation.
- PR 1 is committed locally as feat: add briefing evidence contract.
- Production worker currently uses 24-hour, lexical, source-label corroboration and stores only the latest report.
- RED tests observed before implementation: missing shared contract module; same-independence Node and Worker posts incorrectly produced one topic; missing source-config module.
- Independent review found evidence truncation could omit the second qualifying independent publisher and whitespace/case could split identities. Both runtimes now select one evidence item per independent publisher before extras; identity values normalize to nonblank lowercase keys, and API config rejects invalid identity metadata.
