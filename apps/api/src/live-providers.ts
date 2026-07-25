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

const providerScoreSchema = z
  .number()
  .min(0)
  .max(100)
  .describe(
    "A score from 0 to 100, where 100 is strongest. Do not use a 0 to 1 scale."
  );

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
  completeness: providerScoreSchema,
  timeRelevance: providerScoreSchema,
  contextDependent: z.boolean().default(false),
  evidence: z
    .array(
      z.object({
        sourceId: z.string(),
        excerpt: z.string().min(10).max(1_500),
        relation: z.enum(["supports", "contradicts", "neutral"]),
        directness: providerScoreSchema,
        contextualMatch: providerScoreSchema,
        rationale: z.string().min(5).max(500)
      })
    )
    .max(12)
});

export const extractionSchema = z.object({
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

const transientProviderStatuses = new Set([429, 500, 502, 503, 504]);
let preferredGeminiModel: string | undefined;

const wait = async (durationMs: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, durationMs));
};

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) {
      return Math.min(Math.max(seconds * 1_000, 250), 15_000);
    }
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) {
      return Math.min(Math.max(retryAt - Date.now(), 250), 15_000);
    }
  }
  return Math.min(1_000 * 2 ** attempt, 8_000);
}

export async function fetchWithRetry(
  url: string,
  createInit: () => RequestInit,
  maxAttempts = 4
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, createInit());
      if (
        response.ok ||
        !transientProviderStatuses.has(response.status) ||
        attempt === maxAttempts - 1
      ) {
        return response;
      }
      await wait(retryDelayMs(response, attempt));
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts - 1) throw error;
      await wait(Math.min(1_000 * 2 ** attempt, 8_000));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Provider request failed after retries.");
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

export function usesFractionalScoreScale(values: number[]): boolean {
  return values.length > 0 && values.every((value) => value >= 0 && value <= 1);
}

