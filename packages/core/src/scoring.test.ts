import { describe, expect, it } from "vitest";
import { demoEvidence, demoSources } from "./demo.js";
import { scoreClaim } from "./scoring.js";

describe("scoreClaim", () => {
  it("rewards multiple independent supporting sources", () => {
    const result = scoreClaim({
      evidence: demoEvidence.filter(
        (item) => item.claimId === "claim-lifecycle"
      ),
      sources: demoSources,
      completeness: 90,
      timeRelevance: 90
    });

    expect(result.confidence).toBeGreaterThanOrEqual(80);
    expect(result.status).toBe("strongly_supported");
    expect(result.breakdown.independentCorroboration).toBeGreaterThan(10);
  });

  it("does not label missing evidence as false", () => {
    const result = scoreClaim({
      evidence: [],
      sources: demoSources,
      completeness: 100,
      timeRelevance: 100
    });

    expect(result.confidence).toBe(0);
    expect(result.status).toBe("insufficient_evidence");
    expect(result.breakdown.completeness).toBe(0);
    expect(result.breakdown.timeRelevance).toBe(0);
  });

  it("applies a contradiction penalty", () => {
    const supportingEvidence = demoEvidence.find(
      (item) => item.id === "ev-6"
    );
    const contradictingEvidence = demoEvidence.find(
      (item) => item.id === "ev-7"
    );
    if (!supportingEvidence || !contradictingEvidence) {
      throw new Error("Break-even evidence fixtures are missing.");
    }

    const evidence = [
      supportingEvidence,
      { ...contradictingEvidence, relation: "contradicts" as const }
    ];
    const withContradiction = scoreClaim({
      evidence,
      sources: demoSources,
      completeness: 70,
      timeRelevance: 75,
      contextDependent: true
    });
    const withoutContradiction = scoreClaim({
      evidence: evidence.filter((item) => item.relation !== "contradicts"),
      sources: demoSources,
      completeness: 70,
      timeRelevance: 75
    });

    expect(withContradiction.breakdown.contradictionPenalty).toBeGreaterThan(0);
    expect(withContradiction.confidence).toBeLessThan(
      withoutContradiction.confidence
    );
    expect(withContradiction.status).toBe("context_dependent");
  });
});
