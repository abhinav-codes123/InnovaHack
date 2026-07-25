import {
  demoClaims,
  demoContradictions,
  demoEvidence,
  demoReport,
  demoSources,
  type AgentEvent,
  type ResearchRun,
  type ResearchStatus
} from "@verifact/core";
import type { AppConfig } from "./config.js";
import type { EventBus } from "./event-bus.js";
import { LiveResearchProvider } from "./live-providers.js";
import type { ResearchRunRepository } from "./repository.js";

interface Step {
  status: ResearchStatus;
  type: AgentEvent["type"];
  title: string;
  detail: string;
  mutate?: (run: ResearchRun) => void;
}

const sleep = async (duration: number): Promise<void> => {
  if (duration === 0) return;
  await new Promise((resolve) => setTimeout(resolve, duration));
};

export class ResearchRunner {
  constructor(
    private readonly repository: ResearchRunRepository,
    private readonly eventBus: EventBus,
    private readonly config: AppConfig
  ) {}

  start(runId: string): void {
    void this.execute(runId);
  }

  private async emit(runId: string, step: Step): Promise<void> {
    let emitted: AgentEvent | undefined;
    await this.repository.update(runId, (run) => {
      step.mutate?.(run);
      run.status = step.status;
      const event: AgentEvent = {
        id: run.events.length + 1,
        runId,
        type: step.type,
        title: step.title,
        detail: step.detail,
        status: step.status,
        createdAt: new Date().toISOString()
      };
      run.events.push(event);
      emitted = event;
      return run;
    });
    if (emitted) await this.eventBus.publish(emitted);
    await sleep(this.config.DEMO_STEP_DELAY_MS);
  }

  private async execute(runId: string): Promise<void> {
    try {
      const run = await this.repository.findById(runId);
      if (!run) return;
      if (run.mode === "live") {
        await this.executeLive(runId, run.query);
        return;
      }

      const steps: Step[] = [
        {
          status: "planning",
          type: "status",
          title: "Question scoped",
          detail:
            "Defined a lifecycle comparison across comparable passenger vehicles."
        },
        {
          status: "planning",
          type: "task",
          title: "Research plan created",
          detail: `${run.tasks.length} independent research tasks are ready.`
        },
        {
          status: "researching",
          type: "task",
          title: "Lifecycle research complete",
          detail: "Government and international energy evidence collected.",
          mutate: (current) => {
            const task = current.tasks[0];
            if (task) {
              task.status = "complete";
              task.sourceCount = 3;
            }
            current.sources = demoSources.slice(0, 3);
          }
        },
        {
          status: "researching",
          type: "task",
          title: "Grid analysis complete",
          detail: "Regional electricity-generation evidence collected.",
          mutate: (current) => {
            const task = current.tasks[1];
            if (task) {
              task.status = "complete";
              task.sourceCount = 2;
            }
            current.sources = demoSources.slice(0, 4);
          }
        },
        {
          status: "researching",
          type: "task",
          title: "Battery research complete",
          detail: "Manufacturing and break-even evidence collected.",
          mutate: (current) => {
            const task = current.tasks[2];
            if (task) {
              task.status = "complete";
              task.sourceCount = 2;
            }
            current.sources = demoSources;
          }
        },
        {
          status: "extracting",
          type: "metric",
          title: "Atomic claims extracted",
          detail: `${demoClaims.length} independently verifiable claims identified.`,
          mutate: (current) => {
            current.claims = demoClaims;
          }
        },
        {
          status: "verifying",
          type: "metric",
          title: "Evidence linked",
          detail: `${demoEvidence.length} claim-to-source relationships validated against the recorded source text.`,
          mutate: (current) => {
            current.evidence = demoEvidence;
          }
        },
        {
          status: "verifying",
          type: "metric",
          title: "Context checked",
          detail:
            "One apparent disagreement was classified as context-dependent.",
          mutate: (current) => {
            current.contradictions = demoContradictions;
          }
        },
        {
          status: "scoring",
          type: "metric",
          title: "Confidence calculated",
          detail:
            "Deterministic claim scores calculated from source quality, independence, directness, coverage, recency, and contradictions."
        },
        {
          status: "reporting",
          type: "status",
          title: "Report synthesized",
          detail:
            "Every material report statement is grounded in the verified claim set.",
          mutate: (current) => {
            current.report = demoReport;
          }
        },
        {
          status: "complete",
          type: "complete",
          title: "Research complete",
          detail: `${demoSources.length} sources and ${demoClaims.length} claims are ready to inspect.`
        }
      ];

      for (const step of steps) await this.emit(runId, step);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown research failure.";
      await this.emit(runId, {
        status: "failed",
        type: "error",
        title: "Research failed",
        detail: message,
        mutate: (run) => {
          run.error = message;
        }
      });
    }
  }

  private async executeLive(runId: string, query: string): Promise<void> {
    const provider = new LiveResearchProvider(this.config);
    await this.emit(runId, {
      status: "planning",
      type: "status",
      title: "Question analysis started",
      detail: "The planner is defining scope, assumptions, and research lanes."
    });

    const plan = await provider.plan(query);
    await this.emit(runId, {
      status: "planning",
      type: "task",
      title: "Research plan created",
      detail: `${plan.tasks.length} bounded research tasks were generated.`,
      mutate: (run) => {
        run.normalizedQuestion = plan.normalizedQuestion;
        run.scope = plan.scope;
        run.tasks = plan.tasks;
      }
    });

    await this.emit(runId, {
      status: "researching",
      type: "status",
      title: "Parallel source research started",
      detail:
        "Tavily is collecting raw source material across the planned searches."
    });
    const documents = await provider.research(plan.tasks);
    await this.emit(runId, {
      status: "extracting",
      type: "metric",
      title: "Source material collected",
      detail: `${documents.length} unique retrievable source documents are ready for extraction.`,
      mutate: (run) => {
        run.sources = documents.map((document) => document.source);
        run.tasks = run.tasks.map((task) => ({
          ...task,
          status: "complete",
          sourceCount: documents.filter((document) =>
            task.sourceKinds.includes(document.source.kind)
          ).length
        }));
      }
    });

    await this.emit(runId, {
      status: "verifying",
      type: "status",
      title: "Atomic verification started",
      detail:
        "Claims are being extracted and exact evidence quotations are being validated against retrieved source text."
    });
    const verification = await provider.verify(
      plan.normalizedQuestion,
      documents
    );
    await this.emit(runId, {
      status: "scoring",
      type: "metric",
      title: "Claims verified",
      detail: `${verification.claims.length} claims and ${verification.evidence.length} exact evidence links passed validation.`,
      mutate: (run) => {
        run.sources = verification.sources;
        run.claims = verification.claims;
        run.evidence = verification.evidence;
        run.contradictions = verification.contradictions;
      }
    });
    await this.emit(runId, {
      status: "reporting",
      type: "status",
      title: "Report synthesized",
      detail:
        "The report was constrained to the verified claim set and its validated citations.",
      mutate: (run) => {
        run.report = verification.report;
      }
    });
    await this.emit(runId, {
      status: "complete",
      type: "complete",
      title: "Live research complete",
      detail: `${verification.sources.length} sources and ${verification.claims.length} claims are ready to inspect.`
    });
  }
}
