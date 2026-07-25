# Production-readiness checklist

## Required before public launch

- Add authenticated users, organizations, and per-run authorization.
- Add Redis-backed request quotas by user and organization.
- Encrypt secrets through the deployment platform rather than environment files.
- Configure PostgreSQL point-in-time recovery and tested restore procedures.
- Store complete document snapshots in object storage with retention controls.
- Add domain-level SSRF controls before introducing direct arbitrary-URL retrieval.
- Add prompt-injection evaluation for retrieved source content.
- Add provider cost budgets and per-run token ceilings.
- Add OpenTelemetry traces with provider payload redaction.
- Add SLOs for run completion, citation validation, and provider failure rates.
- Add moderation and high-stakes-domain policies.

## Evaluation gates

A release should be blocked when any of these regress:

- Citation correctness
- Exact quote validation
- Unsupported-claim rate
- Source independence grouping
- Contradiction precision
- Context mismatch detection
- Report-to-claim traceability
- Research run recovery after provider failure

## Deployment topology

Run the web and API as separate stateless services behind TLS. PostgreSQL stores run state, Redis distributes progress events, and a background worker should own long-running research jobs once concurrency grows beyond the first deployment.

The current API can execute runs in-process. This keeps the local and hackathon experience simple, but production autoscaling should move orchestration into a durable worker queue.