export function normalizeProviderScore(
  value: number,
  usesFractionalScale: boolean
): number {
  return usesFractionalScale ? value * 100 : value;
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

const supportedJsonSchemaKeys = new Set([
  "$id",
  "$defs",
  "$ref",
  "$anchor",
  "type",
  "format",
  "title",
  "description",
  "enum",
  "items",
  "prefixItems",
  "anyOf",
  "oneOf",
  "properties",
  "required",
  "propertyOrdering"
]);

export function toGeminiJsonSchema(schema: z.ZodType): unknown {
  const sanitize = (value: unknown, preserveKeys = false): unknown => {
    if (Array.isArray(value)) return value.map((item) => sanitize(item));
    if (!value || typeof value !== "object") return value;

    return Object.fromEntries(
      Object.entries(value).flatMap(([key, child]) => {
        if (!preserveKeys && !supportedJsonSchemaKeys.has(key)) return [];
        return [
          [
            key,
            sanitize(
              child,
              key === "properties" || key === "$defs"
            )
          ]
        ];
      })
    );
  };

  return sanitize(z.toJSONSchema(schema));
}

async function providerFailure(
  provider: string,
  response: Response,
  secrets: string[] = []
): Promise<Error> {
  let detail: string;
  try {
    const payload = (await response.clone().json()) as {
      error?: {
        message?: string;
        status?: string;
        details?: unknown[];
      };
      message?: string;
    };
    detail = payload.error?.message ?? payload.message ?? "";
    if (payload.error?.status) {
      detail += ` Status: ${payload.error.status}.`;
    }
    if (payload.error?.details?.length) {
      detail += ` Details: ${JSON.stringify(payload.error.details)}`;
    }
  } catch {
    detail = await response.text();
  }

  let sanitized = detail.replace(/\s+/g, " ").trim().slice(0, 500);
  for (const secret of secrets) {
    if (secret) sanitized = sanitized.replaceAll(secret, "[redacted]");
  }
  sanitized = sanitized
    .replace(/AIza[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/sk-or-[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/tvly-[A-Za-z0-9_-]+/g, "[redacted]");

  return new Error(
    `${provider} request failed with status ${response.status}${
      sanitized ? `: ${sanitized}` : ""
    }.`
  );
}

class ModelProvider {
  constructor(private readonly config: AppConfig) {}

  async generate<T>(
    schema: z.ZodType<T>,
    system: string,
    user: string
  ): Promise<T> {
    let repairInstruction = "";
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const currentUser = repairInstruction
        ? `${user}\n\n${repairInstruction}`
        : user;
      const text = this.config.GEMINI_API_KEY
        ? await this.generateWithGemini(
            system,
            currentUser,
            toGeminiJsonSchema(schema)
          )
        : await this.generateWithOpenRouter(system, currentUser);
      try {
        return schema.parse(extractJson(text));
      } catch (error) {
        lastError = error;
        if (attempt === 1) throw error;
        const validationMessage =
          error instanceof z.ZodError
            ? JSON.stringify(
                error.issues.map((issue) => ({
                  path: issue.path.join("."),
                  message: issue.message
                }))
              )
            : error instanceof Error
              ? error.message
              : "The response was not valid JSON.";
        repairInstruction = [
          "Regenerate the entire JSON response.",
          "The previous response failed local validation:",
          validationMessage.slice(0, 1_500),
          "Follow every requested count, length, and field constraint."
        ].join("\n");
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("The model did not return valid structured output.");
  }

  private async generateWithGemini(
    system: string,
    user: string,
    responseJsonSchema: unknown
  ): Promise<string> {
    const key = this.config.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is not configured.");
    const models = [
      ...new Set([
        ...(preferredGeminiModel ? [preferredGeminiModel] : []),
        this.config.GEMINI_MODEL,
        ...this.config.GEMINI_FALLBACK_MODELS
      ])
    ];

    for (const [modelIndex, modelName] of models.entries()) {
      const model = encodeURIComponent(modelName);
      const response = await fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        () => ({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: user }] }],
            generationConfig: {
              responseMimeType: "application/json",
              responseJsonSchema
            }
          }),
          signal: AbortSignal.timeout(45_000)
        })
      );
      const hasFallback = modelIndex < models.length - 1;
      if (!response.ok) {
        if (hasFallback && [404, 429, 503].includes(response.status)) continue;
        throw await providerFailure(`Gemini (${modelName})`, response, [key]);
      }
      const body = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };
      const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        preferredGeminiModel = modelName;
        return text;
      }
      if (!hasFallback) throw new Error(`Gemini (${modelName}) returned no content.`);
    }
    throw new Error("All configured Gemini models failed.");
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
    const response = await fetchWithRetry(
      "https://openrouter.ai/api/v1/chat/completions",
      () => ({
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
      })
    );
    if (!response.ok) {
      throw await providerFailure("OpenRouter", response, [key]);
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
    const response = await fetchWithRetry("https://api.tavily.com/search", () => ({
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
    }));
    if (!response.ok) {
      throw await providerFailure("Tavily", response, [this.apiKey]);
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

function hostnameMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

const academicDomains = [
  "arxiv.org",
  "bmj.com",
  "cochrane.org",
  "doi.org",
  "frontiersin.org",
  "jamanetwork.com",
  "nature.com",
  "nejm.org",
  "ncbi.nlm.nih.gov",
  "plos.org",
  "sciencedirect.com",
  "springer.com",
  "thelancet.com"
];

const officialDomains = [
  "iea.org",
  "oecd.org",
  "un.org",
  "who.int",
  "worldbank.org"
];

export function inferSourceKind(url: string): SourceKind {
  const hostname = new URL(url).hostname.toLowerCase();
  if (academicDomains.some((domain) => hostnameMatches(hostname, domain))) {
    return "academic";
  }
  if (
    hostname.endsWith(".gov") ||
    hostname.includes(".gov.") ||
    hostnameMatches(hostname, "europa.eu")
  )
    return "government";
  if (
    hostname.endsWith(".edu") ||
    academicDomains.some((domain) => hostnameMatches(hostname, domain))
  )
    return "academic";
  if (
    hostnameMatches(hostname, "reuters.com") ||
    hostnameMatches(hostname, "apnews.com") ||
    hostnameMatches(hostname, "bbc.com") ||
    hostnameMatches(hostname, "bbc.co.uk")
  )
    return "news";
  if (officialDomains.some((domain) => hostnameMatches(hostname, domain))) {
    return "official";
  }
  return "general";
}

export function hasMethodologySignal(content: string): boolean {
  const sample = content.slice(0, 20_000);
  return (
    /(?:^|\n)\s{0,3}(?:#{1,4}\s*)?(?:materials and )?methods?(?:ology)?\s*(?:\n|:)/im.test(
      sample
    ) ||
    /\b(?:randomi[sz]ed controlled trial|systematic review|meta-analysis|study design|participants were|we (?:analysed|analyzed|examined|estimated))\b/i.test(
      sample
    )
  );
}

export function canonicalSourceTitle(title: string): string {
  return normalizeEvidence(title)
    .replace(/\b(?:full text|pmc|pubmed|review)\b/g, " ")
    .replace(/\s*[-|:]\s*(?:cochrane|springer|wiley|elsevier)\s*$/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function requiresProfessionalAdviceBoundary(question: string): boolean {
  return /\b(?:diagnos(?:e|is)|disease|drug|health|legal|law|lawsuit|medical|medicine|medication|supplement|tax|treatment)\b/i.test(
    question
  );
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
        "Return JSON only. Create between 2 and 6 independent, bounded research tasks.",
        "Each task must include between 1 and 3 focused search queries.",
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
      const hasMethodology = hasMethodologySignal(result.content);
      const quality = assessSourceQuality({
        kind,
        isPrimary: kind === "government" || kind === "official",
        hasNamedAuthor: false,
        hasMethodology,
        hasPublicationDate: Boolean(result.publishedAt),
        topicRelevance: result.score
      });
      const contentGroup = createHash("sha256")
        .update(canonicalSourceTitle(result.title))
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
    const selectedDocuments = [...documents]
      .sort(
        (left, right) =>
          right.source.qualityScore - left.source.qualityScore
      )
      .slice(0, 12);
    const sourcePacket = selectedDocuments
      .map(
        ({ source, content }) =>
          `SOURCE_ID: ${source.id}\nTITLE: ${source.title}\nURL: ${source.url}\nSOURCE_KIND: ${source.kind}\nQUALITY_SCORE: ${source.qualityScore}\nINDEPENDENCE_GROUP: ${source.independenceGroup}\nCONTENT:\n${content.slice(0, 6_000)}`
      )
      .join("\n\n---\n\n");
    const extraction = await this.model.generate(
      extractionSchema,
      [
        "You extract atomic factual claims and map them to evidence.",
        "Use only the supplied sources. Evidence excerpts must be exact contiguous quotations from CONTENT.",
        "Never invent a source ID or quotation. Separate lack of evidence from contradiction.",
        "For each material claim, include exact evidence from 2 to 4 independent sources when available, preferring government, official, and peer-reviewed academic sources with higher quality scores.",
        "Sources with the same INDEPENDENCE_GROUP are duplicate publications and must count as one source; prefer the highest-quality copy.",
        "Do not treat the absence of evidence as proof that something did not happen.",
        "When no direct evidence exists, phrase the claim as 'No verifiable evidence was found that ...' and leave its evidence array empty.",
        "Return JSON only."
      ].join(" "),
      `QUESTION:\n${question}\n\nSOURCES:\n${sourcePacket}`
    );
    const providerScores = extraction.claims.flatMap((candidate) => [
      candidate.completeness,
      candidate.timeRelevance,
      ...candidate.evidence.flatMap((item) => [
        item.directness,
        item.contextualMatch
      ])
    ]);
    const usesFractionalScale = usesFractionalScoreScale(providerScores);

    const documentBySourceId = new Map(
      selectedDocuments.map((document) => [document.source.id, document])
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
          directness: normalizeProviderScore(
            item.directness,
            usesFractionalScale
          ),
          contextualMatch: normalizeProviderScore(
            item.contextualMatch,
            usesFractionalScale
          ),
          rationale: item.rationale
        };
        evidence.push(link);
        return [link];
      });
      const result = scoreClaim({
        evidence: validEvidence,
        sources: selectedDocuments.map((document) => document.source),
        completeness: normalizeProviderScore(
          candidate.completeness,
          usesFractionalScale
        ),
        timeRelevance: normalizeProviderScore(
          candidate.timeRelevance,
          usesFractionalScale
        ),
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
      evidence: evidence
        .filter((item) => item.claimId === claim.id)
        .map((item) => {
          const source = documentBySourceId.get(item.sourceId)?.source;
          return {
            relation: item.relation,
            sourceTitle: source?.title,
            sourceKind: source?.kind,
            sourceQuality: source?.qualityScore
          };
        })
    }));
    const report = await this.model.generate(
      reportSchema,
      [
        "You synthesize a research report using only the supplied verified claims.",
        "Answer the user's question directly in the headline, executive summary, and conclusion.",
        "Do not introduce new factual claims. Express uncertainty explicitly.",
        "Limitations must be specific to missing evidence, source quality, scope, or context; never use vague boilerplate.",
        "Recommendations must be concrete and useful. Return an empty recommendations array when no action or further investigation is warranted.",
        "Do not give prescriptive medical, legal, or financial advice.",
        "Return JSON only."
      ].join(" "),
      `QUESTION:\n${question}\n\nVERIFIED CLAIMS:\n${JSON.stringify(reportInput, null, 2)}`
    );

    return {
      sources: selectedDocuments.map((document) => document.source),
      claims,
      evidence,
      contradictions,
      report: {
        ...report,
        recommendations: requiresProfessionalAdviceBoundary(question)
          ? []
          : report.recommendations,
        overallConfidence: calculateOverallConfidence(claims)
      }
    };
  }
}
