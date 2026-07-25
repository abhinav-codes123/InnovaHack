# Architecture decisions

## Evidence is the central entity

The system does not allow a report generator to research and answer in one opaque call. Research produces source documents, documents produce atomic claims, and claims are linked to exact excerpts. Only the resulting verified claim collection is supplied to report synthesis.

## Agents are bounded interpreters

Models perform query planning, claim extraction, relationship classification, and synthesis. They do not control:

- Source deduplication
- Evidence quotation validation
- Confidence arithmetic
- Claim-status thresholds
- Persistence
- Event ordering
- HTTP authorization or error handling

This boundary prevents a persuasive model response from overriding missing evidence.

## Live workflow

1. Validate that search and model providers are configured.
2. Create and persist an empty research run.
3. Generate a structured plan.
4. Run the planned Tavily searches concurrently.
5. Normalize URLs and group content for independence.
6. Ask the model for atomic claims and exact evidence excerpts.
7. Reject evidence whose source ID is unknown.
8. Reject evidence whose normalized excerpt is absent from the retrieved text.
9. Calculate deterministic claim status and confidence.
10. Synthesize a report from claim summaries only.
11. Persist each transition and publish an SSE event.

## Demo workflow

Demo mode replays a fixed, inspectable evidence fixture. It is intentionally labeled “Recorded demo evidence” in the interface. It is not presented as a current live search.

## Persistence modes

Local mode uses process memory. Production mode uses a JSONB research-run aggregate in PostgreSQL. Updates acquire a row lock so concurrent workflow steps cannot overwrite one another. Redis Pub/Sub carries research events across API instances.

The aggregate model is appropriate for the initial product because a research run is normally loaded as one workspace. High-volume source reuse can later move Sources and DocumentSnapshots into normalized tables without changing the domain contracts.
