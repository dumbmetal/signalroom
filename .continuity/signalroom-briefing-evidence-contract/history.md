# Continuity history: signalroom-briefing-evidence-contract


---
### checkpoint 2026-08-31T00:53:48

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
- pnpm invokes an environment supply-chain hook that blocks on the ignored opencode-ai build script. Direct Node tests pass; the final pnpm test/build attempt must be reported separately.

## Failures to avoid
- Do not count cross-posted copies as independent confirmation merely because their display source labels differ.
- Do not drop evidence URLs or make the UI require new optional metadata.
- Do not add live credentials, source lists, or pricing scraping in this PR.
- Do not write secrets or tokens into continuity files or tests.

## Next action
Write the detailed PR 1 plan, add a failing contract test, and run it before production implementation.

## Verification
Baseline direct Node command passed: node --test --experimental-strip-types server/*.test.mjs cloudflare/*.test.mjs (9 tests, 0 failures).

## Evidence
- Repository baseline: main at 22fe8ae3e7d92eab473ba0c6bd9952f59783387b, clean before worktree creation.
- Production worker currently uses 24-hour, lexical, source-label corroboration and stores only the latest report.


---
### checkpoint 2026-08-31T01:03:20

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
Review the PR 1 diff, run direct test and syntax verification, then attempt the project commands once for recorded evidence before committing the focused branch.

## Verification
- Baseline direct Node command passed: node --test --experimental-strip-types server/*.test.mjs cloudflare/*.test.mjs (9 tests, 0 failures).
- PR 1 direct Node command passed: node --test --experimental-strip-types server/*.test.mjs cloudflare/*.test.mjs (14 tests, 0 failures).
- pnpm build blocked before compilation by ERR_PNPM_IGNORED_BUILDS for opencode-ai@1.18.25.

## Evidence
- Repository baseline: main at 22fe8ae3e7d92eab473ba0c6bd9952f59783387b, clean before worktree creation.
- Production worker currently uses 24-hour, lexical, source-label corroboration and stores only the latest report.
- RED tests observed before implementation: missing shared contract module; same-independence Node and Worker posts incorrectly produced one topic; missing source-config module.


---
### checkpoint 2026-08-31T01:11:05

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
Commit the reviewed PR 1 changes on feat/briefing-evidence-contract. Do not push or open a pull request without a user request. A clean environment or explicit pnpm build-script approval is still needed for Vite/TypeScript production-build evidence.

## Verification
- Baseline direct Node command passed: node --test --experimental-strip-types server/*.test.mjs cloudflare/*.test.mjs (9 tests, 0 failures).
- PR 1 direct Node command passed: node --test --experimental-strip-types server/*.test.mjs cloudflare/*.test.mjs (20 tests, 0 failures).
- pnpm build blocked before compilation by ERR_PNPM_IGNORED_BUILDS for opencode-ai@1.18.25.

## Evidence
- Repository baseline: main at 22fe8ae3e7d92eab473ba0c6bd9952f59783387b, clean before worktree creation.
- Production worker currently uses 24-hour, lexical, source-label corroboration and stores only the latest report.
- RED tests observed before implementation: missing shared contract module; same-independence Node and Worker posts incorrectly produced one topic; missing source-config module.
- Independent review found evidence truncation could omit the second qualifying independent publisher and whitespace/case could split identities. Both runtimes now select one evidence item per independent publisher before extras; identity values normalize to nonblank lowercase keys, and API config rejects invalid identity metadata.
---
### checkpoint 2026-08-31T01:12:00

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
Hand off committed PR 1 (8e725a9) without pushing or opening a pull request. Before merge, obtain Vite/TypeScript production-build evidence in a clean environment or with explicit pnpm build-script approval.

## Verification
- Baseline direct Node command passed: node --test --experimental-strip-types server/*.test.mjs cloudflare/*.test.mjs (9 tests, 0 failures).
- PR 1 direct Node command passed: node --test --experimental-strip-types server/*.test.mjs cloudflare/*.test.mjs (20 tests, 0 failures).
- pnpm build blocked before compilation by ERR_PNPM_IGNORED_BUILDS for opencode-ai@1.18.25.

## Evidence
- Repository baseline: main at 22fe8ae3e7d92eab473ba0c6bd9952f59783387b, clean before worktree creation.
- Committed PR 1: 8e725a9 feat: add briefing evidence contract.
- Production worker currently uses 24-hour, lexical, source-label corroboration and stores only the latest report.
- RED tests observed before implementation: missing shared contract module; same-independence Node and Worker posts incorrectly produced one topic; missing source-config module.
- Independent review found evidence truncation could omit the second qualifying independent publisher and whitespace/case could split identities. Both runtimes now select one evidence item per independent publisher before extras; identity values normalize to nonblank lowercase keys, and API config rejects invalid identity metadata.

---
### checkpoint 2026-08-31T01:52:49

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
- None. The apparent pnpm blocker was traced to the parent `/Users/sungha/pnpm-workspace.yaml`; `--ignore-workspace` isolates Signalroom and uses its frozen lockfile without changing global build approvals.

## Failures to avoid
- Do not count cross-posted copies as independent confirmation merely because their display source labels differ.
- Do not drop evidence URLs or make the UI require new optional metadata.
- Do not add live credentials, source lists, or pricing scraping in this PR.
- Do not write secrets or tokens into continuity files or tests.

## Next action
Finish the independent read-only review, address any important finding, then commit the review follow-up on the existing PR 1 branch without pushing or opening a pull request.

## Verification
- Baseline direct Node command passed: node --test --experimental-strip-types server/*.test.mjs cloudflare/*.test.mjs (9 tests, 0 failures).
- PR 1 project command passed: `pnpm --ignore-workspace test` (24 tests, 0 failures).
- Production build passed: `pnpm --ignore-workspace build` (TypeScript plus Vite, 1796 modules transformed).

## Evidence
- Repository baseline: main at 22fe8ae3e7d92eab473ba0c6bd9952f59783387b, clean before worktree creation.
- PR 1 is committed locally as feat: add briefing evidence contract.
- Production worker currently uses 24-hour, lexical, source-label corroboration and stores only the latest report.
- RED tests observed before implementation: missing shared contract module; same-independence Node and Worker posts incorrectly produced one topic; missing source-config module.
- Independent review found evidence truncation could omit the second qualifying independent publisher and whitespace/case could split identities. Both runtimes now select one evidence item per independent publisher before extras; identity values normalize to nonblank lowercase keys, and API config rejects invalid identity metadata.
- Review follow-up proved that identical text from different labels still passed without manual metadata. Both runtimes now collapse exact content copies to the earliest publisher before counting independent corroboration, and the removed London DST test is restored.

---
### complete 2026-08-31T01:59:45

# Continuity checkpoint: signalroom-briefing-evidence-contract

**Status:** complete

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
- None. The apparent pnpm blocker was traced to the parent `/Users/sungha/pnpm-workspace.yaml`; `--ignore-workspace` isolates Signalroom and uses its frozen lockfile without changing global build approvals.

## Failures to avoid
- Do not count cross-posted copies as independent confirmation merely because their display source labels differ.
- Do not drop evidence URLs or make the UI require new optional metadata.
- Do not add live credentials, source lists, or pricing scraping in this PR.
- Do not write secrets or tokens into continuity files or tests.

## Next action
Hand off the completed local PR 1 branch. Do not push or open a pull request without an explicit user request.

## Verification
- Baseline direct Node command passed: node --test --experimental-strip-types server/*.test.mjs cloudflare/*.test.mjs (9 tests, 0 failures).
- PR 1 project command passed: `pnpm --ignore-workspace test` (27 tests, 0 failures).
- Production build passed: `pnpm --ignore-workspace build` (TypeScript plus Vite, 1796 modules transformed).

## Evidence
- Repository baseline: main at 22fe8ae3e7d92eab473ba0c6bd9952f59783387b, clean before worktree creation.
- PR 1 is committed locally as feat: add briefing evidence contract.
- Production worker currently uses 24-hour, lexical, source-label corroboration and stores only the latest report.
- RED tests observed before implementation: missing shared contract module; same-independence Node and Worker posts incorrectly produced one topic; missing source-config module.
- Independent review found evidence truncation could omit the second qualifying independent publisher and whitespace/case could split identities. Both runtimes now select one evidence item per independent publisher before extras; identity values normalize to nonblank lowercase keys, and API config rejects invalid identity metadata.
- Review follow-up proved that identical text from different labels still passed without manual metadata. Both runtimes now collapse exact content copies to the earliest publisher before counting independent corroboration, and the removed London DST test is restored.
- Independent final review found URL-only legacy evidence collapse, equal-time ordering, and markup/plain-text hash divergence. Each issue was reproduced with a failing test and fixed; the final suite and production build pass.
