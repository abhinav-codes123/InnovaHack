import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("treats blank optional values from .env as unconfigured", () => {
    const config = loadConfig({
      NODE_ENV: "development",
      TAVILY_API_KEY: "",
      GEMINI_API_KEY: "",
      OPENROUTER_API_KEY: "",
      OPENROUTER_MODEL: "",
      DATABASE_URL: "",
      REDIS_URL: ""
    });

    expect(config.TAVILY_API_KEY).toBeUndefined();
    expect(config.GEMINI_API_KEY).toBeUndefined();
    expect(config.OPENROUTER_API_KEY).toBeUndefined();
    expect(config.OPENROUTER_MODEL).toBeUndefined();
    expect(config.DATABASE_URL).toBeUndefined();
    expect(config.REDIS_URL).toBeUndefined();
    expect(config.GEMINI_FALLBACK_MODELS).toEqual([
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite"
    ]);
  });

  it("migrates the retired Gemini 2.5 Flash model configuration", () => {
    const config = loadConfig({
      GEMINI_MODEL: "gemini-2.5-flash"
    });

    expect(config.GEMINI_MODEL).toBe("gemini-3.5-flash");
  });

  it("parses and deduplicates Gemini fallback models", () => {
    const config = loadConfig({
      GEMINI_FALLBACK_MODELS:
        "gemini-3.5-flash-lite, gemini-3.6-flash, gemini-3.5-flash-lite"
    });

    expect(config.GEMINI_FALLBACK_MODELS).toEqual([
      "gemini-3.5-flash-lite",
      "gemini-3.6-flash"
    ]);
  });
});
