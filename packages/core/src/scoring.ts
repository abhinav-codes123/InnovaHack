import type {
  ClaimStatus,
  EvidenceLink,
  ScoreBreakdown,
  Source
} from "./types.js";

export interface ScoreClaimInput {
  evidence: EvidenceLink[];
  sources: Source[];
  completeness: number;
  timeRelevance: number;
  contextDependent?: boolean;
}

const clamp = (value: number, min = 0, max = 100): number =>
  Math.min(max, Math.max(min, Math.round(value)));

export function scoreClaim(input: ScoreClaimInput): {
  confidence: number;
  status: ClaimStatus;
  breakdown: ScoreBreakdown;
} {
  const sourceById = new Map(input.sources.map((source) => [source.id, source]));
  const supporting = input.evidence.filter((item) => item.relation === "supports");
  const contradicting = input.evidence.filter(
    (item) => item.relation === "contradicts"
  );

  const supportingSources = [
    ...new Map(
      supporting
        .map((item) => sourceById.get(item.sourceId))
        .filter((source): source is Source => Boolean(source))
        .map((source) => [source.id, source])
    ).values()
  ];

  const averageQuality =
    supportingSources.length === 0
      ? 0
      : supportingSources.reduce((total, source) => total + source.qualityScore, 0) /
        supportingSources.length;

  const sourceQuality = clamp((averageQuality / 100) * 30, 0, 30);
  const independentGroups = new Set(
    supportingSources.map((source) => source.independenceGroup)
  ).size;
  const independentCorroboration = clamp(
    independentGroups === 0 ? 0 : 8 + Math.min(independentGroups - 1, 3) * 6,
    0,
    25
  );
  const evidenceDirectness = clamp(
    supporting.length === 0
      ? 0
      : (supporting.reduce((total, item) => total + item.directness, 0) /
          supporting.length /
          100) *
          20,
    0,
    20
  );
  const hasMaterialEvidence = supporting.length + contradicting.length > 0;
  const completeness = hasMaterialEvidence
    ? clamp((input.completeness / 100) * 15, 0, 15)
    : 0;
  const timeRelevance = hasMaterialEvidence
    ? clamp((input.timeRelevance / 100) * 10, 0, 10)
    : 0;

  const contradictionStrength = contradicting.reduce((total, item) => {
    const source = sourceById.get(item.sourceId);
    const quality = source?.qualityScore ?? 50;
    return total + (item.directness / 100) * (quality / 100);
  }, 0);
  const contradictionPenalty = clamp(contradictionStrength * 12, 0, 30);

  const confidence = clamp(
    sourceQuality +
      independentCorroboration +
      evidenceDirectness +
      completeness +
      timeRelevance -
      contradictionPenalty
  );

  let status: ClaimStatus;
  if (input.contextDependent && supporting.length > 0 && contradicting.length > 0) {
    status = "context_dependent";
  } else if (supporting.length === 0 && contradicting.length === 0) {
    status = "insufficient_evidence";
  } else if (
    contradicting.length > 0 &&
    contradictionPenalty >= 16 &&
    confidence < 45
  ) {
    status = "contradicted_by_stronger_evidence";
  } else if (supporting.length > 0 && contradicting.length > 0) {
    status = "mixed_evidence";
  } else if (confidence >= 80) {
    status = "strongly_supported";
  } else if (confidence >= 55) {
    status = "supported_with_limitations";
  } else {
    status = "unable_to_determine";
  }

  return {
    confidence,
    status,
    breakdown: {
      sourceQuality,
      independentCorroboration,
      evidenceDirectness,
      completeness,
      timeRelevance,
      contradictionPenalty,
      explanation: [
        `${supportingSources.length} supporting source${supportingSources.length === 1 ? "" : "s"} found.`,
        `${independentGroups} independent evidence group${independentGroups === 1 ? "" : "s"} counted.`,
        contradicting.length > 0
          ? `${contradicting.length} credible contradiction${contradicting.length === 1 ? "" : "s"} applied as a penalty.`
          : "No direct contradiction was found in the collected evidence.",
        "This score measures evidence strength, not the probability of objective truth."
      ]
    }
  };
}

export function calculateOverallConfidence(
  confidences: Array<{ confidence: number; importance: "high" | "medium" | "low" }>
): number {
  if (confidences.length === 0) return 0;
  const weights = { high: 3, medium: 2, low: 1 } as const;
  const weighted = confidences.reduce(
    (total, item) => total + item.confidence * weights[item.importance],
    0
  );
  const totalWeight = confidences.reduce(
    (total, item) => total + weights[item.importance],
    0
  );
  return clamp(weighted / totalWeight);
}
