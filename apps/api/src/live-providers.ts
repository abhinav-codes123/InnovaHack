import {
  assessSourceQuality,
  calculateOverallConfidence,
  scoreClaim,
  type Claim,
  type Contradiction,
  type EvidenceLink,
  type ReportSummary,
  type ResearchScope,
  type ResearchTask,
  type Source,
  type SourceKind
} from "@verifact/core";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { AppConfig } from "./config.js";

const planSchema = z.object({
  normalizedQuestion: z.string().min(10),
  scope: z.object({
    location: z.string().min(1),
    timePeriod: z.string().min(1),
    population: z.string().min(1),
    assumptions: z.array(z.string()).max(8)
  }),
  tasks: z
    .array(
      z.object({
        title: z.string().min(2),
        objective: z.string().min(10),
        sourceKinds: z
          .array(
            z.enum(["government", "academic", "official", "news", "general"])
          )
          .min(1),
        searchQueries: z.array(z.string().min(5)).min(1).max(3)
      })
    )
    .min(2)
    .max(6)
});

const extractedClaimSchema = z.object({
  text: z.string().min(10),
  subject: z.string().min(1),
  predicate: z.string().min(1),
  value: z.string().optional(),
  unit: z.string().optional(),
  timeContext: z.string().optional(),
  locationContext: z.string().optional(),
  qualifiers: z.array(z.string()).max(8),
  importance: z.enum(["high", "medium", "low"]),
  completeness: z.number().min(0).max(100),
  timeRelevance: z.number().min(0).max(100),
  contextDependent: z.boolean().default(false),
  evidence: z
    .array(
      z.object({
        sourceId: z.string(),
        excerpt: z.string().min(10).max(1_500),
        relation: z.enum(["supports", "contradicts", "neutral"]),
        directness: z.number().min(0).max(100),
        contextualMatch: z.number().min(0).max(100),
        rationale: z.string().min(5).max(500)
      })
    )
    .max(12)
});

const extractionSchema = z.object({
  claims: z.array(extractedClaimSchema).min(1).max(12)
});

const reportSchema = z.object({
  headline: z.string().min(10).max(300),
  executiveSummary: z.string().min(50).max(2_500),
  conclusion: z.string().min(50).max(2_500),
  limitations: z.array(z.string()).min(1).max(8),
  recommendations: z.array(z.string()).max(8)
});

interface SearchResult {
  title: string;
  url: string;
  content: string;
  publishedAt?: string;
  score: number;
}

interface SourceDocument {
  source: Source;
  content: string;
}

export interface LivePlan {
  normalizedQuestion: string;
  scope: ResearchScope;
  tasks: ResearchTask[];
}

export interface LiveVerification {
  sources: Source[];
  claims: Claim[];
  evidence: EvidenceLink[];
  contradictions: Contradiction[];
  report: ReportSummary;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("The model did not return a JSON object.");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

class ModelProvider {
  constructor(private readonly config: AppConfig) {}

  async generate<T>(
    schema: z.ZodType<T>,
    system: string,
    user: string
  ): Promise<T> {
    const text = this.config.GEMINI_API_KEY
      ? await this.generateWithGemini(system, user)
      : await this.generateWithOpenRouter(system, user);
    return schema.parse(extractJson(text));
  }

  private async generateWithGemini(
    system: string,
    user: string
  ): Promise<string> {
    const key = this.config.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is not configured.");
    const model = encodeURIComponent(this.config.GEMINI_MODEL);
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1
          }
        }),
        signal: AbortSignal.timeout(45_000)
      }
    );
    if (!response.ok) {
      throw new Error(`Gemini request failed with status ${response.status}.`);
    }
    const body = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini returned no content.");
    return text;
  }

  private async generateWithOpenRouter(
    system: string,
    user: string
  ): Promise<string> {
    const key = this.config.OPENROUTER_API_KEY;
    const model = this.config.OPENROUTER_MODEL;
    if (!key || !model) {
      throw new Error(
        "OPENROUTER_API_KEY and OPENROUTER_MODEL must both be configured."
      );
    }
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "X-Title": "VeriFact AI"
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      }),
      signal: AbortSignal.timeout(45_000)
    });
    if (!response.ok) {
      throw new Error(
        `OpenRouter request failed with status ${response.status}.`
      );
    }
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = body.choices?.[0]?.message?.content;
    if (!text) throw new Error("OpenRouter returned no content.");
    return text;
  }
}

class TavilyProvider {
  constructor(private readonly apiKey: string) {}

