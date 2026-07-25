"use client";

import type {
  AgentEvent,
  Claim,
  ClaimStatus,
  ResearchRun
} from "@verifact/core";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  CircleDot,
  ExternalLink,
  FileSearch,
  GitFork,
  LoaderCircle,
  Network,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiUrl } from "../lib/api";
import { ConfidenceGauge } from "./confidence-gauge";
import { EvidenceGraph } from "./evidence-graph";

const statusLabels: Record<ClaimStatus, string> = {
  strongly_supported: "Strongly supported",
  supported_with_limitations: "Supported with limitations",
  mixed_evidence: "Mixed evidence",
  insufficient_evidence: "Insufficient evidence",
  contradicted_by_stronger_evidence: "Contradicted",
  context_dependent: "Context dependent",
  unable_to_determine: "Unable to determine"
};

export function ResearchWorkspace({ runId }: { runId: string }) {
  const [run, setRun] = useState<ResearchRun | null>(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<
    "report" | "graph" | "sources"
  >("report");

  const refresh = useCallback(async () => {
    const response = await fetch(apiUrl(`/api/research-runs/${runId}`), {
      cache: "no-store"
    });
    const body = (await response.json()) as
      | ResearchRun
      | { error?: { message?: string } };
    if (!response.ok) {
      const candidate = "error" in body ? body.error : undefined;
      const message =
        typeof candidate === "object"
          ? candidate?.message
          : typeof candidate === "string"
            ? candidate
            : "Unable to load the research run.";
      throw new Error(message);
    }
    const researchRun = body as ResearchRun;
    setRun(researchRun);
    return researchRun;
  }, [runId]);

  useEffect(() => {
    let mounted = true;
    let stream: EventSource | undefined;

    refresh()
      .then((initial) => {
        if (
          !mounted ||
          initial.status === "complete" ||
          initial.status === "failed"
        )
          return;
        stream = new EventSource(
          apiUrl(`/api/research-runs/${runId}/events`)
        );
        stream.addEventListener("research-event", () => {
          void refresh().catch((caught) => {
            if (mounted)
              setError(
                caught instanceof Error
                  ? caught.message
                  : "Unable to refresh research."
              );
          });
        });
        stream.onerror = () => {
          stream?.close();
          void refresh();
        };
      })
      .catch((caught) => {
        if (mounted)
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load research."
          );
      });

    return () => {
      mounted = false;
      stream?.close();
    };
  }, [refresh, runId]);

  if (error && !run) {
    return (
      <main className="workspace-empty">
        <AlertTriangle size={30} />
        <h1>Research could not be loaded</h1>
        <p>{error}</p>
        <Link href="/">Return to research home</Link>
      </main>
    );
  }

  if (!run) {
    return (
      <main className="workspace-empty">
        <LoaderCircle className="spin" size={32} />
        <h1>Opening research workspace</h1>
        <p>Connecting to the evidence engine…</p>
      </main>
    );
  }

  const completed = run.status === "complete";

  return (
    <main className="workspace">
      <header className="workspace-header">
        <div className="workspace-brand">
          <Link href="/" aria-label="Back to home">
            <ArrowLeft size={17} />
          </Link>
          <span className="brand-mark">
            <ShieldCheck size={16} />
          </span>
          <strong>VeriFact</strong>
        </div>
        <div className="run-identity">
          <span className={`run-status ${run.status}`}>
            {completed ? <Check size={13} /> : <LoaderCircle size={13} />}
            {run.status}
          </span>
          <span className="run-id">RUN / {run.id.slice(0, 8)}</span>
          <span className="mode-badge">
            {run.mode === "demo" ? "Recorded demo evidence" : "Live research"}
          </span>
        </div>
      </header>

      <div className="workspace-grid">
        <aside className="research-rail">
          <div className="rail-heading">
            <span>Research playback</span>
            <span>
              {run.events.length.toString().padStart(2, "0")} events
            </span>
          </div>
          <div className="event-timeline">
            {run.events.map((event, index) => (
              <TimelineEvent
                event={event}
                key={event.id}
                latest={index === run.events.length - 1}
              />
            ))}
            {!completed && run.status !== "failed" ? (
              <div className="event-row pending-event">
                <span className="event-icon">
                  <LoaderCircle className="spin" size={13} />
                </span>
                <div>
                  <strong>Agents working</strong>
                  <p>Waiting for the next verified state…</p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="task-block">
            <span className="section-kicker">Research plan</span>
            {run.tasks.map((task) => (
              <div className="task-row" key={task.id}>
                <span className={`task-check ${task.status}`}>
                  {task.status === "complete" ? (
                    <Check size={12} />
                  ) : (
                    <CircleDot size={12} />
                  )}
                </span>
                <div>
                  <strong>{task.title}</strong>
                  <span>{task.sourceCount} sources</span>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="research-main">
          <div className="question-header">
            <span className="section-kicker">Research question</span>
            <h1>{run.query}</h1>
            <div className="scope-row">
              <span>{run.scope.location}</span>
              <span>{run.scope.timePeriod}</span>
              <span>{run.scope.population}</span>
            </div>
          </div>

          <nav className="workspace-tabs" aria-label="Research views">
            <button
              className={activeTab === "report" ? "active" : ""}
              onClick={() => setActiveTab("report")}
            >
              <FileSearch size={15} /> Report
            </button>
            <button
              className={activeTab === "graph" ? "active" : ""}
              onClick={() => setActiveTab("graph")}
            >
              <Network size={15} /> Evidence graph
            </button>
            <button
              className={activeTab === "sources" ? "active" : ""}
              onClick={() => setActiveTab("sources")}
            >
              <BookOpen size={15} /> Sources
              <span>{run.sources.length}</span>
            </button>
          </nav>

          {!completed ? (
            <ProgressPanel run={run} />
          ) : activeTab === "report" ? (
            <ReportView run={run} />
          ) : activeTab === "graph" ? (
            <section className="panel graph-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Provenance map</span>
                  <h2>Question → claims → sources</h2>
                </div>
                <span className="graph-legend">
                  <i className="support" /> supports
                  <i className="conflict" /> contradicts
                </span>
              </div>
              <EvidenceGraph run={run} />
            </section>
          ) : (
            <SourcesView run={run} />
          )}
        </section>
      </div>
    </main>
  );
}

function TimelineEvent({
  event,
  latest
}: {
  event: AgentEvent;
  latest: boolean;
}) {
  return (
    <div className={`event-row ${latest ? "latest" : ""}`}>
      <span className="event-icon">
        {event.type === "error" ? (
          <AlertTriangle size={13} />
        ) : event.type === "complete" ? (
          <Check size={13} />
        ) : (
          <Sparkles size={13} />
        )}
      </span>
      <div>
        <strong>{event.title}</strong>
        <p>{event.detail}</p>
        <time>
          {new Date(event.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
          })}
        </time>
      </div>
    </div>
  );
}

function ProgressPanel({ run }: { run: ResearchRun }) {
  const progress: Record<ResearchRun["status"], number> = {
    queued: 4,
    planning: 18,
    researching: 42,
    extracting: 58,
    verifying: 72,
    scoring: 84,
    reporting: 94,
    complete: 100,
    failed: 100
  };
  return (
    <section className="progress-panel panel">
      <div className="scan-line" />
      <LoaderCircle className="spin" size={24} />
      <span className="section-kicker">{run.status}</span>
      <h2>Evidence is still being assembled.</h2>
      <p>
        The report stays locked until claims, citations, and scoring inputs have
        passed validation.
      </p>
      <div className="progress-track">
        <span style={{ width: `${progress[run.status]}%` }} />
      </div>
      <strong>{progress[run.status]}% workflow complete</strong>
    </section>
  );
}

function ReportView({ run }: { run: ResearchRun }) {
  if (!run.report) return null;
  return (
    <div className="report-stack">
      <section className="verdict-panel panel">
        <div className="verdict-copy">
          <span className="section-kicker">Evidence-backed conclusion</span>
          <h2>{run.report.headline}</h2>
          <p>{run.report.executiveSummary}</p>
        </div>
        <ConfidenceGauge value={run.report.overallConfidence} />
      </section>

      <section className="claim-section">
        <div className="section-title-row">
          <div>
            <span className="section-kicker">Atomic verification</span>
            <h2>{run.claims.length} material claims</h2>
          </div>
          <span className="evidence-count">
            {run.evidence.length} evidence links
          </span>
        </div>
        <div className="claim-list">
          {run.claims.map((claim, index) => (
            <ClaimCard
              claim={claim}
              index={index}
              run={run}
              key={claim.id}
            />
          ))}
        </div>
      </section>

      {run.contradictions.length > 0 ? (
        <section className="contradiction-panel panel">
          <div className="contradiction-icon">
            <GitFork size={20} />
          </div>
          <div>
            <span className="section-kicker">Contradiction analysis</span>
            <h2>Apparent disagreement, different context</h2>
            <p>{run.contradictions[0]?.explanation}</p>
            <ul>
              {run.contradictions[0]?.contextDifferences.map((difference) => (
                <li key={difference}>{difference}</li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section className="conclusion-panel panel">
        <div>
          <span className="section-kicker">Final synthesis</span>
          <h2>Conditional conclusion</h2>
          <p>{run.report.conclusion}</p>
        </div>
        <div className="limitations">
          <strong>Limits of this result</strong>
          <ul>
            {run.report.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function ClaimCard({
  claim,
  run,
  index
}: {
  claim: Claim;
  run: ResearchRun;
  index: number;
}) {
  const [expanded, setExpanded] = useState(index === 0);
  const evidence = run.evidence.filter((item) => item.claimId === claim.id);
  return (
    <article className="claim-card">
      <button
        className="claim-summary"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
      >
        <span className="claim-index">
          C{(index + 1).toString().padStart(2, "0")}
        </span>
        <span className="claim-text">
          <strong>{claim.text}</strong>
          <span className={`claim-status ${claim.status}`}>
            {statusLabels[claim.status]}
          </span>
        </span>
        <span className="claim-score">{claim.confidence}%</span>
        <ChevronDown
          className={expanded ? "chevron-open" : ""}
          size={18}
        />
      </button>
      {expanded ? (
        <div className="claim-detail">
          <div className="score-grid">
            <ScoreFactor
              label="Source quality"
              value={claim.scoreBreakdown.sourceQuality}
              maximum={30}
            />
            <ScoreFactor
              label="Independent support"
              value={claim.scoreBreakdown.independentCorroboration}
              maximum={25}
            />
            <ScoreFactor
              label="Directness"
              value={claim.scoreBreakdown.evidenceDirectness}
              maximum={20}
            />
            <ScoreFactor
              label="Completeness"
              value={claim.scoreBreakdown.completeness}
              maximum={15}
            />
            <ScoreFactor
              label="Time relevance"
              value={claim.scoreBreakdown.timeRelevance}
              maximum={10}
            />
          </div>
          <div className="evidence-stack">
            {evidence.map((item) => {
              const source = run.sources.find(
                (candidate) => candidate.id === item.sourceId
              );
              return (
                <blockquote
                  className={`evidence-quote ${item.relation}`}
                  key={item.id}
                >
                  <div className="evidence-meta">
                    <span>{item.relation}</span>
                    <span>{item.directness}% direct</span>
                  </div>
                  <p>“{item.excerpt}”</p>
                  {source ? (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {source.publisher}
                      <ExternalLink size={12} />
                    </a>
                  ) : null}
                </blockquote>
              );
            })}
          </div>
          <p className="score-disclaimer">
            {claim.scoreBreakdown.explanation.at(-1)}
          </p>
        </div>
      ) : null}
    </article>
  );
}

function ScoreFactor({
  label,
  value,
  maximum
}: {
  label: string;
  value: number;
  maximum: number;
}) {
  return (
    <div className="score-factor">
      <span>{label}</span>
      <strong>
        {value}/{maximum}
      </strong>
      <i>
        <b style={{ width: `${(value / maximum) * 100}%` }} />
      </i>
    </div>
  );
}

function SourcesView({ run }: { run: ResearchRun }) {
  return (
    <section className="panel sources-panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">Source library</span>
          <h2>{run.sources.length} inspected sources</h2>
        </div>
        <span className="source-note">Quality is topic-specific</span>
      </div>
      <div className="source-list">
        {run.sources.map((source, index) => (
          <article className="source-card" key={source.id}>
            <span className="source-number">
              {(index + 1).toString().padStart(2, "0")}
            </span>
            <div className="source-copy">
              <span>{source.kind}</span>
              <h3>{source.title}</h3>
              <p>{source.publisher}</p>
              <ul>
                {source.qualityReasons.slice(0, 2).map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
            <div className="source-score">
              <strong>{source.qualityScore}</strong>
              <span>quality</span>
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open ${source.title}`}
              >
                <ExternalLink size={15} />
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
