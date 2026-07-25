import {
  createDemoRun,
  createResearchRun,
  type CreateResearchRunInput,
  type ResearchRun
} from "@verifact/core";
import { randomUUID } from "node:crypto";
import type { AppConfig } from "./config.js";
import { AppError } from "./errors.js";
import type { ResearchRunRepository } from "./repository.js";
import { ResearchRunner } from "./research-runner.js";

export class ResearchService {
  constructor(
    private readonly repository: ResearchRunRepository,
    private readonly runner: ResearchRunner,
    private readonly config: AppConfig
  ) {}

  async create(input: CreateResearchRunInput): Promise<ResearchRun> {
    const missingProviders: string[] = [];
    if (!this.config.TAVILY_API_KEY) {
      missingProviders.push("TAVILY_API_KEY");
    }

    const hasModelProvider =
      Boolean(this.config.GEMINI_API_KEY) ||
      Boolean(
        this.config.OPENROUTER_API_KEY && this.config.OPENROUTER_MODEL
      );
    if (!hasModelProvider) {
      missingProviders.push(
        "GEMINI_API_KEY or OPENROUTER_API_KEY + OPENROUTER_MODEL"
      );
    }

    if (input.mode === "live" && missingProviders.length > 0) {
      throw new AppError(
        503,
        "LIVE_PROVIDERS_NOT_CONFIGURED",
        "Live research providers are not fully configured.",
        { missingProviders }
      );
    }

    const id = randomUUID();
    const run =
      input.mode === "demo"
        ? createDemoRun(id, input.query)
        : createResearchRun(id, input.query, "live");
    const created = await this.repository.create(run);
    this.runner.start(created.id);
    return created;
  }

  async getById(id: string): Promise<ResearchRun> {
    const run = await this.repository.findById(id);
    if (!run) {
      throw new AppError(
        404,
        "RESEARCH_RUN_NOT_FOUND",
        `Research run ${id} was not found.`
      );
    }
    return run;
  }
}
