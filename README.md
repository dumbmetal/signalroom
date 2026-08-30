# Signalroom

Editorial conversation intelligence for crypto and AI communities.

Signalroom collects conversations from configured communities, keeps only
cross-source signals, and presents a concise daily report with evidence links.
The UI is a Vite/React app, the local full-stack runtime is a small Node
server, and the scheduled crawler runs as a Cloudflare Worker.

## Project map

- `src/` — React UI, shared types, seeded demo data, and browser API client
- `server/` — local API, source adapters, clustering, summaries, persistence, and Telegram delivery
- `cloudflare/` — scheduled crawler, KV report storage, and report import validation
- `remote/` — optional remote summary upload through the private MTPLX gateway
- `DESIGN.md` — visual and editorial source of truth
- `AGENTS.md` — instructions for Codex and other AI coding agents
- `COLLABORATION_KO.md` — beginner-friendly GitHub + AI collaboration guide

For any change, read `AGENTS.md` first. Use `pnpm`, keep secrets local, and
open a pull request from a feature branch instead of committing directly to
`main`.

## Run locally

```bash
pnpm install
pnpm dev
```

The UI includes the report shell, topic expansion and evidence links, archive, source health view, and schedule/delivery settings panel. Seeded data keeps the interface useful before external credentials are configured.

The default report schedule is `08:00` in `Europe/London`. The schedule uses
the named timezone so it continues to work through UK daylight-saving changes.

## Run the full stack

```bash
pnpm build
pnpm start
```

The server listens on `http://127.0.0.1:8787` by default and persists configuration and immutable reports in `data/store.json` with mode `0600`.

## Production integration seam

`src/pipeline.ts` defines browser-shared contracts. The production pipeline under `server/` implements Reddit, X, Threads, and Telegram adapters, topic clustering/ranking, provider-agnostic summarization, partial failure tracking, report persistence, and Telegram delivery. The scheduler runs at `08:00` Europe/London time by default.

The ingestion layer is intentionally provider-agnostic. Each source run is isolated so a rate limit or credential error produces a visible source failure without discarding successful sources. Telegram Bot API ingestion sees channel posts only when the bot receives them; unrestricted channel history requires an MTProto client implementation behind the same adapter contract.

### API

- `GET /api/health`, `/api/settings`, `/api/sources`, `/api/reports`, `/api/report?date=YYYY-MM-DD`
- `PUT /api/settings`
- `POST /api/sources`, `/api/reports/generate` (use `{ "force": true }` to re-crawl a date), `/api/delivery/telegram`
- `PATCH /api/sources/:id`

The deployed Cloudflare Worker additionally exposes `POST /api/crawl` and an authenticated `POST /api/report/import` endpoint. Topic ranking prioritizes the number of distinct Telegram channels mentioning a cluster, followed by volume, engagement, and recency.

## Remote MTPLX summarization

`remote/summarize-report.mjs` pulls the current 24-hour crawl, summarizes the ranked topics through the loopback-only `mtplx-gateway`, and uploads the signed result to Cloudflare. The remote gateway is never exposed publicly. The upload credential is stored as the Cloudflare `REPORT_IMPORT_TOKEN` secret and in a mode-`0600` file on the remote Mac.

## AI-assisted collaboration

The normal workflow is: create a small issue, make a feature branch, ask
Codex to inspect `AGENTS.md` and implement the issue, run the tests, open a
pull request, and have the other person review the diff. New fixes are pushed
to the same branch and appear in the same pull request. Merge into `main` only
after the CI check is green and a person has reviewed the change.

See [COLLABORATION_KO.md](COLLABORATION_KO.md) for the simple Korean guide.
