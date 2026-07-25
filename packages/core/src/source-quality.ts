import type { SourceKind } from "./types.js";

export interface SourceQualityInput {
  kind: SourceKind;
  isPrimary: boolean;
  hasNamedAuthor: boolean;
  hasMethodology: boolean;
  hasPublicationDate: boolean;
  topicRelevance: number;
}

export function assessSourceQuality(input: SourceQualityInput): {
  score: number;
  reasons: string[];
} {
  const kindBaseline: Record<SourceKind, number> = {
    government: 22,
    academic: 24,
    official: 18,
    news: 16,
    general: 9
  };
  const reasons: string[] = [];
  let score = kindBaseline[input.kind];

  if (input.isPrimary) {
    score += 22;
    reasons.push("Primary evidence or first-party dataset.");
  }
  if (input.hasNamedAuthor) {
    score += 10;
    reasons.push("Named author or responsible organization.");
  }
  if (input.hasMethodology) {
    score += 18;
    reasons.push("Methodology or evidence basis is available.");
  }
  if (input.hasPublicationDate) {
    score += 8;
    reasons.push("Publication date is available.");
  }
  score += Math.round(Math.min(100, Math.max(0, input.topicRelevance)) * 0.16);
  reasons.push(`Topic relevance assessed at ${input.topicRelevance}/100.`);

  return { score: Math.min(100, score), reasons };
}
