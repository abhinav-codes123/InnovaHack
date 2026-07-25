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
  });
});
