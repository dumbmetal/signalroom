# Signalroom — AI coding instructions

이 파일은 Codex와 다른 코딩 에이전트가 이 프로젝트에서 작업할 때 먼저
읽어야 하는 안내서입니다. 사람 개발자도 같은 기준을 사용합니다.

## 프로젝트 목적

Signalroom은 암호화폐와 AI 커뮤니티의 대화를 모아 **여러 출처에서 확인된
주제만** 일일 에디토리얼 리포트로 보여주는 서비스입니다. 각 주제는 요약,
신호, 출처, 원문 증거를 가져야 합니다. 단일 출처의 화제는 확정된 신호로
승격하지 않습니다.

제품의 화면·문체·색상·접근성 기준은 [DESIGN.md](DESIGN.md)가 기준입니다.
`DESIGN.md`와 이 파일의 규칙이 코드의 편의보다 우선합니다.

## 구조

- `src/` — Vite + React + TypeScript 화면, 브라우저 API 클라이언트, 공유 타입
- `server/` — 로컬 Node API, Reddit/X/Threads/Telegram 어댑터, 클러스터링·랭킹·요약, JSON 저장소, Telegram 전송
- `cloudflare/worker.ts` — Cloudflare Worker 크롤러, KV 저장, 예약 실행, 리포트 정규화/import 인증
- `remote/` — 선택 사항인 원격 MTPLX 요약 업로드 스크립트와 launchd 설정
- `data/store.json` — 로컬 설정·리포트 저장 파일. 개인 로컬 상태이며 커밋하지 않음
- `dist/` — 빌드 결과물이며 커밋하지 않음
- `wrangler.jsonc` — `signalroom-crawler` Worker 설정, KV 바인딩, 시간별 cron 설정

주요 흐름은 다음과 같습니다.

1. 소스 어댑터가 최근 대화를 가져옵니다.
2. 중복 제거 후 서로 다른 `sourceId`의 내용이 겹치는 클러스터만 남깁니다.
3. 클러스터를 랭킹하고 결정론적 또는 설정된 요약 제공자로 요약합니다.
4. 리포트와 소스별 성공/실패 상태를 저장하고, 설정되어 있으면 Telegram으로 보냅니다.

## 실행 명령

패키지 매니저는 `pnpm@10.17.1`입니다. `npm`, `yarn`으로 lockfile을 바꾸지
마세요.

```bash
pnpm install
pnpm dev       # Vite 개발 화면
pnpm start     # 빌드된 화면 + 로컬 API, 127.0.0.1:8787
pnpm test      # server/ 및 cloudflare/ 테스트
pnpm build     # TypeScript 검사 + Vite 빌드
pnpm check:worker # Worker 타입 + Wrangler 타입 설정 검사
```

작업을 끝내기 전에 기본 검증은 다음 순서로 실행합니다.

```bash
pnpm test && pnpm build
```

화면·상호작용을 바꿨다면 개발 서버에서 실제 화면도 확인합니다. 빌드가
성공했다는 사실만으로 브라우저 동작이나 배포 성공을 주장하지 않습니다.

## 변경 규칙

- 모든 작업은 먼저 현재 코드를 읽고, 변경 범위를 작은 단위로 계획합니다.
- UI는 기존 CSS 토큰과 `DESIGN.md`의 차분한 편집형 스타일을 유지합니다.
- 주제 검증의 핵심인 다중 출처 조건과 evidence 링크를 약화하지 않습니다.
- 한 소스 실패가 전체 리포트를 지우지 않도록 소스별 부분 실패 상태를 보존합니다.
- 날짜·스케줄은 고정 UTC 오프셋이 아니라 `Europe/London` 같은 IANA 시간대를 사용하고 DST 테스트를 유지합니다.
- `data/store.json`, `.env`, `.env.local`, 토큰·쿠키·세션·API 키를 커밋하거나 출력하지 않습니다.
- `wrangler.jsonc`의 공개 설정과 Cloudflare secret을 혼동하지 않습니다. secret 값은 로컬 또는 Cloudflare secret 저장소에만 둡니다.
- Worker의 수동 `POST /api/crawl`과 `POST /api/report/import`는 `REPORT_IMPORT_TOKEN` Bearer 인증을 사용합니다. 예약 실행은 Worker 스케줄러만 호출합니다.
- 라이브 소스에 의존하는 테스트를 만들지 말고, 네트워크·자격증명이 없어도 통과하는 단위 테스트를 우선합니다.
- 배포 변경은 별도 리뷰 후 수행합니다. PR 검증이 끝났다고 곧바로 운영 배포로 간주하지 않습니다.

## AI를 사용하는 작업 방식

Codex는 탐색·구현·테스트 초안을 돕지만 최종 판단은 사람이 합니다. 모든
AI 작업은 다음 순서를 따릅니다.

1. Codex에게 `AGENTS.md`와 관련 파일을 먼저 읽게 하고, 모르는 부분은 추측하지 말고 찾게 합니다.
2. 변경 전에 목표, 수정 파일, 검증 방법을 짧게 적게 합니다.
3. 작은 범위만 구현하게 하고, 완료 후 `git diff`를 사람이 확인합니다.
4. Codex에게 `pnpm test && pnpm build`를 실행하고 실패 원인과 남은 위험을 설명하게 합니다.
5. 실제 변경·테스트 결과를 PR 설명에 남깁니다. AI의 “완료”라는 말만 근거로 병합하지 않습니다.

좋은 요청 예시:

> `AGENTS.md`를 먼저 읽어. 이 이슈의 범위를 벗어나지 말고 관련 파일을
> 조사한 다음 계획을 보여줘. 구현 후 pnpm test && pnpm build를 실행하고,
> 변경 파일·검증 결과·남은 위험을 요약해줘.

## GitHub / PR 규칙

- 기본 브랜치는 `main`입니다. 직접 커밋하지 않고 `feat/`, `fix/`, `docs/`, `chore/` 브랜치를 만듭니다.
- 한 브랜치와 PR에는 하나의 작은 목적만 담습니다.
- PR에는 무엇을 바꿨는지, 왜 바꿨는지, 실행한 검증, 화면 변경 여부를 적습니다.
- 상대방은 코드뿐 아니라 요구사항 충족 여부와 AI가 만든 가정을 리뷰합니다.
- 리뷰에서 수정 요청이 오면 새 PR을 만들지 말고 같은 브랜치에 수정 커밋을 추가합니다.
- CI가 통과하고 사람이 승인한 뒤 `main`에 병합합니다. 병합 후 브랜치는 삭제하고 다음 작업 전에 `main`을 다시 받습니다.
- 충돌이 나면 Codex에게 양쪽 변경의 의도를 먼저 설명하게 한 뒤 사람이 최종 선택하고 전체 검증을 다시 합니다.

자세한 초보자용 절차와 Codex 요청문은 [COLLABORATION_KO.md](COLLABORATION_KO.md)를 읽습니다.

## 완료 기준

작업은 다음 조건을 충족해야 완료로 봅니다.

- 요청한 동작이 실제 코드에 반영됨
- 관련 테스트가 통과함
- `pnpm build`가 통과함
- 비밀값이나 로컬 상태가 diff에 없음
- PR 설명에 변경 내용과 검증 결과가 있음
- UI 변경이면 실제 브라우저 화면을 확인함
- 크롤러/API 변경이면 가능한 범위에서 실제 응답과 실패 상태를 확인함