  async search(query: string): Promise<SearchResult[]> {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: this.apiKey,
        query,
        search_depth: "advanced",
        max_results: 5,
        include_raw_content: "markdown",
        include_answer: false
      }),
      signal: AbortSignal.timeout(30_000)
    });
    if (!response.ok) {
      throw new Error(`Tavily request failed with status ${response.status}.`);
    }
    const body = (await response.json()) as {
      results?: Array<{
        title?: string;
        url?: string;
        content?: string;
        raw_content?: string;
        published_date?: string;
        score?: number;
      }>;
    };
    return (body.results ?? []).flatMap((result) => {
      if (!result.title || !result.url) return [];
      const content = result.raw_content || result.content;
      if (!content || content.length < 40) return [];
      return [
        {
          title: result.title,
          url: result.url,
          content: content.slice(0, 30_000),
          score: Math.round((result.score ?? 0.5) * 100),
          ...(result.published_date
            ? { publishedAt: result.published_date }
            : {})
        }
      ];
    });
  }
}

function inferSourceKind(url: string): SourceKind {
  const hostname = new URL(url).hostname.toLowerCase();
  if (hostname.endsWith(".gov") || hostname.includes(".gov.")) return "government";
  if (
    hostname.endsWith(".edu") ||
    hostname.includes("arxiv.org") ||
    hostname.includes("nature.com") ||
    hostname.includes("sciencedirect.com") ||
    hostname.includes("springer.com")
  )
    return "academic";
  if (
    hostname.includes("reuters.com") ||
    hostname.includes("apnews.com") ||
    hostname.includes("bbc.")
  )
    return "news";
  if (hostname.endsWith(".org")) return "official";
  return "general";
}

function sourceId(url: string): string {
  return `source-${createHash("sha256").update(url).digest("hex").slice(0, 12)}`;
}

