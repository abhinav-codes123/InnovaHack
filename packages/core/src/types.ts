export type ResearchStatus =
  | "queued"
  | "planning"
  | "researching"
  | "extracting"
  | "verifying"
  | "scoring"
  | "reporting"
  | "complete"
  | "failed";

export type EvidenceRelation = "supports" | "contradicts" | "neutral";

export type ClaimStatus =
  | "strongly_supported"
  | "supported_with_limitations"
  | "mixed_evidence"
  | "insufficient_evidence"
  | "contradicted_by_stronger_evidence"
  | "context_dependent"
  | "unable_to_determine";

export type SourceKind =
  | "government"
  | "academic"
  | "official"
  | "news"
  | "general";

export interface ResearchScope {
  location: string;
  timePeriod: string;
  population: string;
  assumptions: string[];
}

export interface ResearchTask {
  id: string;
  title: string;
  objective: string;
  sourceKinds: SourceKind[];
  searchQueries: string[];
  status: "pending" | "running" | "complete" | "failed";
  sourceCount: number;
}

export interface Source {
  id: string;
  title: string;
  url: string;
  publisher: string;
  author?: string;
  publishedAt?: string;
  retrievedAt: string;
  kind: SourceKind;
  qualityScore: number;
  qualityReasons: string[];
  independenceGroup: string;
}

export interface Claim {
  id: string;
  text: string;
  subject: string;
  predicate: string;
  value?: string;
  unit?: string;
  timeContext?: string;
  locationContext?: string;
  qualifiers: string[];
  importance: "high" | "medium" | "low";
  status: ClaimStatus;
  confidence: number;
  scoreBreakdown: ScoreBreakdown;
}

export interface EvidenceLink {
  id: string;
  claimId: string;
  sourceId: string;
  excerpt: string;
  relation: EvidenceRelation;
  directness: number;
  contextualMatch: number;
  rationale: string;
}

export interface Contradiction {
  id: string;
  claimId: string;
  supportingEvidenceId: string;
  contradictingEvidenceId: string;
  sameContext: boolean;
  contextDifferences: string[];
  explanation: string;
  impact: "low" | "medium" | "high";
}

export interface ScoreBreakdown {
  sourceQuality: number;
  independentCorroboration: number;
  evidenceDirectness: number;
  completeness: number;
  timeRelevance: number;
  contradictionPenalty: number;
  explanation: string[];
}

export interface AgentEvent {
  id: number;
  runId: string;
  type: "status" | "task" | "metric" | "complete" | "error";
  title: string;
  detail: string;
  status: ResearchStatus;
  createdAt: string;
}

export interface ReportSummary {
  headline: string;
  executiveSummary: string;
  conclusion: string;
  limitations: string[];
  recommendations: string[];
  overallConfidence: number;
}

export interface ResearchRun {
  id: string;
  query: string;
  normalizedQuestion: string;
  mode: "demo" | "live";
  status: ResearchStatus;
  scope: ResearchScope;
  tasks: ResearchTask[];
  sources: Source[];
  claims: Claim[];
  evidence: EvidenceLink[];
  contradictions: Contradiction[];
  events: AgentEvent[];
  report?: ReportSummary;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateResearchRunInput {
  query: string;
  mode: "demo" | "live";
}
