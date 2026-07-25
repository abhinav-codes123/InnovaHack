# VeriFact AI

VeriFact AI is an evidence-first research and claim-verification platform. It plans a research run, gathers source material across independent lanes, extracts atomic claims, validates exact evidence excerpts, keeps contradictions visible, and calculates an inspectable evidence-confidence score.

It is intentionally not a conventional chatbot. The primary product is the traceable path from question to claim to evidence to conclusion.

## What is implemented

- Next.js research interface with live playback, claim cards, confidence factors, source inspection, contradiction analysis, and an interactive evidence graph.
- Express API with validated request contracts, security headers, structured logs, health endpoint, and Server-Sent Events.
- Deterministic source-quality and claim-confidence engines.
- Exact-quotation guard for live model output: evidence is rejected when the claimed excerpt is absent from retrieved source content.
- Tavily live-search adapter.
- Gemini and OpenRouter JSON model adapters.
- Clearly labeled offline demo run that does not require API keys.
- PostgreSQL repository with transaction-safe run updates.
- Redis event bus for multi-instance SSE delivery.
- In-memory infrastructure fallback for local development and tests.
- Docker Compose production topology.
- Unit and API integration tests.

## Reliability boundary

VeriFact does not certify objective truth. It measures the strength of the evidence collected during a research run.

- Missing support is not automatically classified as false.
- Multiple pages repeating the same material are grouped through independence identifiers.
- Source quality is topic-specific; a government or academic domain does not receive an automatic perfect score.
- Apparent contradictions are compared for time, geography, units, subject, and scope.
- Reports are synthesized from the verified claim collection rather than directly from raw search results.
- Live search and model providers are external dependencies and can fail, rate-limit, or return incomplete coverage.

## Architecture

```text
Next.js workspace
       │
       │ POST run / GET snapshot / SSE events
       ▼
Express research API
       │
       ├── Query planning ───── Gemini or OpenRouter
       ├── Source research ──── Tavily
       ├── Evidence guard ───── Exact excerpt validation
       ├── Verification ─────── Deterministic TypeScript core
       ├── Persistence ──────── PostgreSQL or in-memory fallback
       └── Event delivery ───── Redis or in-process fallback
```

The agent/model boundary is deliberately narrow. Deduplication, validation, scoring, status thresholds, citation checks, persistence, and event ordering are deterministic services.

## Repository

```text
apps/
  api/        Express research service and provider adapters
  web/        Next.js research workspace
packages/
  core/       Domain types, demo fixture, context analysis, and scoring
```

## Local setup

Requirements:

- Node.js 22 or newer
- pnpm

Install and configure:

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Open:

- Web: `http://localhost:3000`
- API health: `http://localhost:4000/health`

Demo mode works without external credentials. Live mode requires:

```text
TAVILY_API_KEY
GEMINI_API_KEY
```

Alternatively, replace Gemini with:

```text
OPENROUTER_API_KEY
OPENROUTER_MODEL
```

The API refuses to start a live run when the required providers are not configured. It does not silently fall back to demo evidence.

## Database and Redis

When `DATABASE_URL` is absent, the API uses an in-memory repository. When `REDIS_URL` is absent, events are delivered within the current API process.

Apply the PostgreSQL schema:

```bash
pnpm --filter @verifact/api db:migrate
```

Production deployments should configure both PostgreSQL and Redis. The in-memory options are intended for local development and automated tests.

## Verification commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Run everything:

```bash
pnpm check
```

## Container deployment

```bash
docker compose up --build
```

The supplied topology starts:

- Next.js web service
- Express API
- PostgreSQL
- Redis

Provider keys remain optional when only the demo workflow is needed.

## Evidence confidence

Each claim receives an auditable score:

```text
30% source quality
25% independent corroboration
20% evidence directness
15% evidence completeness
10% time relevance
- contradiction penalty
```

This is an evidence-strength score, not a probability that a claim is objectively true.

## Security considerations

- Retrieved web content is treated as untrusted data, not model instructions.
- Provider keys remain server-side.
- Evidence quotations must be found in the retrieved content.
- Request bodies have strict size and schema limits.
- Helmet security headers and origin-restricted CORS are enabled.
- PostgreSQL writes use parameterized queries and transaction locks.
- External model/search requests have bounded timeouts.

Before a public launch, add user authentication, organization authorization, distributed rate limiting, secret management, database backups, data-retention controls, telemetry redaction, and an abuse review appropriate to the target research domains.

"Testing the merging"