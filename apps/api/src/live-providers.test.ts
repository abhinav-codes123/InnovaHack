import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canonicalSourceTitle,
  extractionSchema,
  fetchWithRetry,
  hasMethodologySignal,
  inferSourceKind,
  normalizeProviderScore,
  requiresProfessionalAdviceBoundary,
  toGeminiJsonSchema,
  usesFractionalScoreScale
} from "./live-providers.js";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Gemini structured output schema", () => {
  it("omits legacy generateContent constraints that Gemini 3.5 rejects", () => {
    const serialized = JSON.stringify(
      toGeminiJsonSchema(extractionSchema)
    );

    expect(serialized).not.toContain('"additionalProperties"');
    expect(serialized).not.toContain('"minimum"');
    expect(serialized).not.toContain('"maximum"');
    expect(serialized).not.toContain('"minItems"');
    expect(serialized).not.toContain('"maxItems"');
    expect(serialized).toContain('"required"');
    expect(serialized).toContain('"enum"');
  });

  it("normalizes fractional model scores to the deterministic 0-100 scale", () => {
    expect(usesFractionalScoreScale([0, 0.92, 1])).toBe(true);
    expect(normalizeProviderScore(0, true)).toBe(0);
    expect(normalizeProviderScore(0.92, true)).toBe(92);
    expect(normalizeProviderScore(1, true)).toBe(100);
  });

  it("does not reinterpret a legitimate 1 out of 100 in percentage output", () => {
    expect(usesFractionalScoreScale([1, 72, 80])).toBe(false);
    expect(normalizeProviderScore(1, false)).toBe(1);
    expect(normalizeProviderScore(72, false)).toBe(72);
  });
});

describe("provider request retries", () => {
  it("retries a transient provider failure and then returns success", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(null, {
          status: 503,
          headers: { "retry-after": "0" }
        })
      )
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const responsePromise = fetchWithRetry(
      "https://provider.test",
      () => ({ method: "POST" }),
      2
    );
    await vi.runAllTimersAsync();
    const response = await responsePromise;

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a permanent client failure", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 400 }));

    const response = await fetchWithRetry(
      "https://provider.test",
      () => ({ method: "POST" }),
      4
    );

    expect(response.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("source classification", () => {
  it("recognizes authoritative and academic domains without trusting every .org", () => {
    expect(inferSourceKind("https://www.nasa.gov/example")).toBe("government");
    expect(
      inferSourceKind("https://ai-act-service-desk.ec.europa.eu/en/timeline")
    ).toBe("government");
    expect(
      inferSourceKind("https://pmc.ncbi.nlm.nih.gov/articles/PMC123")
    ).toBe("academic");
    expect(inferSourceKind("https://www.cochrane.org/evidence/example")).toBe(
      "academic"
    );
    expect(inferSourceKind("https://www.frontiersin.org/journals/example")).toBe(
      "academic"
    );
    expect(inferSourceKind("https://en.wikipedia.org/wiki/Example")).toBe(
      "general"
    );
    expect(inferSourceKind("https://example.org/article")).toBe("general");
  });

  it("requires content evidence before granting a methodology signal", () => {
    expect(
      hasMethodologySignal(
        "## Methods\nWe analyzed a randomized controlled trial with 500 participants."
      )
    ).toBe(true);
    expect(
      hasMethodologySignal(
        "This university teaching page summarizes the composition of air."
      )
    ).toBe(false);
  });

  it("groups alternate hosts of the same publication title", () => {
    expect(
      canonicalSourceTitle(
        "Vitamin C for preventing and treating the common cold - PubMed"
      )
    ).toBe(
      canonicalSourceTitle(
        "Vitamin C for preventing and treating the common cold (Review)"
      )
    );
  });

  it("recognizes questions where generated recommendations need a safety boundary", () => {
    expect(
      requiresProfessionalAdviceBoundary(
        "Should adults take vitamin C supplements as a medical treatment?"
      )
    ).toBe(true);
    expect(
      requiresProfessionalAdviceBoundary(
        "Is the Great Wall visible from the Moon?"
      )
    ).toBe(false);
  });
});