function normalizeEvidence(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function makeContradictions(
  claims: Claim[],
  evidence: EvidenceLink[]
): Contradiction[] {
  return claims.flatMap((claim) => {
    const claimEvidence = evidence.filter((item) => item.claimId === claim.id);
    const support = claimEvidence.find((item) => item.relation === "supports");
    const contradiction = claimEvidence.find(
      (item) => item.relation === "contradicts"
    );
    if (!support || !contradiction) return [];
    return [
      {
        id: `contradiction-${claim.id}`,
        claimId: claim.id,
        supportingEvidenceId: support.id,
        contradictingEvidenceId: contradiction.id,
        sameContext: claim.status !== "context_dependent",
        contextDifferences:
          claim.status === "context_dependent"
            ? ["The compared evidence uses different stated contexts."]
            : [],
        explanation:
          claim.status === "context_dependent"
            ? "Support and counterevidence were both found, but their stated contexts differ."
            : "Credible evidence both supports and contradicts this atomic claim.",
        impact: claim.importance === "high" ? "high" : "medium"
      }
    ];
  });
}

export class LiveResearchProvider {
  private readonly model: ModelProvider;
  private readonly search: TavilyProvider;

  constructor(private readonly config: AppConfig) {
    if (!config.TAVILY_API_KEY) {
      throw new Error("TAVILY_API_KEY is not configured.");
    }
    this.model = new ModelProvider(config);
    this.search = new TavilyProvider(config.TAVILY_API_KEY);
  }

  async plan(query: string): Promise<LivePlan> {
    const plan = await this.model.generate(
      planSchema,
      [
        "You are the research planner for an evidence-verification system.",
        "Return JSON only. Decompose the question into independent, bounded research tasks.",
        "State assumptions explicitly. Do not answer the question."
      ].join(" "),
      `Create a research plan for this question:\n${query}`
    );
    return {
      normalizedQuestion: plan.normalizedQuestion,
      scope: plan.scope,
      tasks: plan.tasks.map((task) => ({
        id: randomUUID(),
        title: task.title,
        objective: task.objective,
        sourceKinds: task.sourceKinds,
        searchQueries: task.searchQueries,
        status: "pending",
        sourceCount: 0
      }))
    };
  }

  async research(tasks: ResearchTask[]): Promise<SourceDocument[]> {
    const queryResults = await Promise.allSettled(
      tasks.flatMap((task) =>
        task.searchQueries.map(async (query) => ({
          taskId: task.id,
          results: await this.search.search(query)
        }))
      )
    );
    const unique = new Map<string, SearchResult>();
    for (const result of queryResults) {
      if (result.status !== "fulfilled") continue;
      for (const source of result.value.results) {
        if (!unique.has(source.url)) unique.set(source.url, source);
      }
    }

    return [...unique.values()].map((result) => {
      const kind = inferSourceKind(result.url);
      const hostname = new URL(result.url).hostname;
      const quality = assessSourceQuality({
        kind,
        isPrimary: kind === "government" || kind === "academic",
        hasNamedAuthor: false,
        hasMethodology: kind === "academic",
        hasPublicationDate: Boolean(result.publishedAt),
        topicRelevance: result.score
      });
      const contentGroup = createHash("sha256")
        .update(normalizeEvidence(result.content).slice(0, 1_000))
        .digest("hex")
        .slice(0, 12);
      return {
        source: {
          id: sourceId(result.url),
          title: result.title,
          url: result.url,
          publisher: hostname.replace(/^www\./, ""),
          ...(result.publishedAt ? { publishedAt: result.publishedAt } : {}),
          retrievedAt: new Date().toISOString(),
          kind,
          qualityScore: quality.score,
          qualityReasons: quality.reasons,
          independenceGroup: contentGroup
        },
        content: result.content
      };
    });
  }

  async verify(
    question: string,
    documents: SourceDocument[]
  ): Promise<LiveVerification> {
    if (documents.length === 0) {
      throw new Error("No retrievable source documents were collected.");
    }
    const sourcePacket = documents
      .slice(0, 20)
      .map(
        ({ source, content }) =>
          `SOURCE_ID: ${source.id}\nTITLE: ${source.title}\nURL: ${source.url}\nCONTENT:\n${content.slice(0, 12_000)}`
      )
      .join("\n\n---\n\n");
    const extraction = await this.model.generate(
      extractionSchema,
      [
        "You extract atomic factual claims and map them to evidence.",
        "Use only the supplied sources. Evidence excerpts must be exact contiguous quotations from CONTENT.",
        "Never invent a source ID or quotation. Separate lack of evidence from contradiction.",
        "Return JSON only."
      ].join(" "),
      `QUESTION:\n${question}\n\nSOURCES:\n${sourcePacket}`
    );

    const documentBySourceId = new Map(
      documents.map((document) => [document.source.id, document])
    );
    const evidence: EvidenceLink[] = [];
    const claims: Claim[] = extraction.claims.map((candidate, claimIndex) => {
      const id = `claim-${claimIndex + 1}`;
      const validEvidence = candidate.evidence.flatMap((item) => {
        const document = documentBySourceId.get(item.sourceId);
        if (!document) return [];
        if (
          !normalizeEvidence(document.content).includes(
            normalizeEvidence(item.excerpt)
          )
        )
          return [];
        const link: EvidenceLink = {
          id: `evidence-${claimIndex + 1}-${evidence.length + 1}`,
          claimId: id,
          sourceId: item.sourceId,
          excerpt: item.excerpt,
          relation: item.relation,
          directness: item.directness,
          contextualMatch: item.contextualMatch,
          rationale: item.rationale
        };
        evidence.push(link);
        return [link];
      });
      const result = scoreClaim({
        evidence: validEvidence,
        sources: documents.map((document) => document.source),
        completeness: candidate.completeness,
        timeRelevance: candidate.timeRelevance,
        contextDependent: candidate.contextDependent
      });
      return {
        id,
        text: candidate.text,
        subject: candidate.subject,
        predicate: candidate.predicate,
        ...(candidate.value ? { value: candidate.value } : {}),
        ...(candidate.unit ? { unit: candidate.unit } : {}),
        ...(candidate.timeContext
          ? { timeContext: candidate.timeContext }
          : {}),
        ...(candidate.locationContext
          ? { locationContext: candidate.locationContext }
          : {}),
        qualifiers: candidate.qualifiers,
        importance: candidate.importance,
        confidence: result.confidence,
        status: result.status,
        scoreBreakdown: result.breakdown
      };
    });

    const contradictions = makeContradictions(claims, evidence);
    const reportInput = claims.map((claim) => ({
      id: claim.id,
      text: claim.text,
      status: claim.status,
      confidence: claim.confidence,
      evidenceCount: evidence.filter((item) => item.claimId === claim.id).length
    }));
    const report = await this.model.generate(
      reportSchema,
      [
        "You synthesize a research report using only the supplied verified claims.",
        "Do not introduce new factual claims. Express uncertainty explicitly.",
        "Return JSON only."
      ].join(" "),
      `QUESTION:\n${question}\n\nVERIFIED CLAIMS:\n${JSON.stringify(reportInput, null, 2)}`
    );

    return {
      sources: documents.map((document) => document.source),
      claims,
      evidence,
      contradictions,
      report: {
        ...report,
        overallConfidence: calculateOverallConfidence(claims)
      }
    };
  }
}
