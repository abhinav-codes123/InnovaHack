import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import type { AppConfig } from "./config.js";

const testConfig: AppConfig = {
  NODE_ENV: "test",
  PORT: 4000,
  WEB_ORIGIN: "http://localhost:3000",
  DEMO_STEP_DELAY_MS: 0,
  GEMINI_MODEL: "gemini-2.5-flash"
};

describe("research API", () => {
  it("returns health status", async () => {
    const response = await request(createApp(testConfig)).get("/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });

  it("validates research requests", async () => {
    const response = await request(createApp(testConfig))
      .post("/api/research-runs")
      .send({ query: "short", mode: "demo" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_REQUEST");
  });

  it("completes an evidence-backed demo run", async () => {
    const app = createApp(testConfig);
    const created = await request(app)
      .post("/api/research-runs")
      .send({
        query:
          "Are electric vehicles better for the environment across their lifecycle?",
        mode: "demo"
      });
    expect(created.status).toBe(202);

    const id = created.body.id as string;
    let run = created.body;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = await request(app).get(`/api/research-runs/${id}`);
      run = response.body;
      if (run.status === "complete") break;
      await new Promise((resolve) => setTimeout(resolve, 2));
    }

    expect(run.status).toBe("complete");
    expect(run.sources).toHaveLength(5);
    expect(run.claims).toHaveLength(4);
    expect(run.evidence).toHaveLength(7);
    expect(run.report.overallConfidence).toBeGreaterThan(50);
  });

  it("rejects live mode when providers are not configured", async () => {
    const response = await request(createApp(testConfig))
      .post("/api/research-runs")
      .send({
        query: "Investigate a current claim using live public evidence.",
        mode: "live"
      });
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("LIVE_PROVIDERS_NOT_CONFIGURED");
  });

  it("rejects incomplete OpenRouter configuration", async () => {
    const response = await request(
      createApp({
        ...testConfig,
        TAVILY_API_KEY: "test-search-key",
        OPENROUTER_API_KEY: "test-model-key"
      })
    )
      .post("/api/research-runs")
      .send({
        query: "Investigate a current claim using live public evidence.",
        mode: "live"
      });

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("LIVE_PROVIDERS_NOT_CONFIGURED");
  });
});
